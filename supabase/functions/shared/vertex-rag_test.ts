import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  isOwnedVertexRagFileName,
  ownedRagFilePrefix,
} from "./vertex-rag.ts"

const corpus =
  "projects/my-proj/locations/us-central1/ragCorpora/abc"
const ownedFile = `${corpus}/ragFiles/file-1`

Deno.test("ownedRagFilePrefix appends ragFiles/", () => {
  assertEquals(ownedRagFilePrefix(corpus), `${corpus}/ragFiles/`)
})

Deno.test("isOwnedVertexRagFileName accepts files under the user corpus", () => {
  assertEquals(
    isOwnedVertexRagFileName(ownedFile, corpus, "my-proj"),
    true,
  )
})

Deno.test("isOwnedVertexRagFileName rejects another user's corpus", () => {
  const other = "projects/my-proj/locations/us-central1/ragCorpora/other/ragFiles/x"
  assertEquals(isOwnedVertexRagFileName(other, corpus, "my-proj"), false)
})

Deno.test("isOwnedVertexRagFileName rejects a different GCP project", () => {
  const otherProject =
    "projects/evil/locations/us-central1/ragCorpora/abc/ragFiles/file-1"
  assertEquals(isOwnedVertexRagFileName(otherProject, corpus, "my-proj"), false)
})

Deno.test("isOwnedVertexRagFileName rejects Gemini File Search names", () => {
  assertEquals(
    isOwnedVertexRagFileName("fileSearchStores/abc/documents/1", corpus, "my-proj"),
    false,
  )
})

Deno.test("isOwnedVertexRagFileName rejects missing corpus", () => {
  assertEquals(isOwnedVertexRagFileName(ownedFile, null, "my-proj"), false)
})
