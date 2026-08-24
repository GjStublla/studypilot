# Dashboard Runtime Map

The dashboard is the persistent memory layer for the canonical Chrome extension. The extension supplies page context, optional screenshots, microphone/live coaching, and session events; the dashboard owns durable review: chats, transcripts, summaries, rubrics, citations, and action items.

## Entry and routing

src/App.tsx lazy-loads src/components/Dashboard.tsx when the hash starts with #dashboard. There is no router package. Dashboard.tsx owns the view state and URL chat deep-link synchronization.

## Component map

- src/components/Dashboard.tsx — orchestration: authenticated data loading, realtime reconciliation, mutations, chat send lifecycle, view selection, and shared callbacks.
- src/components/dashboard/DashboardShell.tsx — sidebar and top bar.
- src/components/dashboard/HomeView.tsx — summary cards and recent activity.
- src/components/dashboard/ChatView.tsx — chat rail, composer, message/citation rendering, rename/delete, and retry UI.
- src/components/dashboard/SessionsView.tsx — session list.
- src/components/dashboard/SessionDetailView.tsx — screenshot preview, summary, transcript, rubric, action items, and follow-up prompts.
- src/components/dashboard/RubricsView.tsx — rubric list, activation, upload, indexing, retry, and criteria.
- src/components/dashboard/ActionItemsView.tsx — open/done action items and source navigation.
- src/components/dashboard/SettingsView.tsx — account, theme, and coach-mode settings.
- src/components/dashboard/ContextPanel.tsx — active rubric, extension session context, suggested next steps, and usage counts.
- src/components/dashboard/DashboardPrimitives.tsx — shared buttons, empty states, score dots, and todo rows.

The extracted views are props-driven. Durable state remains in the orchestration shell until the request-state and cancellation refactor is complete. Dashboard.tsx is approximately 1,161 lines; the remaining maintainability target is below 1,000 lines without changing cross-surface behavior.

## Data boundaries

- src/lib/dashboardApi.ts is the typed FastAPI CRUD adapter for profiles, sessions, rubrics, transcripts, and action items.
- src/lib/studypilot-api.ts is the typed Supabase/Edge adapter for dashboard chats, rubric retrieval/indexing, usage, signed screenshot URLs, and chat/session continuation.
- src/lib/useRealtime.ts treats Realtime rows as reconciliation inputs; canonical API data remains authoritative.
- src/lib/dashboard-chat-state.ts reconciles canonical messages with pending/legacy rows and suppresses stale loads.

The dashboard must not call model providers directly, and it must not duplicate FastAPI CRUD in the Supabase adapter. See docs/adr/0001-runtime-boundaries.md for the ownership decision.

## View state and failure behavior

The current view union is home | chat | sessions | session-detail | rubrics | action-items | settings. Chat deep links use #dashboard?chat=<id>. Network/auth/indexing/model failures surface recoverable empty, error, retry, or reconnect states; do not convert these into silent empty success states.

The next refactor should replace independent boolean loading/error flags with explicit request states (idle | loading | success | error), add cancellation guards for chat sends/indexing/view changes, and add unmount cleanup tests.

## Styling and accessibility

src/components/Dashboard.css remains the shared scoped stylesheet. Selectors are scoped under .app-dashboard; splitting shell/chat/content styles is still open. Icon-only controls should retain accessible names and visible focus styles. Reduced-motion rules are present, but axe/contrast verification is still required.

## Verification

- npm test — dashboard and shared web tests.
- npx tsc --noEmit — TypeScript gate.
- npm run build with approved public HTTPS build values.
- node scripts/verify-built-env.mjs dist — fail-closed built bundle scan.
- python -m pytest backend/tests -q — FastAPI behavior/security tests.
- npx supabase test db — local RLS/privilege/contract tests after a clean reset.
