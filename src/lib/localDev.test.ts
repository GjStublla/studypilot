import { describe, expect, it } from 'vitest';
import { isLoopbackUrl } from './localDev';

describe('isLoopbackUrl', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://[::1]:54321',
  ])('accepts local Supabase URL %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(true);
  });

  it.each([
    'https://example.supabase.co',
    'https://127.0.0.1.example.com',
    'not-a-url',
    '',
  ])('rejects non-local URL %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
  });
});
