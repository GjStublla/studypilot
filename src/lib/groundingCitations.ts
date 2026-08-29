import type { GroundingCitation, GroundingMetadata } from './studypilot-types';

/**
 * Normalize citations from a message's stored citations array and/or
 * Gemini grounding_metadata.groundingChunks.
 */
export function extractCitations(input: {
  citations?: GroundingCitation[] | null;
  grounding_metadata?: GroundingMetadata | null | unknown;
  used_file_search?: boolean;
}): GroundingCitation[] {
  if (Array.isArray(input.citations) && input.citations.length > 0) {
    return input.citations
      .map((c, index) => ({
        title: (c.title || `Source ${index + 1}`).trim() || `Source ${index + 1}`,
        uri: c.uri ?? null,
        snippet: c.snippet ?? c.text ?? null,
        ...(typeof c.pageNumber === 'number' ? { pageNumber: c.pageNumber } : {}),
        sourceIndex: c.sourceIndex ?? index,
      }))
      .filter((c) => c.title.length > 0);
  }

  const meta = input.grounding_metadata as GroundingMetadata | null | undefined;
  if (Array.isArray(meta?.citations) && meta.citations.length > 0) {
    return extractCitations({ citations: meta.citations });
  }
  const chunks = meta?.groundingChunks;
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  const seen = new Set<string>();
  const citations: GroundingCitation[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const retrieved = chunk?.retrievedContext;
    const web = chunk?.web;
    const title = (retrieved?.title || web?.title || `Source ${i + 1}`).trim();
    const uri = retrieved?.uri ?? web?.uri ?? null;
    const snippet = retrieved?.text?.trim() || null;
    const key = `${title}|${uri ?? ''}|${snippet ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ title, uri, snippet, sourceIndex: i });
  }

  return citations;
}
