const CHROME_WEBSTORE_HOST = 'chromewebstore.google.com';

export const BETA_ACCESS_MAILTO =
  'mailto:hello@studypilot.app?subject=StudyPilot%20beta%20access';

export type LegalPageId = 'privacy' | 'terms' | 'cookies' | 'changelog';

export const LEGAL_HASHES: Record<LegalPageId, `#/${LegalPageId}`> = {
  privacy: '#/privacy',
  terms: '#/terms',
  cookies: '#/cookies',
  changelog: '#/changelog',
};

export function parseChromeWebStoreUrl(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.hostname !== CHROME_WEBSTORE_HOST) return null;
    if (url.hash.slice(1).toLowerCase().startsWith('javascript:')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function getChromeWebStoreUrl(): string | null {
  return parseChromeWebStoreUrl(import.meta.env.VITE_CHROME_STORE_URL);
}

export function parseLegalHash(hash: string): LegalPageId | null {
  const path = hash.split('?')[0].replace(/\/$/, '') as `#/${LegalPageId}` | string;
  switch (path) {
    case '#/privacy':
    case '#/terms':
    case '#/cookies':
    case '#/changelog':
      return path.slice(2) as LegalPageId;
    default:
      return null;
  }
}
