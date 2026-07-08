# loop/STATE.md

```yaml
archetype: goal
identity: transcripts-screenshots-ai-dashboard (Part 2)
primitive_bundle:
  target-shape: finite-criteria
  halt-shape: terminal
  artifact-shape: acceptance-inventory
  convergence-shape: criteria-completion
  cadence-shape: sync
divergences: []
overlays: []
consult_tier: tier-2
evaluator_tier: n/a

derivation_read_set:
  - C:\Users\gjins\.codex\skills\loopgen\SKILL.md
  - C:\Users\gjins\.codex\skills\loopgen\templates\composed-prompt.md
  - C:\Users\gjins\.codex\skills\loopgen\templates\bodies\goal-body.md
  - C:\Users\gjins\.codex\skills\loopgen\archetypes\goal.md
  - C:\Users\gjins\.codex\skills\loopgen\references\oracle-principles.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\target-shape.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\halt-shape.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\artifact-shape.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\convergence-shape.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\cadence-shape.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\consult-capability.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\frontload-audit.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\runner-contract.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\judgment-default.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\evidence-tier.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\halt-cause-classifier.md
  - C:\Users\gjins\.codex\skills\loopgen\primitives\queue-as-second-artifact.md
  - https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
  - https://developers.openai.com/api/docs/guides/prompt-guidance

revision:
  rev: 2
  date: "2026-07-08"
  kind: prompt-craft (goal shape unchanged; classification still goal, distance 0)
  sources:
    - "OpenAI — Using Goals in Codex (6-element goal contract; budget != completion; evidence-based completion)"
    - "OpenAI — GPT-5.5 prompting guide (outcome-first framing; explicit stop rules; one-line preamble; check-your-work validation)"
  changes:
    - "Added top-of-PROMPT 'Goal contract (outcome-first)' mapping the 6 Codex elements to existing sections."
    - "Added budget-limited halt cause (distinct from criteria-met) to halt conditions + classifier."
    - "Added one-line iteration preamble; reconciled with status-theater prohibition."
    - "Made between-iteration recording explicit (last_action = what changed + verifier result; next_action = next experiment)."

frontload:
  resolved:
    - motive: "Wire extension transcripts + screenshots through multimodal socratic-coach into dashboard sessions with full multi-turn history."
    - evidence_surface: "studypilot npm run build; studypilot-extension npm run build; rg verifiers per AC row; Supabase MCP deploy_edge_function for edge deploys."
    - consult_tier: "tier-2 — plugin-supabase-supabase MCP + cursor-ide-browser MCP available; no Agentify/PAL tier-3 fabric."
  defaulted:
    - scope_manifest: "Allowed: studypilot/** (supabase/functions, src, context) + ../studypilot-extension/** (src, manifest). Forbidden: logos/, lh-home.json, unrelated backend Python routers unless session API changes required."
    - stuck_attempt_n: "3 consecutive failed hypotheses per criterion before STUCK."
    - cheap_channel: "npm run build in the repo touched by the edit; extension edits also run build in ../studypilot-extension."
    - final_verify: "loop/final-verify.sh (or documented equivalent in VERIFY.md) after all AC rows PASS_PENDING_FINAL."
    - gemini_budget: "Cap 120 paid Gemini edge-function invocations per loop run (logged in STATE.md spend_ledger); over-cap defers AC-06 manual E2E to human."
    - phase5_optional: "AC-05 voice transcription is optional; loop may reach criteria-met without it."
  open_gaps:
    - "Dashboard.tsx may have pre-existing TS build errors (context/runbook.md) — narrow edits only; build passed 2026-07-08 after sync."
    - "AC-06 Chrome extension→dashboard Realtime E2E requires manual browser pass with authenticated user (deploy + API smoke complete)."

artifacts:
  canonical:
    - loop/PROMPT.md
    - loop/STATE.md
    - loop/ACCEPTANCE.md
    - loop/VERIFY.md
  repo_aliases:
    extension_root: ../studypilot-extension
    gemini_shared: supabase/functions/shared/gemini.ts
    socratic_coach: supabase/functions/socratic-coach/index.ts
    extension_supabase: ../studypilot-extension/src/shared/studypilotSupabase.ts
    extension_background: ../studypilot-extension/src/background/index.ts
    extension_panel: ../studypilot-extension/src/content/FloatingStudyPilot.tsx
    dashboard: src/components/Dashboard.tsx
    schema_reference: context/supabase/supabase.md

goal_version: "gv-2026-07-08-transcripts-screenshots-v1"
iteration: 3
phase: execute
current_criterion: AC-06
last_action: "Synced Codex worktree to desktop; deployed socratic-coach to rqszloxxegvxaedptcqj; applied session-captures migration; live API smoke passed (history + multimodal images); builds + final-verify.ps1 PASS."
next_action: "Manual Chrome E2E: load extension dist, coach with screenshot + multi-turn, save, confirm dashboard Realtime transcript + thumbnail + summarize-session; then mark AC-06 PASS_PENDING_FINAL."
halt_cause: null
halt_scan: "AC-00..AC-04 PASS_PENDING_FINAL; AC-05 optional skipped; AC-06 deploy/API smoke complete; Chrome Realtime E2E remains manual."

stuck_counters: {}
final_verify: "2026-07-08 PowerShell matrix PASS; deploy + live API smoke in loop/VERIFY.md; criteria-met pending manual Chrome E2E."
oracle_change_notes:
  - criterion: AC-06
    source_criterion_unchanged: yes
    old_verifier: "bash loop/final-verify.sh"
    new_verifier: "powershell -ExecutionPolicy Bypass -File loop/final-verify.ps1"
    fault: missing-evidence-hook
    strictness_proof: "PowerShell verifier repeats both builds and all AC-00..AC-04 rg checks from final-verify.sh, preserves AC-05 as optional, and leaves the original Bash verifier unchanged."
    why_not_acceptance_weakening: "Substitution only handles missing Bash on Windows; it does not mark AC-06 live E2E complete."
    rollback_trigger: "Run bash loop/final-verify.sh successfully in an environment with Bash available."

spend_ledger:
  gemini_edge_invocations: 2
  cap: 120
```
