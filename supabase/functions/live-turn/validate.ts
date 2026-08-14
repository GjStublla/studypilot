/**
 * live-turn input rules — must match commit_live_turn (both texts required).
 */

export function parseLiveTurnTexts(
  userText: unknown,
  assistantText: unknown,
): { ok: true; userText: string; assistantText: string } | { ok: false; error: string } {
  const user = typeof userText === "string" ? userText.trim() : ""
  const assistant = typeof assistantText === "string" ? assistantText.trim() : ""
  if (!user || !assistant) {
    return { ok: false, error: "userText and assistantText are both required" }
  }
  return { ok: true, userText: user, assistantText: assistant }
}

export function liveTurnRpcHttpStatus(error: {
  code?: string
  message?: string
}): number {
  if (error.code === "P0002") return 404
  if (error.code === "22023") return 400
  if (error.code === "23514") return 409
  if (/texts are required/i.test(error.message ?? "")) return 400
  return 503
}
