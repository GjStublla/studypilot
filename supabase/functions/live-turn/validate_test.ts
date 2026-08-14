import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { liveTurnRpcHttpStatus, parseLiveTurnTexts } from "./validate.ts"

Deno.test("parseLiveTurnTexts requires both sides", () => {
  assertEquals(parseLiveTurnTexts("hello", "world").ok, true)
  assertEquals(parseLiveTurnTexts("hello", "").ok, false)
  assertEquals(parseLiveTurnTexts("", "world").ok, false)
  assertEquals(parseLiveTurnTexts("  ", "world").ok, false)
  assertEquals(parseLiveTurnTexts(null, "world").ok, false)
})

Deno.test("liveTurnRpcHttpStatus maps empty-text SQLSTATE to 400 not 503", () => {
  assertEquals(
    liveTurnRpcHttpStatus({
      code: "22023",
      message: "Live turn texts are required",
    }),
    400,
  )
  assertEquals(
    liveTurnRpcHttpStatus({ message: "Live turn texts are required" }),
    400,
  )
  assertEquals(liveTurnRpcHttpStatus({ code: "P0002" }), 404)
  assertEquals(liveTurnRpcHttpStatus({ code: "XX000", message: "boom" }), 503)
})
