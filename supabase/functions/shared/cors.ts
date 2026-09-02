/**
 * CORS helpers for StudyPilot Edge Functions.
 *
 * Allowed origins:
 *   - https://studypilot.app          (production dashboard)
 *   - https://*.studypilot.ai         (preview / staging deployments)
 *   - http://localhost:*              (local dev)
 *   - http://127.0.0.1:*             (local dev)
 *   - chrome-extension://*           (Chrome extension — ID varies by install)
 *
 * For chrome-extension:// origins we reflect the request Origin back rather
 * than using a static allowlist, because the extension ID differs between
 * development builds and the published store version. The Bearer JWT check
 * in every function is the real auth guard — CORS is defence-in-depth for
 * browser requests.
 *
 * Usage:
 *   import { buildCorsHeaders, handleOptions } from "../shared/cors.ts"
 *
 *   serve(async (req) => {
 *     const cors = buildCorsHeaders(req)
 *     if (req.method === "OPTIONS") return handleOptions(cors)
 *     // ... handler logic ...
 *     return new Response(JSON.stringify(body), {
 *       headers: { ...cors, "Content-Type": "application/json" },
 *     })
 *   })
 */

const ALLOWED_ORIGINS: readonly RegExp[] = [
  /^https:\/\/studypilot\.app$/,
  /^https:\/\/[^.]+\.studypilot\.ai$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^chrome-extension:\/\//,
]

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.some((re) => re.test(origin))
}

/**
 * Build CORS response headers for the given request.
 * Returns an object safe to spread into any Response headers.
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? ""
  const allowedOrigin = isAllowedOrigin(origin) ? origin : "https://studypilot.app"

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

/**
 * Respond to a CORS preflight OPTIONS request.
 */
export function handleOptions(corsHeaders: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}
