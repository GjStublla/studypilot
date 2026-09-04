import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  DEFAULT_LIVE_MODEL,
  DEFAULT_TEXT_MODEL,
  normalizeGeminiModelId,
} from "./gemini-api.ts"

Deno.test("normalizeGeminiModelId keeps gemini-2.5-flash", () => {
  assertEquals(normalizeGeminiModelId("gemini-2.5-flash"), "gemini-2.5-flash")
  assertEquals(
    normalizeGeminiModelId("models/gemini-2.5-flash"),
    "gemini-2.5-flash",
  )
})

Deno.test("normalizeGeminiModelId keeps Live preview id", () => {
  assertEquals(
    normalizeGeminiModelId("gemini-3.1-flash-live-preview"),
    "gemini-3.1-flash-live-preview",
  )
})

Deno.test("normalizeGeminiModelId remaps retired 1.5 and 2.0 ids", () => {
  assertEquals(
    normalizeGeminiModelId("gemini-1.5-flash"),
    DEFAULT_TEXT_MODEL,
  )
  assertEquals(normalizeGeminiModelId("gemini-2.0-flash"), DEFAULT_TEXT_MODEL)
  assertEquals(DEFAULT_TEXT_MODEL, "gemini-2.5-flash")
  assertEquals(DEFAULT_LIVE_MODEL, "gemini-3.1-flash-live-preview")
})

Deno.test("normalizeGeminiModelId remaps unavailable 3.6 alias", () => {
  assertEquals(
    normalizeGeminiModelId("gemini-3.6-flash"),
    "gemini-2.5-flash",
  )
})

Deno.test("normalizeGeminiModelId does not rewrite 3-flash-preview", () => {
  assertEquals(
    normalizeGeminiModelId("gemini-3-flash-preview"),
    "gemini-3-flash-preview",
  )
})
