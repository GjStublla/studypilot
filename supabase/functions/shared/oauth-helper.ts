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

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function getServiceAccountCredentials(): ServiceAccountCredentials {
  const credentialsJson = Deno.env.get('GEMINI_SERVICE_ACCOUNT_CREDENTIALS');
  if (!credentialsJson) {
    throw new Error(
      'GEMINI_SERVICE_ACCOUNT_CREDENTIALS secret is not set. ' +
      'Add it in Supabase Dashboard → Edge Functions → Secrets.'
    );
  }
  try {
    return JSON.parse(credentialsJson) as ServiceAccountCredentials;
  } catch (e) {
    throw new Error(`Failed to parse service account credentials: ${(e as Error).message}`);
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
 */
async function createServiceAccountJWT(creds: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = base64urlJson({ alg: 'RS256', typ: 'JWT', kid: creds.private_key_id });
  const payload = base64urlJson({
    iss: creds.client_email,
    sub: creds.client_email,
    aud: creds.token_uri,
    iat: now,
    exp: now + 3600,
    scope: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/generative-language',
      'https://www.googleapis.com/auth/generative-language.retriever',
    ].join(' '),
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
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

/**
 * Get a valid Google Cloud access token.
 * Caches the token in memory for its lifetime minus a 5-minute safety margin.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const creds = getServiceAccountCredentials();
  const jwt = await createServiceAccountJWT(creds);
  const tokenData = await exchangeJWTForToken(jwt, creds.token_uri);

  cachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000 - 300_000,
  };

  return cachedToken.accessToken;
}

/**
 * Invalidate the cached token (e.g. after a 401 from the Gemini API).
 */
export function invalidateToken(): void {
  cachedToken = null;
}
