import { describe, expect, it } from 'vitest';
import {
  assertPublicDeploymentEnv,
  isExplicitLocalViteMode,
  isPublicAnonKeyShape,
  mergePublicDeploymentEnv,
  shouldValidateProductionBundle,
  validatePublicDeploymentEnv,
  type PublicDeploymentEnv,
} from './deploymentConfig';

const VALID_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.testsuffix';

const VALID_PRODUCTION: PublicDeploymentEnv = {
  VITE_API_BASE_URL: 'https://api.example.test',
  VITE_SUPABASE_URL: 'https://auth.example.test',
  VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
};

function expectValueFree(error: string, secret: string): void {
  expect(error).not.toContain(secret);
  expect(error).not.toMatch(/https?:\/\//i);
  expect(error).not.toContain('eyJ');
}

describe('validatePublicDeploymentEnv production', () => {
  it('accepts public HTTPS URLs and a shape-valid anon key', () => {
    expect(validatePublicDeploymentEnv(VALID_PRODUCTION, 'production')).toEqual({ ok: true });
  });

  it('rejects a missing URL without echoing values', () => {
    const result = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_API_BASE_URL: '' }, 'production');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_API_BASE_URL is required for production builds.');
    expectValueFree(result.error, VALID_ANON_KEY);
  });

  it('rejects whitespace-only required values as missing', () => {
    const result = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_SUPABASE_URL: '   ' }, 'production');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_SUPABASE_URL is required for production builds.');
  });

  it('rejects a malformed URL without echoing it', () => {
    const malformed = 'not a url';
    const result = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_API_BASE_URL: malformed }, 'production');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_API_BASE_URL is not a valid URL.');
    expectValueFree(result.error, malformed);
  });

  it('rejects loopback production URLs without echoing them', () => {
    const loopback = 'http://localhost:8000';
    const result = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_API_BASE_URL: loopback }, 'production');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_API_BASE_URL must be a public HTTPS URL for production builds.');
    expectValueFree(result.error, loopback);
    expect(result.error).not.toContain('localhost');
    expect(result.error).not.toContain('127.0.0.1');
  });

  it('rejects http://127.0.0.1 in production', () => {
    const result = validatePublicDeploymentEnv(
      { ...VALID_PRODUCTION, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' },
      'production',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_SUPABASE_URL must be a public HTTPS URL for production builds.');
    expect(result.error).not.toContain('127.0.0.1');
  });

  it('rejects HTTPS loopback and private hosts in production', () => {
    const rejected = [
      'https://localhost',
      'https://127.0.0.1',
      'https://10.0.0.8',
      'https://192.168.1.20',
      'https://172.16.0.4',
      'https://169.254.1.1',
    ];
    for (const url of rejected) {
      const result = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_API_BASE_URL: url }, 'production');
      expect(result.ok, url).toBe(false);
      if (result.ok) continue;
      expectValueFree(result.error, url);
    }
  });

  it('rejects a missing or malformed anon key without echoing it', () => {
    const missing = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_SUPABASE_ANON_KEY: '' }, 'production');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error).toBe('VITE_SUPABASE_ANON_KEY is required for production builds.');

    const malformed = 'not-a-jwt';
    const shape = validatePublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_SUPABASE_ANON_KEY: malformed }, 'production');
    expect(shape.ok).toBe(false);
    if (shape.ok) return;
    expect(shape.error).toBe('VITE_SUPABASE_ANON_KEY is missing or has an invalid public key shape.');
    expectValueFree(shape.error, malformed);
  });
});

describe('validatePublicDeploymentEnv explicit local mode', () => {
  const localEnv: PublicDeploymentEnv = {
    VITE_API_BASE_URL: 'http://127.0.0.1:8000',
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
  };

  it('allows http://127.0.0.1 and http://localhost', () => {
    expect(validatePublicDeploymentEnv(localEnv, 'local')).toEqual({ ok: true });
  });

  it('rejects public HTTPS URLs in explicit local mode', () => {
    const result = validatePublicDeploymentEnv(VALID_PRODUCTION, 'local');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_API_BASE_URL must be a loopback HTTP URL in explicit local mode.');
    expectValueFree(result.error, 'https://api.example.test');
  });

  it('rejects missing local URLs', () => {
    const result = validatePublicDeploymentEnv({ ...localEnv, VITE_SUPABASE_URL: undefined }, 'local');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('VITE_SUPABASE_URL is required in explicit local mode.');
  });
});

describe('assertPublicDeploymentEnv', () => {
  it('throws a value-free error for loopback production URLs', () => {
    expect(() =>
      assertPublicDeploymentEnv({ ...VALID_PRODUCTION, VITE_API_BASE_URL: 'http://localhost:8000' }, 'production'),
    ).toThrow('VITE_API_BASE_URL must be a public HTTPS URL for production builds.');
  });

  it('does not throw for valid HTTPS production config', () => {
    expect(() => assertPublicDeploymentEnv(VALID_PRODUCTION, 'production')).not.toThrow();
  });
});

describe('vite production-bundle gate', () => {
  it('validates ordinary production builds and skips explicit local mode', () => {
    expect(shouldValidateProductionBundle('build', 'production')).toBe(true);
    expect(shouldValidateProductionBundle('build', 'studypilot-local')).toBe(false);
    expect(shouldValidateProductionBundle('serve', 'production')).toBe(false);
    expect(isExplicitLocalViteMode('studypilot-local')).toBe(true);
    expect(isExplicitLocalViteMode('production')).toBe(false);
  });
});

describe('mergePublicDeploymentEnv', () => {
  it('lets process env override file env, including empty overrides', () => {
    expect(
      mergePublicDeploymentEnv(
        { VITE_API_BASE_URL: 'https://api.example.test' },
        { VITE_API_BASE_URL: 'http://localhost:8000', VITE_SUPABASE_URL: 'https://auth.example.test' },
      ),
    ).toEqual({
      VITE_API_BASE_URL: 'https://api.example.test',
      VITE_SUPABASE_URL: 'https://auth.example.test',
      VITE_SUPABASE_ANON_KEY: undefined,
    });

    expect(
      mergePublicDeploymentEnv({ VITE_API_BASE_URL: '' }, { VITE_API_BASE_URL: 'https://from-file.example.test' })
        .VITE_API_BASE_URL,
    ).toBe('');
  });
});

describe('isPublicAnonKeyShape', () => {
  it('accepts a JWT-shaped public key and rejects short or non-JWT values', () => {
    expect(isPublicAnonKeyShape(VALID_ANON_KEY)).toBe(true);
    expect(isPublicAnonKeyShape('')).toBe(false);
    expect(isPublicAnonKeyShape('eyJ.only')).toBe(false);
  });
});
