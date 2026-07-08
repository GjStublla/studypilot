# loop/ACCEPTANCE.md

Goal version: `gv-2026-07-08-transcripts-screenshots-v1`

Authority: user implementation plan "Part 2: transcripts + screenshots → AI → dashboard" + repo inspection 2026-07-08.

```yaml
- id: AC-00
  statement: >
    Phase 0 — Extension text coaching is unblocked: authenticated extension requests to
    socratic-coach stream a non-empty response, and the coach API accepts an optional
    history array (role + text) without breaking existing dashboard chat (sessionId + userMessage only).
  source: "Phase 0 — Unblock AI"
  authority: user plan + supabase/functions/socratic-coach/index.ts
  verifier: |
    cd ../studypilot-extension && npm run build && \
    rg "history" supabase/functions/socratic-coach/index.ts ../studypilot-extension/src/shared/studypilotSupabase.ts
  pass_evidence: >
    Build passes; socratic-coach parses optional history array; extension requestCoaching forwards
    recent turns; dashboard chat (src/lib/socraticCoach.ts) still works with sessionId + userMessage only.
  fail_evidence: >
    Extension build fails; socratic-coach 400/502 on extension-shaped POST; dashboard chat regression
    (src/lib/socraticCoach.ts) when history omitted.
  status: PASS_PENDING_FINAL
  depends_on: []
  reopen_condition: socratic-coach request contract changes or extension auth flow breaks
  last_verification: "2026-07-08: npm run build passed in studypilot-extension; powershell -ExecutionPolicy Bypass -File loop/final-verify.ps1 matched history in socratic-coach and extension studypilotSupabase."

- id: AC-01
  statement: >
    Phase 1 — Multimodal backend: supabase/functions/shared/gemini.ts accepts a parts array
    (text + inlineData {mimeType, data}) while keeping input string backward-compatible;
    socratic-coach accepts optional images [{mimeType, data}] (max 2, ~1.5 MB base64 each)
    appended to the user turn; dashboard chat unchanged when images omitted.
  source: "Phase 1 — Multimodal backend"
  authority: user plan + supabase/functions/shared/gemini.ts
  verifier: |
    npm run build && \
    rg "inlineData|parts" supabase/functions/shared/gemini.ts && \
    rg "images" supabase/functions/socratic-coach/index.ts
  pass_evidence: >
    gemini.ts builds multimodal contents from parts OR legacy input; socratic-coach validates
    image count/size and passes inlineData to createGeminiInteraction; existing text-only
    callers (summarize-session, extract-rubric, src/lib/socraticCoach.ts) still work.
  fail_evidence: >
    Text-only dashboard coaching breaks; images silently dropped; no size cap allowing >2 images.
  status: PASS_PENDING_FINAL
  depends_on: [AC-00]
  reopen_condition: gemini.ts API surface changes
  last_verification: "2026-07-08: npm run build passed in studypilot; PowerShell final verifier matched inlineData/parts in gemini.ts and images handling in socratic-coach."

- id: AC-02
  statement: >
    Phase 2 — Extension sends screenshots: background captureVisibleTab PNG is downscaled/compressed
    (~1024px JPEG via createImageBitmap + OffscreenCanvas in service worker); when panel Screenshot
    toggle is on, STUDYPILOT_REQUEST_COACHING attaches compressed image and background forwards
    images to socratic-coach; "image payloads are not wired yet" copy removed.
  source: "Phase 2 — Extension sends screenshots"
  authority: user plan + ../studypilot-extension/src/background/index.ts
  verifier: |
    cd ../studypilot-extension && npm run build && \
    rg "createImageBitmap|OffscreenCanvas|jpeg|images" src/background src/shared/studypilotSupabase.ts && \
    ! rg "image payloads are not wired|Image sharing is not wired yet|Snapshot capture works; image is not sent yet" src/
  pass_evidence: >
    Screenshot toggle triggers capture + compress + images[] in socratic-coach body; stale UX strings gone.
  fail_evidence: >
    Screenshot toggle still text-only; uncompressed multi-MB PNG sent; capture not invoked.
  status: PASS_PENDING_FINAL
  depends_on: [AC-01]
  reopen_condition: manifest activeTab permission or capture API changes
  last_verification: "2026-07-08: npm run build passed in studypilot-extension; PowerShell final verifier matched createImageBitmap/OffscreenCanvas/jpeg/images and stale screenshot-copy grep returned no matches."

- id: AC-03
  statement: >
    Phase 3 — Running transcript: panel keeps transcript [{role, text, atSeconds}]; coaching
    requests include recent turns via history field; importStudySessionToSupabase inserts all
    transcript rows with real time_offset_seconds and duration_seconds (not single Q/A at 0/1).
  source: "Phase 3 — Running transcript (multi-turn coaching)"
  authority: user plan + ../studypilot-extension/src/shared/studypilotSupabase.ts
  verifier: |
    cd ../studypilot-extension && npm run build && \
    rg "atSeconds|transcript|history" src/content/FloatingStudyPilot.tsx src/shared && \
    rg "time_offset_seconds" ../studypilot-extension/src/shared/studypilotSupabase.ts
  pass_evidence: >
  Panel accumulates multi-turn transcript; save posts N session_messages with monotonic
  time_offset_seconds; duration_seconds reflects session span.
  fail_evidence: >
    Save still inserts exactly two rows at offsets 0 and 1 regardless of transcript length.
  status: PASS_PENDING_FINAL
  depends_on: [AC-00]
  reopen_condition: session_messages schema changes
  last_verification: "2026-07-08: npm run build passed in studypilot-extension; PowerShell final verifier matched atSeconds/transcript/history and time_offset_seconds persistence."

- id: AC-04
  statement: >
    Phase 4 — Screenshots visible in dashboard: private Storage bucket session-captures with RLS;
    sessions.screenshot_path TEXT via migration; extension save uploads JPEG via Storage REST API
    and sets screenshot_path; dashboard renders signed-URL thumbnail on session detail.
  source: "Phase 4 — Screenshots visible in dashboard"
  authority: user plan + context/supabase/supabase.md
  verifier: |
    test -f supabase/migrations/*session*captures* || test -f supabase/migrations/*screenshot*; \
    rg "session-captures|screenshot_path" supabase ../studypilot-extension/src ../studypilot/src
  pass_evidence: >
    Migration adds screenshot_path; bucket + RLS policies exist; extension upload on save;
    Dashboard session detail shows thumbnail from signed URL.
  fail_evidence: >
    screenshot_path column missing; bucket public without RLS; dashboard ignores path.
  status: PASS_PENDING_FINAL
  depends_on: [AC-02, AC-03]
  reopen_condition: storage policy or sessions schema changes
  last_verification: "2026-07-08: npm run build passed in studypilot and studypilot-extension; PowerShell final verifier found session-captures/screenshot_path migration, extension upload, and dashboard signed thumbnail wiring."

- id: AC-05
  statement: >
    Phase 5 (optional) — Voice transcription interim: Web Speech API in content script provides
    local interim transcription surfaced in the extension panel (no server round-trip required).
  source: "Phase 5 (optional) — Voice transcription interim"
  authority: user plan
  verifier: |
    cd ../studypilot-extension && npm run build && \
    rg "SpeechRecognition|webkitSpeechRecognition|speech" src/content
  pass_evidence: >
    Content script starts/stops Web Speech recognition; interim/final text appears in panel UI.
  fail_evidence: >
    No speech hooks; feature flag absent with no documented skip.
  status: OPEN
  depends_on: [AC-00]
  reopen_condition: browser speech API unavailable — mark QUARANTINED with platform note
  last_verification: null

- id: AC-06
  statement: >
    Phase 6 — End-to-end verification: deploy updated edge functions, rebuild extension, full flow
    (coach with screenshot + multi-turn → save → dashboard Realtime shows transcript + thumbnail +
    summarize-session) documented in loop/VERIFY.md with command transcript.
  source: "Phase 6 — End-to-end verification"
  authority: user plan
  verifier: loop/final-verify.sh
  pass_evidence: >
    VERIFY.md contains dated pass matrix for AC-00..AC-04 (AC-05 if attempted); builds green;
    manual or MCP deploy step recorded.
  fail_evidence: >
    VERIFY.md empty; E2E steps fail; extension session not appearing in dashboard Realtime.
  status: OPEN
  depends_on: [AC-00, AC-01, AC-02, AC-03, AC-04]
  reopen_condition: any prerequisite AC reopens
  last_verification: >
    2026-07-08 (Cursor): deployed socratic-coach to rqszloxxegvxaedptcqj via npx supabase functions deploy;
    applied session-captures migration via Management API; live production smoke passed for history SSE (200 + [DONE])
    and multimodal images SSE (200 + [DONE]). Builds + PowerShell final-verify.ps1 PASS. Chrome extension→dashboard
    Realtime E2E not yet run — requires manual unpacked-extension pass (see loop/VERIFY.md).
```
