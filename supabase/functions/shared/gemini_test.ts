/**
 * Unit tests for Interactions request shaping and stream parsing.
 * No network — pure helpers only.
 */

import {
  assertEquals,
  assertExists,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  buildInteractionRequestBody,
  contentsToInteractionInput,
  extractInteractionText,
  interactionsEndpoint,
  normalizeGenerationConfig,
  normalizeInteractionTools,
  parseInteractionStreamEvent,
} from "./gemini.ts"
import { metadataFilterForRubric } from "./file-search-normalize.ts"
import { vertexRagToolConfig } from "./vertex-rag.ts"

Deno.test("contentsToInteractionInput maps user/model roles", () => {
  const steps = contentsToInteractionInput([
    { role: "user", parts: [{ text: "Hi" }] },
    { role: "model", parts: [{ text: "Hello" }] },
    {
      role: "user",
      parts: [
        { text: "See this" },
        { inlineData: { mimeType: "image/jpeg", data: "abc" } },
      ],
    },
  ])
  assertEquals(steps[0], {
    type: "user_input",
    content: [{ type: "text", text: "Hi" }],
  })
  assertEquals(steps[1], {
    type: "model_output",
    content: [{ type: "text", text: "Hello" }],
  })
  assertEquals(steps[2]?.type, "user_input")
  const content = (steps[2] as { content: unknown[] }).content
  assertEquals(content.length, 2)
  assertEquals(content[1], {
    type: "image",
    data: "abc",
    mime_type: "image/jpeg",
  })
})

Deno.test("normalizeInteractionTools accepts Vertex retrieval tools", () => {
  const tools = normalizeInteractionTools([
    {
      type: "retrieval",
      retrieval: {
        vertex_rag_store: {
          rag_resources: [{ rag_corpus: "projects/p/locations/us-central1/ragCorpora/1" }],
        },
      },
    },
    { type: "google_search" },
  ])
  assertExists(tools)
  assertEquals((tools[0] as { type: string }).type, "retrieval")
  assertEquals(tools[1], { type: "google_search" })
})

Deno.test("normalizeInteractionTools rejects File Search on Vertex", () => {
  assertThrows(
    () =>
      normalizeInteractionTools([
        {
          type: "file_search",
          file_search_store_names: ["fileSearchStores/abc"],
        },
      ]),
    Error,
    "File Search",
  )
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

Deno.test("normalizeGenerationConfig maps camelCase tokens", () => {
  assertEquals(normalizeGenerationConfig({
    temperature: 0.2,
    maxOutputTokens: 800,
  }), {
    temperature: 0.2,
    max_output_tokens: 800,
  })
})

Deno.test("buildInteractionRequestBody prefers contents when input empty", () => {
  const body = buildInteractionRequestBody({
    contents: [{ role: "user", parts: [{ text: "Coach me" }] }],
    system_instruction: "Be Socratic",
    tools: [{
      type: "retrieval",
      retrieval: { vertex_rag_store: { rag_resources: [{ rag_corpus: "c" }] } },
    }],
    generation_config: { maxOutputTokens: 100 },
    store: true,
  }, "gemini-3-flash-preview")

  assertEquals(body.model, "gemini-3-flash-preview")
  assertEquals(body.store, true)
  assertEquals(body.system_instruction, "Be Socratic")
  assertEquals(
    (body.generation_config as Record<string, unknown>).max_output_tokens,
    100,
  )
  assertEquals(body.input, [{
    type: "user_input",
    content: [{ type: "text", text: "Coach me" }],
  }])
})

Deno.test("interactionsEndpoint builds Vertex global URL", () => {
  const url = interactionsEndpoint("vertex-interactions", "my-proj", true)
  assertEquals(
    url,
    "https://aiplatform.googleapis.com/v1beta1/projects/my-proj/locations/global/interactions?alt=sse",
  )
})

Deno.test("extractInteractionText reads model_output steps", () => {
  const text = extractInteractionText({
    steps: [
      { type: "thought", signature: "x" },
      {
        type: "model_output",
        content: [{ type: "text", text: "Revise the thesis." }],
      },
    ],
  })
  assertEquals(text, "Revise the thesis.")
})

Deno.test("extractInteractionText falls back to candidates", () => {
  const text = extractInteractionText({
    candidates: [{
      content: { parts: [{ text: "Legacy" }] },
    }],
  })
  assertEquals(text, "Legacy")
})

Deno.test("parseInteractionStreamEvent reads step.delta text", () => {
  const a = parseInteractionStreamEvent({
    event_type: "step.delta",
    delta: { type: "text", text: "Hello " },
  })
  assertEquals(a.text, "Hello ")
  assertEquals(a.done, false)

  const b = parseInteractionStreamEvent({
    event_type: "interaction.completed",
    interaction: {
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: "done", annotations: [{ title: "x" }] }],
      }],
    },
  })
  assertEquals(b.done, true)
  assertExists(b.grounding)
})
