import { getAccessToken, getGoogleProjectId, invalidateToken } from "./oauth-helper.ts"

const GENERATIVE_LANGUAGE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export function getGeminiTextModel(): string {
  return Deno.env.get('GEMINI_TEXT_MODEL') || 'gemini-2.0-flash'
}

export async function createGeminiInteraction(body: Record<string, unknown>): Promise<Response> {
  const stream = body.stream === true

  // Build the standard generateContent request body (identical shape for
  // Vertex AI and the Generative Language API)
  const systemInstruction = body.system_instruction
  const input = body.input as string
  const generationConfig = body.generation_config

  const requestBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: input }] }],
    ...(generationConfig ? { generationConfig } : {}),
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
  }

  // Vertex AI (aiplatform.googleapis.com) is the primary endpoint: it is
  // enabled in the GCP project, while generativelanguage.googleapis.com is
  // not (403 SERVICE_DISABLED). Vertex URLs embed a project id, so fall back
  // to the Generative Language API when none is configured.
  const projectId = getGoogleProjectId()
  const useVertex = Boolean(projectId)

  // On Vertex, VERTEX_MODEL (when set) wins over the caller's model: it names
  // a model verified to serve in this project/region.
  const model =
    (useVertex ? Deno.env.get('VERTEX_MODEL') : undefined) ||
    (body.model as string) ||
    getGeminiTextModel()

  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'

  let url: string
  if (useVertex) {
    const location = Deno.env.get('VERTEX_LOCATION') || 'us-central1'
    const host = location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`
    url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${action}`
  } else {
    url = `${GENERATIVE_LANGUAGE_BASE_URL}/${model}:${action}`
  }

  // Vertex reads the project from the URL; the x-goog-user-project quota
  // header only applies to the Generative Language API.
  const doFetch = async (includeQuotaProject: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
        ...(includeQuotaProject && projectId ? { 'x-goog-user-project': projectId } : {}),
      },
      body: JSON.stringify(requestBody),
    })

  let response = await doFetch(!useVertex)

  // The cached service-account token can outlive its validity in a warm
  // isolate; on 401 mint a fresh token and retry once.
  if (response.status === 401) {
    invalidateToken()
    response = await doFetch(!useVertex)
  }

  // Google rejects x-goog-user-project unless the caller holds
  // serviceusage.services.use on that project. A service account already
  // bills its own project by default, so retry without the header.
  if (!useVertex && response.status === 403 && projectId) {
    const errText = await response.clone().text()
    if (errText.includes('USER_PROJECT_DENIED') || errText.includes('serviceusage.services.use')) {
      console.warn('[gemini] x-goog-user-project rejected; retrying without quota project header')
      response = await doFetch(false)
    }
  }

  return response
}

// Pull the machine-readable status/reason out of a Gemini error body so
// callers can show "403 PERMISSION_DENIED/SERVICE_DISABLED" instead of a
// bare status code.
export function describeGeminiError(errText: string): string {
  try {
    const parsed = JSON.parse(errText) as {
      error?: { status?: string; details?: Array<{ reason?: string }> }
    }
    const status = parsed.error?.status ?? ''
    const reason = parsed.error?.details?.find(d => typeof d?.reason === 'string')?.reason ?? ''
    return [status, reason].filter(Boolean).join('/')
  } catch {
    return ''
  }
}

function collectText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''

  if (Array.isArray(value)) {
    return value.map(collectText).join('')
  }

  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text

  return [
    collectText(record.content),
    collectText(record.parts),
  ].join('')
}

export function extractInteractionText(response: unknown): string {
  if (!response || typeof response !== 'object') return ''

  const record = response as Record<string, unknown>

  // Real Gemini generateContent response:
  // { "candidates": [{ "content": { "parts": [{ "text": "..." }] } }] }
  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  if (candidates.length > 0) {
    return candidates
      .map((c: any) => collectText(c?.content))
      .join('')
      .trim()
  }

  return ''
}
