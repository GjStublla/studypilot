import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { PROCESSING_DISCLOSURE } from './App';
import {
  BETA_ACCESS_MAILTO,
  parseChromeWebStoreUrl,
  parseLegalHash,
} from './lib/productLinks';

const chromeStore = vi.hoisted(() => ({ url: null as string | null }));

vi.mock('./lib/productLinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/productLinks')>();
  return {
    ...actual,
    getChromeWebStoreUrl: () => chromeStore.url,
  };
});

vi.mock('./components/GradientBlinds', () => ({
  default: () => null,
}));

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
    },
  },
}));

const dashboardMocks = vi.hoisted(() => ({
  fetchSessions: vi.fn(async () => []),
  fetchRubrics: vi.fn(async () => []),
  fetchActionItems: vi.fn(async () => []),
  fetchSessionTranscript: vi.fn(async () => []),
  setActionItemDone: vi.fn(),
  activateRubric: vi.fn(async () => undefined),
  getDashboardChats: vi.fn(async () => []),
  getDashboardChatMessages: vi.fn(async () => []),
  getAiUsage: vi.fn(async () => ({ used: 0, limit: 50 })),
  getOrCreateRubricChat: vi.fn(),
  getOrCreateSessionChat: vi.fn(),
  retryRubricIndexing: vi.fn(),
  sendCoachingMessage: vi.fn(),
}));

vi.mock('./lib/dashboardApi', () => ({
  fetchSessions: dashboardMocks.fetchSessions,
  fetchRubrics: dashboardMocks.fetchRubrics,
  fetchActionItems: dashboardMocks.fetchActionItems,
  fetchSessionTranscript: dashboardMocks.fetchSessionTranscript,
  setActionItemDone: dashboardMocks.setActionItemDone,
  activateRubric: dashboardMocks.activateRubric,
}));
vi.mock('./lib/studypilot-api', () => ({
  getDashboardChats: dashboardMocks.getDashboardChats,
  getDashboardChatMessages: dashboardMocks.getDashboardChatMessages,
  getAiUsage: dashboardMocks.getAiUsage,
  createSessionCaptureSignedUrl: vi.fn(),
  createDashboardChat: vi.fn(),
  getOrCreateSessionChat: dashboardMocks.getOrCreateSessionChat,
  getOrCreateRubricChat: dashboardMocks.getOrCreateRubricChat,
  retryRubricIndexing: dashboardMocks.retryRubricIndexing,
  updateDashboardChat: vi.fn(),
  deleteDashboardChat: vi.fn(),
  uploadRubricFile: vi.fn(),
}));
vi.mock('./lib/socraticCoach', () => ({
  sendCoachingMessage: dashboardMocks.sendCoachingMessage,
}));
vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: 'user-1' } } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));
vi.mock('./lib/api', () => ({
  clearAuth: vi.fn(),
  storeAuth: vi.fn(),
  apiFetch: vi.fn(async () => ({ ok: false })),
  apiPost: vi.fn(async () => ({ ok: false, json: async () => ({}) })),
}));
vi.mock('./lib/useRealtime', () => ({ useStudyPilotRealtime: vi.fn() }));
vi.mock('./components/Dashboard.css', () => ({}));

import Dashboard from './components/Dashboard';

const VALID_STORE_URL =
  'https://chromewebstore.google.com/detail/studypilot-test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const FORBIDDEN_PHRASES = [
  'tab audio',
  'exact second',
  'stay on your device',
  'no account',
] as const;

class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function expectNoForbiddenClaims(text: string) {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(lower).not.toContain(phrase);
  }
}

function setHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

describe('Chrome store URL validation', () => {
  it('accepts an https Chrome Web Store listing', () => {
    expect(parseChromeWebStoreUrl(VALID_STORE_URL)).toBe(VALID_STORE_URL);
  });

  it('rejects empty, invalid, and non-store URLs', () => {
    expect(parseChromeWebStoreUrl(undefined)).toBeNull();
    expect(parseChromeWebStoreUrl('')).toBeNull();
    expect(parseChromeWebStoreUrl('   ')).toBeNull();
    expect(parseChromeWebStoreUrl('not-a-url')).toBeNull();
    expect(
      parseChromeWebStoreUrl(
        'http://chromewebstore.google.com/detail/studypilot-test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toBeNull();
    expect(parseChromeWebStoreUrl('https://example.com/extension')).toBeNull();
    expect(
      parseChromeWebStoreUrl(
        'https://user:pass@chromewebstore.google.com/detail/studypilot-test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toBeNull();
    expect(
      parseChromeWebStoreUrl('https://chromewebstore.google.com.evil.example/'),
    ).toBeNull();
  });
});

describe('legal hash parsing', () => {
  it('maps slash hash routes and ignores dead fragments', () => {
    expect(parseLegalHash('#/privacy')).toBe('privacy');
    expect(parseLegalHash('#/terms')).toBe('terms');
    expect(parseLegalHash('#/cookies')).toBe('cookies');
    expect(parseLegalHash('#/changelog')).toBe('changelog');
    expect(parseLegalHash('#/privacy/')).toBe('privacy');
    expect(parseLegalHash('#privacy')).toBeNull();
    expect(parseLegalHash('#terms')).toBeNull();
    expect(parseLegalHash('#chrome')).toBeNull();
    expect(parseLegalHash('#install')).toBeNull();
  });
});

describe('landing and legal navigation', () => {
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
  });

  beforeEach(() => {
    chromeStore.url = null;
    window.location.hash = '';
    localStorage.clear();
  });

  afterEach(() => {
    chromeStore.url = null;
    window.location.hash = '';
  });

  it('shows a disabled invite-only Chrome control when no store URL is configured', () => {
    const { container } = render(<App />);
    const inviteButtons = screen.getAllByRole('button', {
      name: /chrome beta — invite only/i,
    });
    expect(inviteButtons.length).toBeGreaterThan(0);
    for (const button of inviteButtons) {
      expect(button).toBeDisabled();
    }

    const accessLinks = screen.getAllByRole('link', { name: /request beta access/i });
    expect(accessLinks.length).toBeGreaterThan(0);
    for (const link of accessLinks) {
      expect(link).toHaveAttribute('href', BETA_ACCESS_MAILTO);
    }

    expect(screen.queryByRole('link', { name: /add to chrome/i })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#chrome"]')).toBeNull();
    expect(container.querySelector('a[href="#install"]')).toBeNull();
    expect(container.querySelector('a[href="#privacy"]')).toBeNull();
    expect(container.querySelector('a[href="#terms"]')).toBeNull();
    expect(container.querySelector('a[href="#cookies"]')).toBeNull();
    expect(container.querySelector('a[href="#changelog"]')).toBeNull();
  });

  it('renders Add to Chrome links only when a valid store URL is configured', () => {
    chromeStore.url = VALID_STORE_URL;
    render(<App />);

    const installLinks = screen.getAllByRole('link', { name: /add to chrome/i });
    expect(installLinks.length).toBeGreaterThan(0);
    for (const link of installLinks) {
      expect(link).toHaveAttribute('href', VALID_STORE_URL);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }

    expect(
      screen.queryByRole('button', { name: /chrome beta — invite only/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['#/privacy', 'Privacy Policy'],
    ['#/terms', 'Terms of Use'],
    ['#/cookies', 'Cookies'],
    ['#/changelog', 'Changelog'],
  ] as const)('renders %s with a real %s page', (hash, title) => {
    window.location.hash = hash;
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expectNoForbiddenClaims(container.textContent ?? '');
  });

  it('includes the cloud-processing disclosure on privacy and cookies pages', () => {
    window.location.hash = '#/privacy';
    const privacy = render(<App />);
    expect(privacy.container.textContent).toContain(PROCESSING_DISCLOSURE);
    privacy.unmount();

    window.location.hash = '#/cookies';
    const cookies = render(<App />);
    expect(cookies.container.textContent).toContain(PROCESSING_DISCLOSURE);
    expect(cookies.container.textContent?.toLowerCase()).toContain('essential');
    expect(cookies.container.textContent?.toLowerCase()).toContain(
      'no advertising cookies',
    );
    expect(
      cookies.getAllByRole('link', { name: 'Privacy Policy' }).some(
        (link) => link.getAttribute('href') === '#/privacy',
      ),
    ).toBe(true);
  });

  it('opens a legal page from the footer and returns when the hash is cleared', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('link', { name: 'Privacy Policy' })[0]);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument();

    act(() => {
      setHash('');
    });
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('points authentication legal links at hash routes', () => {
    window.location.hash = '#auth';
    render(<App />);
    const privacy = screen.getAllByRole('link', { name: 'Privacy Policy' });
    const terms = screen.getAllByRole('link', { name: 'Terms of Use' });
    expect(privacy.length).toBeGreaterThan(0);
    expect(terms.length).toBeGreaterThan(0);
    for (const link of privacy) {
      expect(link).toHaveAttribute('href', '#/privacy');
    }
    for (const link of terms) {
      expect(link).toHaveAttribute('href', '#/terms');
    }
  });
});

describe('dashboard extension help modal', () => {
  beforeEach(() => {
    chromeStore.url = null;
    window.location.hash = '#dashboard';
    localStorage.setItem('sp_user_id', 'user-1');
    dashboardMocks.getDashboardChats.mockResolvedValue([]);
    dashboardMocks.getAiUsage.mockResolvedValue({ used: 0, limit: 50 });
  });

  afterEach(() => {
    chromeStore.url = null;
    window.location.hash = '';
    localStorage.clear();
  });

  it('explains how to install, pin, and open the toolbar icon', async () => {
    const user = userEvent.setup();
    render(<Dashboard routeHash="#dashboard" />);

    await user.click(screen.getAllByRole('button', { name: /open extension/i })[0]);
    const dialog = screen.getByRole('dialog', {
      name: /open the studypilot extension/i,
    });
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toMatch(/pin studypilot/i);
    expect(dialog.textContent).toMatch(/toolbar icon/i);
    expect(within(dialog).getByRole('link', { name: /request beta access/i })).toHaveAttribute(
      'href',
      BETA_ACCESS_MAILTO,
    );
  });

  it('includes the Chrome Web Store link in the help modal when configured', async () => {
    chromeStore.url = VALID_STORE_URL;
    const user = userEvent.setup();
    render(<Dashboard routeHash="#dashboard" />);

    await user.click(screen.getAllByRole('button', { name: /open extension/i })[0]);
    const dialog = screen.getByRole('dialog', {
      name: /open the studypilot extension/i,
    });
    const storeLink = within(dialog).getByRole('link', { name: /chrome web store/i });
    expect(storeLink).toHaveAttribute('href', VALID_STORE_URL);
  });
});
