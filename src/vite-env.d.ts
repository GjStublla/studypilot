/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the StudyPilot FastAPI backend. Falls back to localhost:8000. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
