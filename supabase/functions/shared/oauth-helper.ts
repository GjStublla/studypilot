// OAuth 2.0 helper for Google Cloud service account authentication.
//
// Uses the native Web Crypto API (available in Deno) to sign JWTs —
// no external JWT library dependency, so there are no import/export issues
// across Deno versions.

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// The subset of a service account actually needed to mint tokens. Sourced
// from the split GOOGLE_* secrets when present (that pair is verified to
// work with Vertex AI in this project), else from the full
// GEMINI_SERVICE_ACCOUNT_CREDENTIALS JSON blob.
interface SigningIdentity {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri: string;
}

interface CachedToken {
  accessToken: string;
  /** Cache validity (absolute expiry minus safety margin). */
  expiresAt: number;
  /** Wall-clock expiry of the minted token (no margin). */
  absoluteExpiryMs: number;
  expiresInSeconds: number;
  scopes: string[];
}

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const AIPLATFORM_SCOPE = 'https://www.googleapis.com/auth/aiplatform';
const GENERATIVE_LANGUAGE_SCOPE =
  'https://www.googleapis.com/auth/generative-language';
const GENERATIVE_LANGUAGE_RETRIEVER_SCOPE =
  'https://www.googleapis.com/auth/generative-language.retriever';

/** RAG / Interactions / admin Edge paths — not returned to browsers. */
export const ADMIN_OAUTH_SCOPES = [
  CLOUD_PLATFORM_SCOPE,
  GENERATIVE_LANGUAGE_SCOPE,
  GENERATIVE_LANGUAGE_RETRIEVER_SCOPE,
] as const;

/**
 * Live WebSocket token candidates, narrowest first.
 * Vertex BidiGenerateContent documents cloud-platform; aiplatform /
 * generative-language are attempted so we do not assume that without trying.
 */
export const LIVE_OAUTH_SCOPE_CANDIDATES: readonly (readonly string[])[] = [
  [AIPLATFORM_SCOPE],
  [GENERATIVE_LANGUAGE_SCOPE],
  [CLOUD_PLATFORM_SCOPE],
];

/** Google SA JWT max is 3600s. Live WS is ~10 min — mint 15 min, not 1 h. */
export const LIVE_TOKEN_LIFETIME_SECONDS = 900;
export const ADMIN_TOKEN_LIFETIME_SECONDS = 3600;

let adminCachedToken: CachedToken | null = null;
let liveCachedToken: CachedToken | null = null;
let liveWinningScopes: string[] | null = null;

export function usesCloudPlatformScope(scopes: readonly string[]): boolean {
  return scopes.includes(CLOUD_PLATFORM_SCOPE);
}

function getSigningIdentity(): SigningIdentity {
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey,
      token_uri: 'https://oauth2.googleapis.com/token',
    };
  }

  const credentialsJson = Deno.env.get('GEMINI_SERVICE_ACCOUNT_CREDENTIALS');
  if (!credentialsJson) {
    throw new Error(
      'No Google credentials configured. Set GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY ' +
      'or GEMINI_SERVICE_ACCOUNT_CREDENTIALS in Supabase Dashboard → Edge Functions → Secrets.'
    );
  }
  try {
    const creds = JSON.parse(credentialsJson) as ServiceAccountCredentials;
    return {
      client_email: creds.client_email,
      private_key: creds.private_key,
      private_key_id: creds.private_key_id,
      token_uri: creds.token_uri || 'https://oauth2.googleapis.com/token',
    };
  } catch (e) {
    throw new Error(`Failed to parse service account credentials: ${(e as Error).message}`);
  }
}

/**
 * Resolve the GCP project id used for API routing (Vertex AI URLs, quota
 * project header). Explicit env vars win over the credentials JSON.
 */
export function getGoogleProjectId(): string | undefined {
  const explicit = Deno.env.get('GOOGLE_PROJECT_ID')
    || Deno.env.get('GOOGLE_CLOUD_PROJECT')
    || Deno.env.get('GCP_PROJECT_ID')
    || Deno.env.get('GEMINI_PROJECT_ID');
  if (explicit) return explicit;

  const credentialsJson = Deno.env.get('GEMINI_SERVICE_ACCOUNT_CREDENTIALS');
  if (!credentialsJson) return undefined;
  try {
    return (JSON.parse(credentialsJson) as { project_id?: string }).project_id;
  } catch {
    return undefined;
  }
}

/**
 * Base64url encode a Uint8Array (no padding).
 */
function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Encode a plain object as a base64url JSON string.
 */
function base64urlJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return base64url(bytes);
}

/**
 * Import a PEM-encoded RSA private key for RS256 signing.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and decode base64
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    derBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Create a signed RS256 JWT for Google Cloud service account auth.
 * `lifetimeSeconds` is capped at 3600 (Google SA JWT maximum).
 */
async function createServiceAccountJWT(
  creds: SigningIdentity,
  scopes: readonly string[],
  lifetimeSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const lifetime = Math.min(Math.max(lifetimeSeconds, 60), 3600);

  const header = base64urlJson({
    alg: 'RS256',
    typ: 'JWT',
    ...(creds.private_key_id ? { kid: creds.private_key_id } : {}),
  });
  const payload = base64urlJson({
    iss: creds.client_email,
    sub: creds.client_email,
    aud: creds.token_uri,
    iat: now,
    exp: now + lifetime,
    scope: scopes.join(' '),
  });

  const signingInput = `${header}.${payload}`;
  const signingBytes = new TextEncoder().encode(signingInput);

  const privateKey = await importPrivateKey(creds.private_key.replace(/\\n/g, '\n'));
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signingBytes);
  const signature = base64url(new Uint8Array(signatureBuffer));

  return `${signingInput}.${signature}`;
}

/**
 * Exchange a signed JWT for a Google Cloud access token.
 */
async function exchangeJWTForToken(
  jwt: string,
  tokenUri: string,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Token exchange failed (${res.status}): ${text}`);
    (err as Error & { status?: number; body?: string }).status = res.status;
    (err as Error & { status?: number; body?: string }).body = text;
    throw err;
  }

  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

function isInvalidScopeError(error: unknown): boolean {
  const err = error as { status?: number; body?: string; message?: string };
  const body = `${err.body ?? ''} ${err.message ?? ''}`.toLowerCase();
  return err.status === 400 &&
    (body.includes('invalid_scope') || body.includes('invalid scope'));
}

async function mintAccessToken(
  scopes: readonly string[],
  lifetimeSeconds: number,
  cacheSafetyMs: number,
): Promise<CachedToken> {
  const creds = getSigningIdentity();
  const jwt = await createServiceAccountJWT(creds, scopes, lifetimeSeconds);
  const tokenData = await exchangeJWTForToken(jwt, creds.token_uri);
  const googleExpires = Number(tokenData.expires_in) || lifetimeSeconds;
  // Cap reported/cache lifetime at the JWT we requested — do not keep a 1h
  // admin-style token around for Live even if Google returns expires_in=3600.
  const expiresInSeconds = Math.min(googleExpires, lifetimeSeconds);
  const absoluteExpiryMs = Date.now() + expiresInSeconds * 1000;
  return {
    accessToken: tokenData.access_token,
    expiresAt: absoluteExpiryMs - cacheSafetyMs,
    absoluteExpiryMs,
    expiresInSeconds,
    scopes: [...scopes],
  };
}

/**
 * Get a valid Google Cloud access token for server-side RAG / Interactions.
 * Never return this token from live-token — use getLiveAccessToken instead.
 */
export async function getAccessToken(): Promise<string> {
  if (adminCachedToken && adminCachedToken.expiresAt > Date.now()) {
    return adminCachedToken.accessToken;
  }

  adminCachedToken = await mintAccessToken(
    ADMIN_OAUTH_SCOPES,
    ADMIN_TOKEN_LIFETIME_SECONDS,
    300_000,
  );
  return adminCachedToken.accessToken;
}

export type LiveAccessToken = {
  accessToken: string;
  expiresAt: number;
  expiresInSeconds: number;
  scopes: string[];
  usedCloudPlatform: boolean;
};

function toLiveAccessToken(cached: CachedToken): LiveAccessToken {
  return {
    accessToken: cached.accessToken,
    expiresAt: cached.absoluteExpiryMs,
    expiresInSeconds: Math.max(
      0,
      Math.floor((cached.absoluteExpiryMs - Date.now()) / 1000),
    ),
    scopes: cached.scopes,
    usedCloudPlatform: usesCloudPlatformScope(cached.scopes),
  };
}

/**
 * Mint a Live-only OAuth token. Separate cache from RAG/admin. Tries
 * aiplatform, then generative-language, then cloud-platform. Google SA JWT
 * lifetime is 15 minutes (Live WS is ~10 min).
 */
export async function getLiveAccessToken(): Promise<LiveAccessToken> {
  if (liveCachedToken && liveCachedToken.expiresAt > Date.now()) {
    return toLiveAccessToken(liveCachedToken);
  }

  const candidates = liveWinningScopes
    ? [liveWinningScopes]
    : LIVE_OAUTH_SCOPE_CANDIDATES.map((scopes) => [...scopes]);

  let lastError: unknown;
  for (const scopes of candidates) {
    try {
      const minted = await mintAccessToken(
        scopes,
        LIVE_TOKEN_LIFETIME_SECONDS,
        60_000,
      );
      liveWinningScopes = minted.scopes;
      liveCachedToken = minted;
      return toLiveAccessToken(minted);
    } catch (error) {
      lastError = error;
      if (liveWinningScopes || !isInvalidScopeError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to mint a Live OAuth access token');
}

/**
 * Invalidate the cached admin token (e.g. after a 401 from the Gemini API).
 * Does not drop the Live-only cache — those tokens are never reused for RAG.
 */
export function invalidateToken(): void {
  adminCachedToken = null;
}

export function invalidateLiveToken(): void {
  liveCachedToken = null;
}
