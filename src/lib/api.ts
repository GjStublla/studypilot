// Shared client for the StudyPilot FastAPI backend.
//
// Token storage: the access + refresh tokens live in localStorage. That's
// convenient (survives reloads, simple) but readable by any script running on
// the page, so it is exposed to XSS — a strict CSP and dependency hygiene are
// the practical mitigations during the beta. httpOnly cookies would be safer
// but need backend cookie + CSRF work; that's a deliberate post-beta follow-up.
// See context/backend.md.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

if (!import.meta.env.VITE_API_BASE_URL) {
  // Only warn in production builds — in dev the localhost fallback is intentional.
  if (import.meta.env.PROD) {
    console.error(
      '[StudyPilot] VITE_API_BASE_URL is not set. ' +
      'All API calls will target http://localhost:8000, which will fail in production.',
    );
  }
}

const ACCESS_KEY = 'sp_access_token';
const REFRESH_KEY = 'sp_refresh_token';
const USER_ID_KEY = 'sp_user_id';
const EMAIL_KEY = 'sp_email';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function storeAuth(tokens: AuthTokens): void {
  try {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    localStorage.setItem(USER_ID_KEY, tokens.user_id);
    localStorage.setItem(EMAIL_KEY, tokens.email);
  } catch {
    /* localStorage unavailable — nothing we can do */
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

function redirectToAuth(): void {
  clearAuth();
  if (typeof window !== 'undefined') {
    window.location.hash = '#auth';
  }
}

// ─── Requests ───────────────────────────────────────────────────────────────

/** Unauthenticated POST (login / signup / refresh). */
export function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchange the refresh token for a new access token. De-duped so several
 * concurrent 401s trigger only one /auth/refresh call.
 */
function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const refresh_token = getRefreshToken();
  if (!refresh_token) return Promise.resolve(false);

  refreshInFlight = (async () => {
    try {
      const res = await apiPost('/auth/refresh', { refresh_token });
      if (!res.ok) return false;
      storeAuth((await res.json()) as AuthTokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Authenticated fetch. Attaches the bearer token and, on a 401, transparently
 * refreshes once and retries. If refresh fails it clears auth, redirects to
 * #auth, and throws — so callers can treat a thrown error as "session ended".
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    // Auto-set Content-Type for JSON bodies so callers don't have to remember.
    const isJsonBody = typeof options.body === 'string';
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  let res = await send(getAccessToken());
  if (res.status !== 401) return res;

  const refreshed = await refreshTokens();
  if (!refreshed) {
    redirectToAuth();
    throw new Error('Session expired. Please log in again.');
  }

  res = await send(getAccessToken());
  if (res.status === 401) {
    redirectToAuth();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}
