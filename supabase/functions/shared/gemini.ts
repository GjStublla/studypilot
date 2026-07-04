import { getAccessToken } from "./oauth-helper.ts"

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'

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
  return Deno.env.get('GEMINI_TEXT_MODEL') || 'gemini-3.5-flash'
}

export async function createGeminiInteraction(body: Record<string, unknown>): Promise<Response> {
  const accessToken = await getAccessToken()
  const projectId = getGoogleCloudProjectId()

  return fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Api-Revision': '2026-05-20',
      ...(projectId ? { 'x-goog-user-project': projectId } : {}),
    },
    body: JSON.stringify(body),
  })
}

function collectText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''

  if (Array.isArray(value)) {
    return value.map(collectText).join('')
  }

  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  if (typeof record.output_text === 'string') return record.output_text
  if (typeof record.outputText === 'string') return record.outputText

  return [
    collectText(record.content),
    collectText(record.parts),
    collectText(record.delta),
    collectText(record.step),
    collectText(record.steps),
  ].join('')
}

export function extractInteractionText(interaction: unknown): string {
  if (!interaction || typeof interaction !== 'object') return ''

  const record = interaction as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text
  if (typeof record.outputText === 'string') return record.outputText

  const steps = Array.isArray(record.steps) ? record.steps : []
  const modelOutputSteps = steps.filter((step) => {
    const stepRecord = step as Record<string, unknown>
    const nestedStep = stepRecord.step as Record<string, unknown> | undefined
    return stepRecord.type === 'model_output' || nestedStep?.type === 'model_output'
  })

  const preferredSteps = modelOutputSteps.length > 0 ? modelOutputSteps : steps
  return collectText(preferredSteps).trim()
}
