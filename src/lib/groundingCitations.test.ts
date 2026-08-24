import { describe, expect, it } from 'vitest';
import { extractCitations } from './groundingCitations';

describe('extractCitations', () => {
  it('prefers explicit citations when present', () => {
    const citations = extractCitations({
      citations: [{ title: 'Thesis clarity', uri: null, snippet: 'Clear claim' }],
      grounding_metadata: {
        groundingChunks: [{ retrievedContext: { title: 'Other' } }],
      },
    });

    expect(citations).toEqual([{ title: 'Thesis clarity', uri: null, snippet: 'Clear claim', sourceIndex: 0 }]);
  });

  it('normalizes groundingChunks into citations', () => {
    const citations = extractCitations({
      used_file_search: true,
      grounding_metadata: {
        groundingChunks: [
          { retrievedContext: { title: 'Evidence', uri: 'https://example.com/a', text: 'Use evidence' } },
          { web: { title: 'Web source', uri: 'https://example.com/b' } },
          { retrievedContext: { title: 'Evidence', uri: 'https://example.com/a', text: 'Use evidence' } },
        ],
      },
    });

    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      title: 'Evidence',
      uri: 'https://example.com/a',
      snippet: 'Use evidence',
    });
    expect(citations[1]).toMatchObject({
      title: 'Web source',
      uri: 'https://example.com/b',
    });
  });

  it('returns an empty list when no grounding is present', () => {
    expect(extractCitations({})).toEqual([]);
  });
});
