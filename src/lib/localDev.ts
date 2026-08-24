const LOCAL_DEV_MODE_NAME = 'studypilot-local';

export const LOCAL_DEV_EMAIL = 'dev@studypilot.local';
export const LOCAL_DEV_PASSWORD = 'StudyPilot-local-dev-only-2026!';

export function isLoopbackUrl(value: string | undefined): boolean {
  if (!import.meta.env.DEV) return false;
  return isDevLoopbackUrl(value);
}

function isDevLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const { hostname, protocol } = new URL(value);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (
        hostname === '127.0.0.1' ||
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname === '[::1]'
      )
    );
  } catch {
    return false;
  }
}

const localModeRequested =
  import.meta.env.DEV && import.meta.env.MODE === LOCAL_DEV_MODE_NAME;
const localSupabaseConfigured = isLoopbackUrl(import.meta.env.VITE_SUPABASE_URL);

export const LOCAL_DEV_MODE = localModeRequested && localSupabaseConfigured;

if (localModeRequested && !localSupabaseConfigured) {
  console.error(
    '[StudyPilot] Local development mode requires VITE_SUPABASE_URL to use a loopback host.',
  );
}
