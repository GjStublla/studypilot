/**
 * Unit tests for Vertex generateContent request shaping and stream parsing.
 * No network -- pure helpers only.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  buildVertexGenerateContentRequestBody,
  extractGenerateContentText,
  generateContentEndpoint,
  parseVertexStreamEvent,
} from "./gemini.ts"
import { metadataFilterForRubric } from "./file-search-normalize.ts"
import { vertexRagToolConfig } from "./vertex-rag.ts"

Deno.test("buildVertexGenerateContentRequestBody preserves full serialized coaching context", () => {
  const body = buildVertexGenerateContentRequestBody({
    contents: [
      { role: "user", parts: [{ text: "My thesis is X." }] },
      { role: "model", parts: [{ text: "Good start. What evidence supports X?" }] },
      {
        role: "user",
        parts: [
          {
            text:
              'How does this compare?\n\n---\nRETRIEVED RUBRIC EVIDENCE (Vertex RAG):\nrubric_id == "rub-1"\nUse primary sources.',
          },
          { inlineData: { mimeType: "image/jpeg", data: "abc123" } },
        ],
      },
    ],
    system_instruction: "Be Socratic.",
    tools: [{
      type: "retrieval",
      retrieval: { vertex_rag_store: { rag_resources: [{ rag_corpus: "c" }] } },
    }],
    generation_config: { temperature: 0.7, maxOutputTokens: 1024 },
    stream: true,
  })

  const serialized = JSON.parse(JSON.stringify(body))
  assertEquals(serialized.contents.length, 3)
  assertEquals(serialized.contents[0].role, "user")
  assertEquals(serialized.contents[0].parts[0].text, "My thesis is X.")
  assertEquals(serialized.contents[1].role, "model")
  assertEquals(
    serialized.contents[1].parts[0].text,
    "Good start. What evidence supports X?",
  )
  assertEquals(serialized.contents[2].role, "user")
  assertEquals(
    serialized.contents[2].parts[0].text.includes("RETRIEVED RUBRIC EVIDENCE"),
    true,
  )
  assertEquals(serialized.contents[2].parts[1].inlineData, {
    mimeType: "image/jpeg",
    data: "abc123",
  })
  assertEquals(serialized.systemInstruction, {
    parts: [{ text: "Be Socratic." }],
  })
  assertEquals(serialized.generationConfig.maxOutputTokens, 1024)
  assertEquals(serialized.tools[0].type, "retrieval")
})

Deno.test("buildVertexGenerateContentRequestBody supports normal single-turn input", () => {
  const body = buildVertexGenerateContentRequestBody({
    input: "Coach me on my introduction.",
  })
  const serialized = JSON.parse(JSON.stringify(body))
  assertEquals(serialized, {
    contents: [{
      role: "user",
      parts: [{ text: "Coach me on my introduction." }],
    }],
  })
})

Deno.test("buildVertexGenerateContentRequestBody drops non-Vertex file_search tools", () => {
  const body = buildVertexGenerateContentRequestBody({
    input: "Use the rubric.",
    tools: [
      { type: "file_search", file_search_store_names: ["fileSearchStores/abc"] },
      { type: "retrieval", retrieval: { vertex_rag_store: {} } },
    ],
  })
  const serialized = JSON.parse(JSON.stringify(body))
  assertEquals(serialized.tools, [
    { type: "retrieval", retrieval: { vertex_rag_store: {} } },
  ])
})

Deno.test("metadataFilterForRubric uses Vertex CEL equality", () => {
  assertEquals(metadataFilterForRubric("rub-1"), 'rubric_id == "rub-1"')
})

Deno.test("vertexRagToolConfig builds retrieval tool with filter", () => {
  const tool = vertexRagToolConfig({
    corpusName: "projects/p/locations/us-central1/ragCorpora/1",
    rubricId: "r1",
  })
  assertEquals(tool.type, "retrieval")
  const retrieval = (tool.retrieval as Record<string, unknown>)
  const store = retrieval.vertex_rag_store as Record<string, unknown>
  const config = store.rag_retrieval_config as Record<string, unknown>
  assertEquals(
    (config.filter as Record<string, unknown>).metadata_filter,
    'rubric_id == "r1"',
  )
})

Deno.test("generateContentEndpoint builds Vertex streaming URL", () => {
  const url = generateContentEndpoint("my-proj", "gemini-2.5-flash", true)
  assertEquals(
    url,
    "https://aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
  )
})

Deno.test("extractGenerateContentText reads candidates and legacy fallback", () => {
  assertEquals(
    extractGenerateContentText({
      candidates: [{ content: { parts: [{ text: "Coach response" }] } }],
    }),
    "Coach response",
  )

  assertEquals(
    extractGenerateContentText({
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: "Legacy response" }],
      }],
    }),
    "Legacy response",
  )
})

Deno.test("parseVertexStreamEvent reads generateContent and legacy chunks", () => {
  const vertex = parseVertexStreamEvent({
    candidates: [{
      content: { parts: [{ text: "Hello " }] },
      groundingMetadata: { source: "rag" },
      finishReason: "STOP",
    }],
  })
  assertEquals(vertex.text, "Hello ")
  assertEquals(vertex.done, true)
  assertExists(vertex.grounding)

  const legacy = parseVertexStreamEvent({
    event_type: "step.delta",
    delta: { type: "text", text: "there" },
  })
  assertEquals(legacy.text, "there")
  assertEquals(legacy.done, false)
})
