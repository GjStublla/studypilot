# loop/PROMPT.md

You are running a terminal goal loop on this repository.

Your job is not to explore the frontier.
Your job is to make a finite acceptance inventory pass without weakening it.

> **Loop provenance — composed by `/loopgen`.**
> Archetype: `goal`  ·  Divergences: `none`.
> Overlays: `none`.
> Consult-capability: `tier-2` (`plugin-supabase-supabase MCP, cursor-ide-browser MCP`).
> Evaluator tier: `n/a`.
> Frontload — resolved: [`motive`, `evidence_surface`, `consult_tier`]; defaulted: [`scope_manifest`, `stuck_attempt_n`, `cheap_channel`, `final_verify`, `gemini_budget`, `phase5_optional`]; open gaps: [`no supabase/migrations/ yet`, `remote deploy credentials unbound`, `Dashboard.tsx pre-existing TS risk`, `Phase 0 assumes working extension auth`].
> Primitive sources: `archetypes/goal.md`, `templates/bodies/goal-body.md`, `references/oracle-principles.md`, repo inspection of studypilot + studypilot-extension.
> Prompt-craft revision (rev-2 · 2026-07-08): OpenAI *Using Goals in Codex* (6-element goal contract: outcome · verification surface · constraints · boundaries · iteration policy · blocked-stop; budget ≠ completion) + *GPT-5.5 prompting guide* (outcome-first framing, explicit stop rules, one-line preamble, evidence-based validation). Goal shape unchanged; only front-loading + halt/preamble clarity added.
> Re-derive (do not hand-edit) when intent, sources, or environment change.

## Goal contract (outcome-first)

Read this first. Everything below is the operating detail for these six lines.

- **Outcome** — Part 2 shipped: extension coaching is multimodal (text + screenshots), multi-turn transcript history reaches both the coach and the dashboard, full sessions import, and the dashboard renders screenshot thumbnails — with dashboard text chat and the verified save → Realtime pipeline intact. (→ *Motive*)
- **Verification surface** — per-criterion `verifier` + `pass_evidence` in `loop/ACCEPTANCE.md`, the cheap build channel, and `loop/final-verify.sh`; live Gemini multimodal E2E (AC-06) is the consumer-side oracle. Completion is decided by this evidence, never by confidence. (→ *Acceptance inventory*, *Channels*, *Verifier discipline*)
- **Constraints (must not regress)** — dashboard text chat, the extension save → `session_messages` → `summarize-session` → Realtime flow, RLS on `session-captures`, and no secrets in extension code. (→ *Rules*, *Oracle-drift guard*)
- **Boundaries** — edit only *Scope manifest* surfaces across `studypilot` + sibling `../studypilot-extension`; tools are consult tier-2 (Supabase + browser MCP). (→ *Scope manifest*, *Runner contract*)
- **Iteration policy** — pick the next criterion by dependency topology → strongest failing evidence → cheapest verifier; make one small reversible change per iteration; record what changed, what the verifier showed, and the next best experiment in `loop/STATE.md`. (→ *Iteration protocol*)
- **Blocked-stop** — complete only when every required criterion reaches `PASS` in a single final-verify (`criteria-met`); otherwise halt honestly with a labeled cause + the blocker + what would unlock it. A budget or iteration ceiling is **not** completion. (→ *Halt conditions*)

## Motive

Close Part 2 of the StudyPilot extension→AI→dashboard pipeline: multimodal coaching (text + screenshots), multi-turn transcript history, full session import, and dashboard screenshot thumbnails — without breaking existing dashboard chat or the verified extension save → Realtime flow.

## Runner contract

This prompt is runner-agnostic internally. The canonical operator runner is
`/goal`, which re-invokes this prompt iteratively. The prompt assumes only:

1. Iterative re-invocation — you are one iteration.
2. File-persisted state — durable progress lives in named files, not memory.
3. A logical halt signal — emit `stop-and-summarize` when no useful
   iteration remains; the runner maps it.
4. A logical escalate signal — emit `escalate: <reason>` only when
   blocked on something genuinely irreversible or external (paid API
   without budget cap, public-publish, secrets, decisions that cannot
   be rolled back). Reversible judgment is not escalation — see the
   judgment default.

External ceilings (token limits, max-iterations, session length) are
runner concerns, not repository failure. Preserve the worktree and
summarize unresolved work for the next run.

## Judgment default

When the iteration hits a taste-based or inferred judgment call, prefer
the narrow reversible choice + log over pausing:

1. Pick the smallest reversible action consistent with the strongest
   available source.
2. Record an Alignment Review with: problem · context · options
   considered · chosen contract · alignment cost · rollback trigger ·
   review question for the human.
3. Continue. Human review happens after the fact.

Escalate (do not proceed) only when the action is irreversible,
externally blocked, or requires authority the loop cannot establish:

- paid APIs without budget caps,
- public-publish or messages-sent actions,
- secrets / credentials,
- product-direction changes whose rollback is unclear,
- source conflict between authoritative-current sources.

**Never call `AskUserQuestion` or any interactive / blocking / approval-prompt
tool, for any reason.** The runner may be unattended, so the call is a deadlock,
not a question. Route a reversible decision to the smallest default above + an
Alignment Review; route a needs-a-human or irreversible one to `escalate` /
`stop-and-summarize` with the question in the summary. Async, never interactive.

## Frontload

**Resolved**
- Motive: wire extension transcripts + screenshots through multimodal `socratic-coach` into dashboard sessions.
- Evidence: `npm run build` (studypilot), `npm run build` (studypilot-extension), per-row `rg` verifiers in `loop/ACCEPTANCE.md`, Supabase MCP for deploy/migrations when credentials available.
- Consult tier-2: Supabase + browser MCPs available; no tier-3 Agentify fabric.

**Defaulted (Alignment Review)**
- Scope: studypilot `supabase/functions/**`, `src/**`, `context/**`; sibling `../studypilot-extension/src/**` — forbidden unrelated dashboard refactors, logos, lh-home.json.
- Stuck threshold: 3 failed hypotheses per criterion.
- Cheap channel: build in whichever repo you edited.
- Final-verify: `loop/final-verify.sh` after all required rows `PASS_PENDING_FINAL`.
- Gemini budget: 120 edge-function invocations cap (ledger in `loop/STATE.md`); defer paid E2E when over cap.
- AC-05 optional: criteria-met allowed without voice transcription.

**Open gaps (derivation-gap halts if blocked)**
- Create `supabase/migrations/` for AC-04 (schema reference: `context/supabase/supabase.md`).
- Remote Supabase deploy secrets not in repo — AC-06 may need `genuine-escalate`.
- `context/runbook.md` warns Dashboard.tsx may have pre-existing TS errors — narrow edits only.

## Budget policy

Metered resource: **Gemini API calls** via Supabase Edge Functions (`socratic-coach`, `summarize-session`, etc.).

| Property | Contract |
|----------|----------|
| Cap | **120** edge-function Gemini invocations per loop run (count each `createGeminiInteraction` call in manual/E2E testing) |
| Ceiling surface | `loop/STATE.md` → `spend_ledger.cap` (read-only; do not raise in STATE) |
| Over-cap behavior | Defer AC-06 live E2E; log deferred work; continue code/verifier rows that need no paid calls |
| Spend ledger | Increment `spend_ledger.gemini_edge_invocations` in STATE before each test invocation |
| Per-atom re-check | Re-read ledger before each E2E coaching test |
| Bootstrap cost | Inventory/bootstrap iterations cost **0** against cap |

## Oracle principles

This loop is honest by construction (full text in
`references/oracle-principles.md`):

1. **Oracle is binary** — pass/fail; never subjective, never self-assessment.
2. **Oracle independence** — a verifier you author must first fail against
   the unmet behavior (mutation, sentinel, known wrong fixture). If it
   cannot fail, it cannot prove.
3. **Consumer-side oracle** — *"if this passes, does the user have a
   working feature?"* If the answer requires inference, the verifier is
   wrong.
4. **Anti-theater** — `FIXED ≠ CLOSED`. A criterion's own verifier passing
   is `PASS_PENDING_FINAL`, not `PASS`. `PASS` requires the **final-verify**
   to prove the whole inventory in one repo state.

## Terminal contract

The run is complete only when **every required criterion** in `loop/ACCEPTANCE.md`
for goal version `gv-2026-07-08-transcripts-screenshots-v1` reaches `PASS`.
AC-05 is optional — completion does not require AC-05.

Completion is a specific halt:

1. emit `criteria-met`
2. then emit `stop-and-summarize`
3. label the halt cause `criteria-met`

Do not emit `criteria-met` for partial completion, local green commands,
manual confidence, or "all easy rows done."

## Goal version

`gv-2026-07-08-transcripts-screenshots-v1` — fingerprint of the frozen inventory + authority
sources + final-verify.

If an authoritative source changes mid-run, do **not** silently absorb it.
Stop, record the source change, and re-derive a new goal version — unless
this prompt explicitly says this is regression mode for the same frozen
version.

## Acceptance inventory

`loop/ACCEPTANCE.md` is the live anchor inventory. Statuses:

- `OPEN` — no criterion-specific proof yet.
- `PASS_PENDING_FINAL` — the criterion's own verifier passed, but the
  final-verify hasn't proved the whole inventory together since.
- `PASS` — the final-verify proved this criterion in the same repo state
  as every other criterion.
- `STUCK` — `3` consecutive failed hypotheses with no
  new evidence.
- `BLOCKED_EXTERNAL` — genuine irreversible / external blocker.
- `QUARANTINED` — provenance, criteria, or verifier integrity conflict.

Only `PASS` counts for terminal completion. Every accepted change cites
≥1 criterion ID.

## Verifier discipline

Each criterion has a `verifier` command and `pass_evidence` in
`loop/ACCEPTANCE.md`.

**Valid pass evidence:**

- named test selector passes (with criterion-specific assertion)
- JSON field equals expected value
- CLI output contains exact semantic line
- generated artifact exists and validates
- DOM assertion holds
- migration produces expected schema / row count
- performance threshold met against recorded bound
- error trace includes expected failure legibility

**Invalid pass evidence:**

- "looks good" / manual inspection
- "the suite is green" with no criterion mapping
- snapshot refreshed to current wrong output
- skipped / xfailed criterion
- mocked path replacing integration proof
- assertion-free fixture
- a test you just authored, used as both verifier *and* source of intent

A verifier you author must first **fail** (oracle principle #2). For each
criterion, ask: *if this passes, does the user have a working feature?*
If the answer requires inference, redesign the verifier (principle #3).

## Channels

- **Cheap inner channel:** `npm run build` in studypilot after backend/dashboard edits; `cd ../studypilot-extension && npm run build` after extension edits — run after edits, before the criterion-specific verifier.
- **Per-criterion verifier:** the `verifier` field on each criterion.
- **Final-verify:** `bash loop/final-verify.sh` (or equivalent documented in `loop/VERIFY.md`) — run for terminal completion and as a checkpoint after cross-criterion edits.
- **Deploy channel (AC-06):** Supabase MCP `deploy_edge_function` when project is linked; otherwise document manual deploy and `genuine-escalate`.

## Dependency topology

```
AC-00 (root)
├── AC-01 → AC-02 → AC-04 ─┐
├── AC-03 ──────────────────┼→ AC-06
└── AC-05 (optional, parallel after AC-00)
```

Criteria are independent unless this topology says otherwise.

- The graph is acyclic; dependencies are *proof* dependencies, not
  implementation preference.
- A child criterion cannot be `PASS` while a prerequisite is failing.
- Passing criteria are regression guards for dependent edits.
- An edit touching multiple criteria cites every affected ID and names
  the primary failing criterion.

Selection order: unmet dependencies first → user-priority when explicit
→ strongest failing evidence → cheapest verifier feedback → highest
regression risk.

Recommended implementation order: **AC-00 → AC-01 → AC-02 ∥ AC-03 → AC-04 → AC-06** (AC-05 anytime after AC-00 if bandwidth).

## Bootstrap mode

**Enter when** `loop/STATE.md` has `iteration: 0` OR `current_criterion` is null.

**Bootstrap steps (once per goal version):**
1. Read `loop/ACCEPTANCE.md`, `loop/STATE.md`, `context/supabase/supabase.md`, and skim key surfaces: `supabase/functions/shared/gemini.ts`, `supabase/functions/socratic-coach/index.ts`, `../studypilot-extension/src/shared/studypilotSupabase.ts`, `../studypilot-extension/src/background/index.ts`, `../studypilot-extension/src/content/FloatingStudyPilot.tsx`.
2. Confirm goal version `gv-2026-07-08-transcripts-screenshots-v1` matches inventory.
3. If any open frontload gap blocks the first OPEN row, either close it with a reversible default (log Alignment Review) or halt `derivation-gap` with the gap named.
4. Set `iteration: 1`, `phase: execute`, `current_criterion` to the first OPEN row per topology (AC-00), `next_action` to that criterion's hypothesis, write STATE, then **continue into the iteration protocol** — do not stop after bootstrap alone.

**Exit when** bootstrap fields are written and the first criterion is selected.

On subsequent iterations (`iteration ≥ 1`), **skip bootstrap**.

## Iteration protocol

Open each iteration with a **one-line preamble**: the selected criterion ID +
the single next action you are about to attempt (e.g.
`AC-01 | add parts[] path to gemini.ts`). One line only — orientation, not a
plan.

1. Read `loop/ACCEPTANCE.md`, `loop/STATE.md`, latest verification
   artifacts, and the source authority files. Confirm the goal version
   still matches the frozen inventory.
2. **Oracle integrity check** before editing:
   - criteria text unchanged except `status` / `last_verification`,
   - verifiers unchanged except via approved Oracle Change Notes,
   - no skipped / xfailed selectors added,
   - no snapshot refreshed without a semantic assertion,
   - no expected evidence weakened.
3. If every required criterion is `PASS_PENDING_FINAL` or `PASS`, run the
   **final-verify**. If it proves the whole inventory in the same repo
   state: set all to `PASS`, write `loop/VERIFY.md` with the matrix,
   emit `criteria-met` → `stop-and-summarize`.
4. Otherwise pick one primary failing / `OPEN` criterion by topology +
   priority + cheapest verifier feedback. If every remaining unpassed
   criterion is `STUCK` / `BLOCKED_EXTERNAL` / `QUARANTINED` / wrong-loop-
   shaped, go to halt classification.
5. Before editing, write one line:
   `criterion-id | failing-evidence | hypothesis | edit-surface | rollback`.
6. Make one small reversible change. Run the cheap inner channel; if it
   fails, fix or revert before broader proof.
7. Run the criterion's verifier. Then run impact guards for already-
   passing criteria the edit could disturb.
8. Accept the change only if: the criterion moves toward pass (or gains
   sharper failure evidence), no passing criterion regresses, and the
   oracle was not weakened. Otherwise revert and record the failed
   hypothesis. Either way, update `loop/STATE.md` `last_action` with **what
   changed + the verifier result** and `next_action` with the **next best
   experiment** — this is the durable between-iteration record.
9. If the criterion verifier passes, mark `PASS_PENDING_FINAL` — not
   `PASS`. `PASS` waits for the next final-verify.
10. On `3` consecutive failures with no new evidence,
    mark the criterion `STUCK` and switch to another unblocked criterion.

## Oracle-drift guard

The headline failure mode. The loop must not:

- delete a criterion
- rewrite a criterion into a weaker form
- merge criteria in a way that drops obligations
- narrow a verifier selector to avoid a failing case
- skip / xfail / invert / remove a failing test
- refresh a snapshot without a semantic assertion proving the new output
- reduce expected evidence specificity
- lower a threshold without an authoritative source change
- replace integration proof with mocked proof
- mark subjective confidence as machine proof
- treat a loop-authored test as source intent

**Verifier changes** require an **Oracle Change Note** appended inline to
`loop/STATE.md`:

```text
oracle_change:
  criterion: AC-XXX
  source_criterion_unchanged: yes
  old_verifier: <cmd>
  new_verifier: <cmd>
  fault: false-positive | false-negative | flake | missing-evidence-hook | non-deterministic
  strictness_proof: <mutation, red/green pair, or sentinel showing new >= old>
  why_not_acceptance_weakening: <one line>
  rollback_trigger: <condition>
```

If strictness-preservation cannot be proved, restore the old verifier or
emit `oracle-drift` and stop.

## Rules

### Scope manifest

**Allowed**
- `supabase/functions/**` (especially `shared/gemini.ts`, `socratic-coach/`, `summarize-session/`)
- `supabase/migrations/**` (create as needed)
- `src/lib/socraticCoach.ts`, `src/lib/useRealtime.ts`, `src/components/Dashboard.tsx` (narrow screenshot/thumbnail only)
- `context/**` (read-only unless correcting factual drift)
- `../studypilot-extension/src/**`, `../studypilot-extension/manifest.json`

**Forbidden**
- `logos/**`, `lh-home.json`, unrelated `backend/routers/**` unless session REST contract changes
- Broad Dashboard.tsx refactors while `context/runbook.md` build warning active
- Adding `GEMINI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to extension code
- Weakening RLS on `session-captures` bucket

### Partial completion is not success

The loop continues while at least one unpassed criterion has a legal
reversible next move inside scope. Halt with `partial-deadlock` only when
every unpassed criterion is `STUCK` / `BLOCKED_EXTERNAL` / `QUARANTINED` /
wrong-loop-shaped.

When halting partial: preserve pass evidence, list every unpassed
criterion with its latest failing evidence, name the next required
authority / verifier / reroute. Do not lower the bar.

### Status-theater prohibition

Do not emit upfront plans, rollout narration, or mid-run completion
summaries. The single one-line iteration preamble (criterion ID + next
action) is allowed and encouraged; anything longer is status theater.
Traces, diffs, and oracle outputs are truth; notes are memory.

### Forbidden shortcuts

- `--no-verify` on git hooks
- Mocking `socratic-coach` responses in production extension paths
- Skipping image size caps "temporarily"
- Saving only the last Q/A pair while claiming multi-turn transcript (AC-03)
- Public `session-captures` bucket without RLS
- Manual "PASS" without verifier output in `last_verification`

No `--no-verify`. No deleting tests. No reducing assertions. No moving a
criterion out of the final-verify. No "temporarily skipped" rows. No
snapshot refresh without semantic proof.

### Known false-green zones

- `npm run build` on studypilot may pass while Dashboard.tsx has latent TS issues — AC-04 dashboard thumbnail needs runtime check.
- `rg`-only verifiers prove wiring, not live Gemini multimodal behavior — AC-06 is the consumer-side oracle.
- Extension dev preview (`src/dev/preview.tsx`) is not E2E proof.

## Halt conditions

Halt = emit `stop-and-summarize`. Terminal success additionally emits
`criteria-met` first. Escalate (rare, irreversible-only) is a separate
signal — see the Runner contract.

Halt when:

- all required criteria reach `PASS` in the final-verify → `criteria-met` →
  `stop-and-summarize`
- every remaining unpassed criterion is `STUCK` / `BLOCKED_EXTERNAL` /
  `QUARANTINED` / wrong-loop-shaped → `partial-deadlock`
- the Gemini spend cap (Budget policy) is reached and every remaining unpassed
  criterion needs a paid call to advance → `budget-limited`
- oracle drift is detected and cannot be repaired without authority →
  `oracle-drift`
- a genuine irreversible / external blocker prevents proof → `escalate`

### Halt-cause classifier

When emitting `criteria-met`, `stop-and-summarize`, or
`escalate: <reason>`, label:

- `criteria-met` — terminal completion; every required criterion in the frozen goal
  version passed in the final-verify.
- `partial-deadlock` — finite goal not met; remaining criteria are stuck /
  blocked / quarantined.
- `budget-limited` — the Gemini spend cap was reached before terminal
  completion, and no unpassed criterion has a legal non-paid move left.
  Summarize spend, list criteria deferred for paid calls, and name the
  unlock (raise cap / provide deploy creds). **Not a completion claim** —
  a budget ceiling is a runner limit, not `criteria-met`.
- `oracle-drift` — the criteria / verifier / evidence / final-verify
  cannot be preserved without weakening the acceptance contract.
- `derivation-gap` — blocked on something derivation could have asked for.
  Next derivation pass adds it to the Frontload audit.
- `genuine-escalate` — irreversible / external / authority-needed (paid
  API budget, public-publish, secret, product direction, source conflict).
- `wrong-loop` — the work is not terminal goal-shaped; reroute via `/loopgen` to:
  - the `frontier` archetype if a criterion needs open-ended search, evaluator
    discovery, metric improvement, or "make it better" without a fixed
    pass line;
  - the `greenfield` archetype if the artifact / target / audience / evaluator is
    under-specified and the criteria are placeholders rather than a
    contract;
  - the `story` archetype if the next job is discovering or reconciling product
    promises before a finite implementation target exists.

`derivation-gap` is the feedback signal — the Frontload audit was
incomplete; close it next run.

Before any non-terminal shared halt, scan **all** acceptance rows and
verifier/oracle gaps — a single blocked row does not halt if another
in-scope intervention remains.

## Artifacts to maintain

- `loop/ACCEPTANCE.md` — frozen criteria, mutable `status` /
  `last_verification`.
- `loop/STATE.md` — goal version, iteration, current criterion, stuck
  counters, Oracle Change Notes (inline), spend ledger, last action, next action.
- `loop/VERIFY.md` — latest final-verify transcript; written on
  `criteria-met`.
- `loop/final-verify.sh` — orchestrates builds + grep matrix.
- Evidence artifacts: command output, deploy logs, E2E notes.

### Repo-specific overlay

**Dual-repo layout**
- Main: `studypilot` — Vite dashboard + Supabase Edge Functions.
- Extension: `../studypilot-extension` — CRXJS Chrome extension (sibling folder).

**Key integration surfaces**
| Surface | Path |
|---------|------|
| Gemini client | `supabase/functions/shared/gemini.ts` — today text-only `input` → single user part |
| Coach API | `supabase/functions/socratic-coach/index.ts` — `{sessionId?, userMessage}`; dashboard history via `dashboard_chat_messages` |
| Extension coach | `../studypilot-extension/src/shared/studypilotSupabase.ts` — `requestCoaching` / `buildCoachingMessage` (screenshot stub text) |
| Extension capture | `../studypilot-extension/src/background/index.ts` — `captureVisibleTab` returns raw PNG |
| Extension panel | `../studypilot-extension/src/content/FloatingStudyPilot.tsx` — single-turn save via `createStudySession` |
| Session import | `importStudySessionToSupabase` — only 2 `session_messages` at offsets 0/1 |
| Dashboard chat | `src/lib/socraticCoach.ts` — unchanged contract when no images |
| Realtime | `src/lib/useRealtime.ts` — INSERT on `sessions` |
| Schema reference | `context/supabase/supabase.md` — no `screenshot_path` yet; no `migrations/` folder |

**Verified working today (do not regress)**
Extension save → `sessions` + `session_messages` + `summarize-session` → dashboard Realtime shows transcript labeled "Imported from Chrome extension".
