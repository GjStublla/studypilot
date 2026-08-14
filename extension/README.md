# StudyPilot Live — Chrome MV3 scaffold (NOT production)

> **Not production. This folder is not shipped.**
> Canonical extension: sibling repo [`../studypilot-extension`](file:///c:/Users/gjins/Desktop/studypilot-extension)
> (`c:\Users\gjins\Desktop\studypilot-extension`). Develop, build, and load unpacked from there.
> `npm run extension:build` at the app-repo root builds **studypilot-extension**, not this scaffold.

Screen-aware voice coaching via **Gemini Live**. Ephemeral tokens are brokered by Supabase Edge; audio/video never proxy through Supabase.

## Architecture

```text
Content panel (injected UI)
    ↕  status / controls only — NO ephemeral token
Service worker
    ↕  bootstrap (incl. ephemeralToken) — PRIVATE
Offscreen document
    → raw WebSocket Live (v1beta BidiGenerateContentConstrained)
    → AudioWorklet mic (PCM16 @ 16 kHz)
    → Queued playback (PCM16 @ 24 kHz)
    → search_rubric tool → SW → live-rubric-search Edge
```

### Startup order (fresh Live)

1. Resolve canonical `chatId` (must already exist in `dashboard_chats`)
2. Generate client `liveSessionId` (UUID) for this Live run
3. Optional compressed JPEG of the active tab (`chrome.tabs.captureVisibleTab`)
4. `POST live-token` with user JWT → bootstrap + `initialTurns` + mint ephemeral token
5. Pass bootstrap **only** to offscreen → connect with `historyConfig.initialHistoryInClientContent: true`
6. `clientContent` / `sendClientContent({ turns: initialTurns, turnComplete: true })`
7. `realtimeInput.video` one screenshot
8. Mic audio chunks via `realtimeInput.audio`

On **session resumption**, history + screenshot are **not** reseeded (`seedHistoryAndScreenshot: false`).

### Security invariants

| Secret | Content panel | Service worker | Offscreen |
|--------|---------------|----------------|-----------|
| User JWT | may set via AUTH_SET_SESSION | stores / uses for Edge | never |
| Ephemeral Gemini token | **never** | brief handoff only | owns Live session |
| `GEMINI_API_KEY` | never | never | never |

Panel messages are sanitized; the panel also refuses any inbound payload containing `ephemeralToken` / `bootstrap` / `apiKey`.

While Live is active, chat/rubric selection is **frozen**. A second simultaneous Live start is **rejected** until stop.

## Load unpacked (canonical extension)

Do not load this scaffold. From the sibling repo:

```bash
cd ../studypilot-extension
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `studypilot-extension/dist`
4. Open any http(s) page, click the StudyPilot action icon to toggle the panel

From the app-repo root, `npm run extension:build` also builds `../studypilot-extension` (not this folder).

Runtime config can also be written to `chrome.storage.local` key `studypilot.config`:

```json
{ "supabaseUrl": "https://YOUR_PROJECT.supabase.co", "supabaseAnonKey": "eyJ..." }
```

## Edge contracts (aligned with migration + Edge Functions)

All routes: `POST {SUPABASE_URL}/functions/v1/<name>`  
Headers: `Authorization: Bearer <user JWT>`, `apikey: <anon key>`, `Content-Type: application/json`

Server requires `GEMINI_API_KEY` in Edge Function secrets / `supabase/functions/.env.local`.

### `live-token`

```json
// request
{
  "liveSessionId": "uuid",
  "chatId": "uuid",
  "saveToDashboard": true,
  "page": { "title": "...", "url": "..." },
  "mode": "Study Coach",
  "quotaRequestId": "uuid?"
}

// response
{
  "ephemeralToken": "...",
  "model": "...",
  "expireTime": "ISO-8601",
  "newSessionExpireTime": "ISO-8601",
  "liveSessionId": "uuid",
  "chatId": "uuid",
  "sessionId": "uuid|null",
  "contextThroughSequence": 0,
  "initialTurns": [],
  "rubric": { "id": "...", "title": "...", "fileSearchStatus": "..." },
  "ragReady": false,
  "saveToDashboard": true
}
```

### `live-rubric-search`

```json
// request
{ "liveSessionId": "uuid", "requestId": "uuid", "query": "..." }

// response
{
  "evidence": "...",
  "citations": [],
  "usedFileSearch": false,
  "storeName": "fileSearchStores/...",
  "message": "optional fallback note"
}
```

Used to fulfill Gemini Live `search_rubric` tool calls (`sendToolResponse`). Criteria/text fallbacks remain when File Search is not indexed.

### `live-turn`

```json
// request
{
  "liveSessionId": "uuid",
  "requestId": "uuid",
  "userMessageId": "uuid",
  "assistantMessageId": "uuid",
  "userText": "string|null",
  "assistantText": "string|null",
  "timeOffsetSeconds": 12,
  "originSurface": "extension",
  "usedFileSearch": false,
  "fileSearchStoreName": null,
  "groundingMetadata": null
}

// response
{ "ok": true, "action": "committed" }
```

Committed on each finalized voice pair. Failed commits are queued and **retried on stop**. Missing transcripts are **warned**, never fabricated.

### `live-finish`

```json
// request
{
  "liveSessionId": "uuid",
  "status": "finished",
  "reason": "user_stop",
  "durationSeconds": 42,
  "resumeHandle": "..."
}

// response
{ "ok": true, "sessionId": "uuid|null", "summaryStarted": false }
```

Called when the user stops Live (after turn flush).

## Phase 6 integration checklist

1. Apply migration `20260806010000_shared_chat_live_rag.sql` (local: `npx supabase db reset`; hosted: restore/migrate when ready).
2. Set Edge secrets: `GEMINI_API_KEY` (required for Live + File Search). See `supabase/functions/.env.local.example`.
3. Deploy JWT-verified functions (exactly 10; see `scripts/verify-function-allowlist.mjs` + `supabase/config.toml`):
   - `live-token`, `live-rubric-search`, `live-turn`, `live-finish`
   - `ensure-file-search-store`, `extract-rubric`, `index-knowledge-document`
   - `socratic-coach`, `summarize-session`, `delete-knowledge-document`
4. Build the canonical extension (`npm run extension:build` → `../studypilot-extension/dist`) and load that unpacked. Do not ship this `extension/` scaffold.
5. Confirm a real dashboard `chatId` is selected before Start Live (random UUIDs 404 on `live-token`).
6. Text/criteria coaching fallbacks stay enabled when File Search is not ready — do not remove them.

## Package layout

```text
extension/
  manifest.json
  package.json
  build.mjs
  src/
    background.ts          # SW: token broker, Edge, selection freeze
    offscreen.html / .ts   # Live state machine
    audio-worklet.js       # mic → PCM16 chunks
    content/panel.ts|.css  # injected UI
    lib/
      messages.ts          # typed protocol (token only SW↔offscreen)
      live-client.ts       # @google/genai Live wrapper
      pcm.ts
      edge.ts              # live-* Edge client
      config.ts
  dist/                    # load this folder unpacked
```

## Notes / follow-ups

- Canonical chat creation / history fetch are still stubbed in the SW until the panel passes a real dashboard `chatId`.
- Tab navigation: new content scripts call `PANEL_HELLO` / `GET_LIVE_STATUS` and reattach to the offscreen session without reseeding.
