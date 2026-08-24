export type DeploymentMode = 'production' | 'local';

export type PublicDeploymentEnv = {
  VITE_API_BASE_URL?: string | undefined;
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
};

export type DeploymentValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const LOCAL_VITE_MODE = 'studypilot-local';

const REQUIRED_URL_KEYS = ['VITE_API_BASE_URL', 'VITE_SUPABASE_URL'] as const;
const REQUIRED_KEYS = [...REQUIRED_URL_KEYS, 'VITE_SUPABASE_ANON_KEY'] as const;

/** JWT-shaped public anon key: two JSON segments plus a signature. Never log the value. */
const ANON_KEY_SHAPE = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isExplicitLocalViteMode(mode: string): boolean {
  return mode === LOCAL_VITE_MODE;
}

export function shouldValidateProductionBundle(command: string, mode: string): boolean {
  return command === 'build' && !isExplicitLocalViteMode(mode);
}

export function mergePublicDeploymentEnv(
  processEnv: Record<string, string | undefined>,
  fileEnv: Record<string, string | undefined>,
): PublicDeploymentEnv {
  return {
    VITE_API_BASE_URL: processEnv.VITE_API_BASE_URL ?? fileEnv.VITE_API_BASE_URL,
    VITE_SUPABASE_URL: processEnv.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: processEnv.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY,
  };
}

export function validatePublicDeploymentEnv(
  env: PublicDeploymentEnv,
  mode: DeploymentMode,
): DeploymentValidationResult {
  for (const key of REQUIRED_KEYS) {
    const value = trimEnv(env[key]);
    if (!value) {
      return fail(
        mode === 'production'
          ? `${key} is required for production builds.`
          : `${key} is required in explicit local mode.`,
      );
    }
  }

  for (const key of REQUIRED_URL_KEYS) {
    const value = trimEnv(env[key]);
    const urlResult = validatePublicUrl(key, value, mode);
    if (!urlResult.ok) return urlResult;
  }

  const anonKey = trimEnv(env.VITE_SUPABASE_ANON_KEY);
  if (!isPublicAnonKeyShape(anonKey)) {
    return fail('VITE_SUPABASE_ANON_KEY is missing or has an invalid public key shape.');
  }

  return { ok: true };
}

export function assertPublicDeploymentEnv(
  env: PublicDeploymentEnv,
  mode: DeploymentMode,
): void {
  const result = validatePublicDeploymentEnv(env, mode);
  if (result.ok === false) {
    throw new Error(result.error);
  }
}

export function isPublicAnonKeyShape(value: string): boolean {
  const key = value.trim();
  if (key.length < 32 || key.length > 4096) return false;
  return ANON_KEY_SHAPE.test(key);
}

function validatePublicUrl(
  key: string,
  value: string,
  mode: DeploymentMode,
): DeploymentValidationResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(`${key} is not a valid URL.`);
  }

  if (url.username || url.password) {
    return fail(
      mode === 'production'
        ? `${key} must be a public HTTPS URL for production builds.`
        : `${key} must be a loopback HTTP URL in explicit local mode.`,
    );
  }

  if (mode === 'local') {
    if (url.protocol !== 'http:' || !LOCAL_HTTP_HOSTS.has(url.hostname.toLowerCase())) {
      return fail(`${key} must be a loopback HTTP URL in explicit local mode.`);
    }
    return { ok: true };
  }

  if (url.protocol !== 'https:' || isPrivateOrLoopbackHostname(url.hostname)) {
    return fail(`${key} must be a public HTTPS URL for production builds.`);
  }

  return { ok: true };
}

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname).toLowerCase();
  if (!host || host === 'localhost' || host === '0.0.0.0' || host === '::' || host === '::1') {
    return true;
  }
  if (host === 'localhost.' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }

  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const ipv4Host = mapped ? mapped[1] : host;
  const ipv4 = parseIpv4(ipv4Host);
  if (ipv4) return isPrivateOrLoopbackIpv4(ipv4);

  if (host.includes(':')) {
    return isPrivateOrLoopbackIpv6(host);
  }

  return false;
}

function isPrivateOrLoopbackIpv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateOrLoopbackIpv6(host: string): boolean {
  if (host === '::1') return true;
  const first = host.split(':', 1)[0] ?? '';
  if (first.toLowerCase().startsWith('fe80')) return true;
  const hextet = Number.parseInt(first, 16);
  if (!Number.isNaN(hextet) && hextet >= 0xfc00 && hextet <= 0xfdff) return true;
  return false;
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return nums as [number, number, number, number];
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function trimEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fail(error: string): DeploymentValidationResult {
  return { ok: false, error };
}
