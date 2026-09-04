import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { jsonResponse } from "./http-response.ts"

Deno.test("jsonResponse preserves CORS headers for error and success responses", () => {
  const cors = { "Access-Control-Allow-Origin": "http://127.0.0.1:5173" }
  assertEquals(jsonResponse({ error: "failed" }, 502, cors).headers.get("Access-Control-Allow-Origin"), cors["Access-Control-Allow-Origin"])
  assertEquals(jsonResponse({ status: "indexed" }, 200, cors).headers.get("Access-Control-Allow-Origin"), cors["Access-Control-Allow-Origin"])
})