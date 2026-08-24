# StudyPilot Application Map

## High-level flow

index.html -> src/main.tsx -> src/App.tsx -> marketing sections or the lazy #dashboard route.

The canonical Chrome extension is the sibling repository at C:\Users\gjins\Desktop\studypilot-extension. The repository-local legacy scaffold is not part of releases.

## Web surface

- src/App.tsx owns the marketing page, hash-based legal pages, auth/dashboard routing, install CTA, and truthful capability copy.
- src/components/AuthPage.tsx handles sign-in/sign-up.
- src/components/LegalPage.tsx renders privacy, terms, cookies, and changelog content.
- src/components/Dashboard.tsx owns dashboard orchestration.
- src/components/dashboard/ contains the extracted shell, views, primitives, and context panel.
- src/lib/dashboardApi.ts is the FastAPI CRUD adapter.
- src/lib/studypilot-api.ts is the Supabase/Edge chat, RAG, usage, signed-capture, and sync adapter.
- src/lib/deploymentConfig.ts and scripts/verify-built-env.mjs enforce public production configuration.
- src/components/Dashboard.css and src/index.css contain scoped dashboard and marketing styling respectively.

## Canonical extension surface

The sibling extension is a Chrome MV3 package with content-panel orchestration, a service worker, offscreen live runtime, Supabase auth/chat facade, and Edge-mediated live-token/model access. It uses microphone audio while Live is active and only shares page URL, selected text, screenshots, or dashboard persistence when the user enables those controls.

The extension's verified entry points include:

- src/content/FloatingStudyPilot.tsx — current orchestration shell; deeper live/workspace extraction remains open.
- src/content/PanelComponents.tsx — extracted pure panel views and controls.
- src/content/liveCoachingState.ts — tested live-state derivation.
- src/shared/studypilotSupabase.ts — stable public facade.
- src/shared/studypilotSupabase.auth.ts and studypilotSupabase.chat.ts — auth and persistence modules.
- src/background/liveRuntime.ts — offscreen live lifecycle and privacy propagation.
- src/live/ — WebSocket/live transport and message types.

## Data flow

FastAPI owns profile/session/rubric/action-item CRUD. Supabase Auth, Postgres/RLS, Realtime, Storage, and Edge Functions own chat/RAG/live/synchronization. Vertex AI/Gemini is called by server-side code only. See docs/adr/0001-runtime-boundaries.md and docs/architecture/system.mmd.

## Assets and performance-sensitive code

Marketing assets live in public/assets. The hero uses the product modal SVG and the GradientBlinds OGL canvas; both are performance-sensitive. index.html preloads the hero product SVG and publishes canonical/Open Graph metadata. robots.txt and sitemap.xml are generated from public/.

## Verification map

- Web: npm test, npx tsc --noEmit, production build with approved public HTTPS values, verify-built-env, backend pytest, and local Supabase pgTAP.
- Extension: npm run typecheck, npm test, npm run build, npm run validate:manifest, and npm run test:e2e.
