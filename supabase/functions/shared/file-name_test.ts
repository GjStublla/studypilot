import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { ensureFileExtension, hasSupportedFileExtension } from "./file-name.ts"

Deno.test("ensureFileExtension derives supported document extensions", () => {
  assertEquals(ensureFileExtension("rubric", "application/pdf"), "rubric.pdf")
  assertEquals(ensureFileExtension("rubric", "text/plain; charset=utf-8"), "rubric.txt")
  assertEquals(ensureFileExtension("rubric.pdf", "application/pdf"), "rubric.pdf")
  assertEquals(ensureFileExtension("rubric.unknown", "application/pdf"), "rubric.pdf")
  assertEquals(hasSupportedFileExtension("rubric.pdf"), true)
  assertEquals(hasSupportedFileExtension("rubric.unknown"), false)
})

Deno.test("ensureFileExtension sanitizes names and defaults unknown types to text", () => {
  assertEquals(ensureFileExtension("", "application/octet-stream"), "document.txt")
  assertEquals(ensureFileExtension("a/b", "application/octet-stream"), "a_b.txt")
})