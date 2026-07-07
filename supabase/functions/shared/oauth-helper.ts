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
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

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
    || Deno.env.get('GCP_PROJECT_ID');
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
 */
async function createServiceAccountJWT(creds: SigningIdentity): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

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

  const creds = getSigningIdentity();
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
