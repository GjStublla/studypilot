# StudyPilot final report content (submission draft)

The nine required sections are present in the PDF's order. Team contribution
text, deployment links, pilot measurements, and media links remain approval or
external-release inputs and are intentionally not invented here.

These sections describe what the beta does. They do not claim measured gains in learning, citation accuracy, speed, privacy, or reliability.

## 1. Project Overview

StudyPilot is a rubric-aware coaching loop across the browser and dashboard: it uses the page, the student's question, and an uploaded rubric to coach the next improvement, then carries the conversation and action items into the dashboard.

The beta has two connected surfaces:

- A Chrome extension panel on the study page the student is already using.
- A web dashboard for the same chats, sessions, rubrics, and action items.

Coaching in this beta uses the student's microphone and the page context they choose to share. When grounding is available, answers can cite retrieved rubric or uploaded-document evidence. The product does not promise timestamped lecture citations.

An account connection is required for real coaching. Sign in once to connect the extension and dashboard.

Live microphone audio is processed by Google Vertex AI while a session is active. Screenshots are sent only when the student enables them. Chat and session history save only when “Save to dashboard” is on. Those storage choices default off.

## 2. Problem Statement

Students often work in a browser tab with an assignment prompt or rubric nearby, then switch to a separate chatbot that cannot see the page or the rubric. Feedback in that setup is generic: it is not tied to the criterion the student is being graded on, and it does not continue in a durable workspace.

The problem this project takes on is operational, not a measured learning-outcome claim:

- Page context, the student's question, and the rubric live in different places.
- Coaching that happens in the browser is easy to lose when the tab closes.
- Next steps (what to revise, what to practice) are not carried into a dashboard the student can return to.

StudyPilot does not claim that students currently fail courses because of this split, or that any existing tool has a measured accuracy or speed deficit. It claims only that the workflow is fragmented.

## 3. Solution Overview

StudyPilot keeps one coaching loop across the two surfaces the student already uses.

1. The student signs in once to connect the extension and dashboard.
2. They open a study page and share the page context they choose (URL, selected text; screenshots only if enabled).
3. They ask a question or start a Live microphone session. Live audio is processed by Google Vertex AI while the session is active.
4. When a rubric or uploaded document has been indexed, answers can cite that retrieved evidence. If grounding is not available, the product does not invent a citation.
5. If “Save to dashboard” is on, the conversation and action items continue in the dashboard. If it is off, the session is not persisted there.

The solution is a connected coaching workflow, not a claim that students learn more, finish faster, or receive perfectly accurate citations. Those outcomes are out of scope until a later validation phase measures them.

## 4. Development Process

The implementation used characterization-first phases. Existing behavior was tested before boundary changes, then each completed slice was committed independently and re-run through the relevant unit, integration, build, database, or browser checks.

The current evidence includes web Vitest, FastAPI pytest, local Supabase pgTAP, extension Vitest, TypeScript builds, manifest validation, and unpacked extension Playwright. Hosted deployment, production smoke testing, pilot collection, and the final clean-profile golden flow remain explicit release gates rather than implied by local tests.

The reproducible local snapshot is: web Vitest 19 files/106 tests, web
Playwright 4/4, FastAPI pytest 26 tests, local Supabase pgTAP 291 assertions,
and the canonical extension Vitest 20 files/98 tests with unpacked Playwright
15/15. The current web release wrapper also passes claim tests (8/8),
submission-artifact tests (7/7), the public-placeholder production build, and
the built-environment scan. These are local engineering signals, not hosted
availability, clean-profile production proof, pilot outcomes, or causal
learning evidence; the hosted function allowlist is explicitly skipped when
protected credentials are unavailable.

## 5. Technical Stack

| Layer | Technologies used in the submitted code |
|---|---|
| Web UI | React 19, TypeScript, Vite, Framer Motion, Lucide |
| CRUD API | FastAPI, Python, Supabase client, single-worker-safe rate limiting |
| Data/auth | Supabase Auth, Postgres/RLS, Realtime, Storage, Edge Functions, Deno tests |
| Model/live path | Server-brokered Vertex AI/Gemini; Chrome MV3 offscreen live runtime |
| Extension | Chrome MV3, content panel, service worker, offscreen document, WebSocket/live transport |
| Verification | Vitest, pytest, pgTAP, Playwright, GitHub Actions, Docker |

## 6. Architectural Design Diagram

The source diagram is `docs/architecture/system.mmd`, with the report-readable render at `docs/architecture/system.png`; its decision record is `docs/adr/0001-runtime-boundaries.md`. FastAPI owns profile/session/rubric/action-item CRUD. Supabase owns Auth, RLS, Realtime, Storage, Edge chat/RAG/live workflows, and cross-surface synchronization. Browser clients never receive model or service-role secrets.

## 7. Features Implemented

- Rubric upload, activation, indexing status, retry, and criteria display.
- Browser coaching from selected page context and optional screenshot capture.
- Grounded chat when indexed rubric/document evidence is available.
- Live microphone coaching through the offscreen runtime and server-brokered token path.
- Shared chats, sessions, transcripts, screenshots, summaries, and action items.
- Dashboard session detail, follow-up prompts, citations, usage display, and continuation links.
- Privacy controls that keep screenshot capture and dashboard persistence independently off by default.
- Recoverable auth, network, microphone-denial, indexing, and model-error states covered by the current tests.

## 8. Challenges Faced & Solutions

### Cross-surface chat synchronization

The extension and dashboard can observe the same chat through different paths and historical row shapes. The solution uses canonical adapters, Realtime reconciliation, sequence/request identifiers, and pending-message overlays rather than treating local rows as durable truth.

### Privacy-safe live context and persistence

Live audio processing and optional storage are separate decisions. Explicit privacy options, independent settings, server-side propagation, and default-off tests prevent enabling screenshot capture from silently enabling dashboard persistence.

### Grounded rubric retrieval and secure model brokering

Rubric grounding is asynchronous and may fail or remain unavailable. The UI exposes indexing/retry/error states, while model access remains behind authenticated Edge/backend code so the browser bundle contains no model API key.

## 9. Team Contributions

Replace the placeholders below with each member's approved contribution text. Do not infer percentages from Git history.

**Owner:** The team lead must replace these placeholders with approved member names and contribution text before submission.

- **[Member name]:** [approved role and contribution]
- **[Member name]:** [approved role and contribution]
- **[Member name]:** [approved role and contribution]
