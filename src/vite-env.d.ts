/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the StudyPilot FastAPI backend. Falls back to localhost:8000. */
  readonly VITE_API_BASE_URL?: string;

  /** The public URL for your Supabase project */
  readonly VITE_SUPABASE_URL: string;

  /** The public anonymous API key for your Supabase project */
  readonly VITE_SUPABASE_ANON_KEY: string;

  /**
   * Optional public Chrome Web Store listing.
   * Must be an https://chromewebstore.google.com/ URL when set.
   */
  readonly VITE_CHROME_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}