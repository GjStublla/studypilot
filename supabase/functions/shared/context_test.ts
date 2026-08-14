import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  formatRubricBlock,
  normalizeTurns,
  toModelRole,
  turnsToGeminiContents,
} from "./context-normalize.ts"
import {
  buildDocumentMetadata,
  decodeIndexOperationName,
  encodeIndexOperationName,
  normalizeCitations,
} from "./file-search-normalize.ts"
import {
  isOwnedStoragePath,
  ownershipPrefix,
  RUBRICS_STORAGE_BUCKET,
  validateOwnedStoragePath,
} from "./storage-path.ts"

Deno.test("toModelRole maps ai/assistant to model and student to user", () => {
  assertEquals(toModelRole("ai"), "model")
  assertEquals(toModelRole("assistant"), "model")
  assertEquals(toModelRole("model"), "model")
  assertEquals(toModelRole("user"), "user")
  assertEquals(toModelRole("student"), "user")
  assertEquals(toModelRole("system"), "system")
  assertEquals(toModelRole("unknown"), null)
})

Deno.test("normalizeTurns maps roles, drops system, merges adjacent same roles", () => {
  const turns = normalizeTurns([
    { role: "system", text: "ignore me" },
    { role: "user", text: "Hello" },
    { role: "user", text: "More" },
    { role: "ai", text: "Hi" },
    { role: "assistant", text: "there" },
    { role: "student", text: "Thanks" },
    { role: "user", text: "  " },
  ])
  assertEquals(turns, [
    { role: "user", text: "Hello\nMore" },
    { role: "model", text: "Hi\nthere" },
    { role: "user", text: "Thanks" },
  ])
})

Deno.test("turnsToGeminiContents preserves Gemini Live roles", () => {
  assertEquals(
    turnsToGeminiContents([
      { role: "user", text: "a" },
      { role: "model", text: "b" },
    ]),
    [
      { role: "user", parts: [{ text: "a" }] },
      { role: "model", parts: [{ text: "b" }] },
    ],
  )
})

Deno.test("formatRubricBlock includes criteria and indexing caveat", () => {
  const block = formatRubricBlock({
    id: "r1",
    title: "Essay Rubric",
    course: "ENG101",
    criteria: [{ name: "Thesis", score: 2, maxScore: 4 }],
    summary: "Focus on argument.",
    fileSearchStatus: "pending",
    knowledgeDocumentId: null,
  })
  assertEquals(block.includes('RUBRIC: "Essay Rubric" (ENG101)'), true)
  assertEquals(block.includes("Thesis: 2/4"), true)
  assertEquals(block.includes("RUBRIC SUMMARY:"), true)
  assertEquals(block.includes("pending"), true)
  assertEquals(block.includes("Vertex RAG"), true)
})

Deno.test("normalizeCitations maps Vertex retrieveContexts shapes with page numbers", () => {
  const citations = normalizeCitations({
    groundingChunks: [
      {
        retrievedContext: {
          title: "rubric.pdf",
          text: "Thesis clarity...",
          pageNumber: 3,
        },
      },
    ],
    contexts: [
      {
        text: "Evidence from corpus",
        sourceDisplayName: "essay.pdf",
        sourceUri: "projects/p/locations/us-central1/ragCorpora/1/ragFiles/2",
        ragChunk: { pageSpan: { firstPage: 5 } },
      },
    ],
  })
  assertEquals(citations.length >= 2, true)
  assertEquals(citations[0].title, "rubric.pdf")
  assertEquals(citations[0].pageNumber, 3)
})

Deno.test("normalizeCitations maps file_citation annotations with page numbers", () => {
  const citations = normalizeCitations({
    annotations: [
      {
        type: "file_citation",
        file_citation: {
          file_name: "essay-rubric.pdf",
          source: "fileSearchStores/abc/documents/xyz",
          page_number: 4,
        },
      },
      {
        type: "file_citation",
        file_name: "flat.pdf",
        source: "https://example.test/flat.pdf",
        page_number: 2,
        text: "Evidence row",
      },
    ],
  })
  assertEquals(citations.length, 2)
  assertEquals(citations[0].title, "essay-rubric.pdf")
  assertEquals(citations[0].uri, "fileSearchStores/abc/documents/xyz")
  assertEquals(citations[0].pageNumber, 4)
  assertEquals(citations[1].title, "flat.pdf")
  assertEquals(citations[1].pageNumber, 2)
  assertEquals(citations[1].text, "Evidence row")
})

Deno.test("buildDocumentMetadata includes rubric and document ids", () => {
  assertEquals(
    buildDocumentMetadata({
      rubricId: "rub-1",
      knowledgeDocumentId: "doc-1",
    }),
    [
      { key: "knowledge_document_id", stringValue: "doc-1" },
      { key: "rubric_id", stringValue: "rub-1" },
    ],
  )
  assertEquals(
    buildDocumentMetadata({ knowledgeDocumentId: "doc-2", rubricId: null }),
    [{ key: "knowledge_document_id", stringValue: "doc-2" }],
  )
})

Deno.test("index operation name encode/decode round-trips", () => {
  const name = "fileSearchStores/abc/operations/xyz"
  const encoded = encodeIndexOperationName(name)
  assertEquals(decodeIndexOperationName(encoded), name)
  assertEquals(decodeIndexOperationName("real error"), null)
  assertEquals(decodeIndexOperationName(null), null)
})

Deno.test("isOwnedStoragePath enforces {userId}/{rubricId}/... prefix", () => {
  const userId = "11111111-1111-1111-1111-111111111111"
  const rubricId = "22222222-2222-2222-2222-222222222222"
  const good = `${userId}/${rubricId}/essay.pdf`
  assertEquals(isOwnedStoragePath(good, userId, rubricId), true)
  assertEquals(ownershipPrefix(userId, rubricId), `${userId}/${rubricId}/`)
  assertEquals(isOwnedStoragePath(`${userId}/other/${rubricId}/x.pdf`, userId, rubricId), false)
  assertEquals(isOwnedStoragePath(`${userId}/${rubricId}/../secret`, userId, rubricId), false)
  assertEquals(
    isOwnedStoragePath(`${RUBRICS_STORAGE_BUCKET}/${good}`, userId, rubricId),
    false,
  )
  assertEquals(validateOwnedStoragePath(good, userId, rubricId)?.bucket, RUBRICS_STORAGE_BUCKET)
  assertEquals(validateOwnedStoragePath("evil/path.pdf", userId, rubricId), null)
})
