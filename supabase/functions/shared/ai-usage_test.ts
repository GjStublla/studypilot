import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  consumeAiRequest,
  limitReachedMessage,
  QUOTA_UNAVAILABLE_MESSAGE,
  shouldBypassAiUsageLimits,
  type AiUsageDbClient,
  type AiUsageResult,
} from "./ai-usage.ts"

type RpcResult = { data: unknown; error: unknown }

function fakeDb(result: RpcResult | (() => RpcResult) | (() => never)): AiUsageDbClient {
  return {
    rpc: async () => {
      if (typeof result === "function") {
        return result()
      }
      return result
    },
  }
}

Deno.test("local AI usage bypass requires an explicit flag and a local runtime", () => {
  assertEquals(
    shouldBypassAiUsageLimits({
      disabled: "true",
      supabaseUrl: "http://127.0.0.1:54321",
    }),
    true,
  )
  assertEquals(
    shouldBypassAiUsageLimits({
      disabled: "true",
      supabaseUrl: "http://kong:8000",
    }),
    true,
  )
  assertEquals(
    shouldBypassAiUsageLimits({
      disabled: "true",
      supabaseUrl: "https://project.supabase.co",
    }),
    false,
  )
  assertEquals(
    shouldBypassAiUsageLimits({
      disabled: "false",
      supabaseUrl: "http://127.0.0.1:54321",
    }),
    false,
  )
})

Deno.test("consumeAiRequest returns available when allowed", async () => {
  const usage: AiUsageResult = { allowed: true, used: 3, limit: 50 }
  const result = await consumeAiRequest(fakeDb({ data: usage, error: null }), "user-1")
  assertEquals(result, { status: "available", usage })
})

Deno.test("consumeAiRequest returns available when denied", async () => {
  const usage: AiUsageResult = { allowed: false, used: 50, limit: 50 }
  const result = await consumeAiRequest(fakeDb({ data: usage, error: null }), "user-1")
  assertEquals(result, { status: "available", usage })
  assertEquals(
    limitReachedMessage(usage),
    "Daily AI limit reached (50 of 50 used). Your limit resets at midnight UTC.",
  )
})

Deno.test("consumeAiRequest maps RPC errors to unavailable", async () => {
  const result = await consumeAiRequest(
    fakeDb({ data: null, error: { message: "boom" } }),
    "user-1",
  )
  assertEquals(result, { status: "unavailable" })
  assertEquals(
    QUOTA_UNAVAILABLE_MESSAGE,
    "AI usage tracking is temporarily unavailable. Please try again in a moment.",
  )
})

Deno.test("consumeAiRequest maps malformed payloads to unavailable", async () => {
  const result = await consumeAiRequest(
    fakeDb({ data: { allowed: true }, error: null }),
    "user-1",
  )
  assertEquals(result, { status: "unavailable" })
})

Deno.test("consumeAiRequest maps thrown errors to unavailable", async () => {
  const result = await consumeAiRequest(
    fakeDb(() => {
      throw new Error("network down")
    }),
    "user-1",
  )
  assertEquals(result, { status: "unavailable" })
})

Deno.test("consumeAiRequest never throws to callers", async () => {
  await assertRejects(async () => {
    throw new Error("control")
  })
  const result = await consumeAiRequest(
    fakeDb(() => {
      throw new Error("still fail closed")
    }),
    "user-1",
  )
  assertEquals(result.status, "unavailable")
})
