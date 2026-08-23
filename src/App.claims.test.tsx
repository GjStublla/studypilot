import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import App, { PROCESSING_DISCLOSURE } from './App';

vi.mock('./components/GradientBlinds', () => ({
  default: () => null,
}));

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
  },
}));

class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

describe('landing page claims', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', FakeObserver);
    window.location.hash = '';
  });

  it('omits unsupported capability claims and shows the processing disclosure', () => {
    const { container } = render(<App />);
    const text = container.textContent ?? '';
    const lower = text.toLowerCase();

    expect(lower).not.toContain('tab audio');
    expect(lower).not.toContain('exact second');
    expect(lower).not.toContain('stay on your device');
    expect(lower).not.toContain('no account');
    expect(text).toContain(PROCESSING_DISCLOSURE);
    expect(lower).toContain(
      'uses your microphone and the page context you choose to share',
    );
    expect(lower).toContain(
      'answers can cite retrieved rubric or uploaded-document evidence when grounding is available',
    );
    expect(lower).toContain(
      'sign in once to connect the extension and dashboard',
    );
  });
});
