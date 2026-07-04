import { getAccessToken } from "./oauth-helper.ts"

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

function getGoogleCloudProjectId(): string | undefined {
  const explicitProjectId = Deno.env.get('GOOGLE_CLOUD_PROJECT') || Deno.env.get('GCP_PROJECT_ID')
  if (explicitProjectId) return explicitProjectId

  const credentialsJson = Deno.env.get('GEMINI_SERVICE_ACCOUNT_CREDENTIALS')
  if (!credentialsJson) return undefined

  try {
    const credentials = JSON.parse(credentialsJson) as { project_id?: string }
    return credentials.project_id
  } catch {
    return undefined
  }
}

export function getGeminiTextModel(): string {
  return Deno.env.get('GEMINI_TEXT_MODEL') || 'gemini-2.0-flash'
}

export async function createGeminiInteraction(body: Record<string, unknown>): Promise<Response> {
  const accessToken = await getAccessToken()
  const projectId = getGoogleCloudProjectId()
  const model = body.model as string || getGeminiTextModel()
  const stream = body.stream === true

  // Build the standard generateContent request body
  const systemInstruction = body.system_instruction
  const input = body.input as string
  const generationConfig = body.generation_config

  const requestBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: input }] }],
    ...(generationConfig ? { generationConfig } : {}),
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
  }

  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
  const url = `${GEMINI_BASE_URL}/${model}:${action}`

  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(projectId ? { 'x-goog-user-project': projectId } : {}),
    },
    body: JSON.stringify(requestBody),
  })
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
