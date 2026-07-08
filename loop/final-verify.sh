#!/usr/bin/env bash
# loop/final-verify.sh — terminal verify for gv-2026-07-08-transcripts-screenshots-v1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="${STUDYPILOT_EXTENSION_ROOT:-$ROOT/../studypilot-extension}"
FAIL=0

run() {
  echo "==> $*"
  if ! eval "$@"; then
    echo "FAILED: $*"
    FAIL=1
  fi
}

cd "$ROOT"
run "npm run build"

if [[ -d "$EXT" ]]; then
  run "cd \"$EXT\" && npm run build"
else
  echo "WARN: extension root not found at $EXT"
  FAIL=1
fi

# AC-00
run "rg -q 'history' supabase/functions/socratic-coach/index.ts \"$EXT/src/shared/studypilotSupabase.ts\""

# AC-01
run "rg -q 'inlineData|parts' supabase/functions/shared/gemini.ts"
run "rg -q 'images' supabase/functions/socratic-coach/index.ts"

# AC-02
run "rg -q 'createImageBitmap|OffscreenCanvas|jpeg|images' \"$EXT/src/background\" \"$EXT/src/shared/studypilotSupabase.ts\""
run "! rg -q 'image payloads are not wired|Image sharing is not wired yet|Snapshot capture works; image is not sent yet' \"$EXT/src/\""

# AC-03
run "rg -q 'atSeconds|transcript|history' \"$EXT/src/content/FloatingStudyPilot.tsx\" \"$EXT/src/shared\""
run "rg -q 'time_offset_seconds' \"$EXT/src/shared/studypilotSupabase.ts\""

# AC-04
if compgen -G "supabase/migrations/*" > /dev/null; then
  run "rg -q 'session-captures|screenshot_path' supabase \"$EXT/src\" src"
else
  echo "FAILED: no supabase/migrations/"
  FAIL=1
fi

# AC-05 optional
if rg -q 'SpeechRecognition|webkitSpeechRecognition' "$EXT/src/content" 2>/dev/null; then
  echo "AC-05: speech hooks present (optional)"
else
  echo "AC-05: skipped (optional)"
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "final-verify: PASS (automated matrix; AC-06 live E2E still requires VERIFY.md transcript)"
  exit 0
else
  echo "final-verify: FAIL"
  exit 1
fi
