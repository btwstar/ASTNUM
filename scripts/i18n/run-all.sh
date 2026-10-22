#!/usr/bin/env bash
#
# i18n run-all — the self-healing driver that finishes the WHOLE translation
# pipeline without human babysitting:
#
#   Phase 1 (--patch): completes the missing keys of every emitted language
#                      chunk (repeat until zero failures).
#   Phase 2 (queue):   generates every pending registered language
#                      (repeat until every language is done).
#
# Both phases are resumable (scripts/i18n/out/state.json) and tolerate the
# LLM endpoint's rate-limit storms: a failed pass is retried after a pause,
# failed languages re-enter the queue automatically, and bun crashes restart
# the current phase. Progress is never lost — batch results are cached the
# moment they validate.
#
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

LOG=scripts/i18n/out/run.log
MAX_PASSES=300
SLEEP_ON_FAIL=45

echo "[run-all $(date '+%H:%M:%S')] starting — phase 1 (patch emitted languages)" >> "$LOG"

# ── Phase 1: patch until no language reports missing keys ───────────
for pass in $(seq 1 $MAX_PASSES); do
  if ! bun scripts/i18n/generate.ts --patch >> "$LOG" 2>&1; then
    echo "[run-all] patch pass $pass incomplete (rate limit / failures) — retrying in ${SLEEP_ON_FAIL}s" >> "$LOG"
    sleep "$SLEEP_ON_FAIL"
    continue
  fi
  echo "[run-all $(date '+%H:%M:%S')] phase 1 complete — every emitted language now has all its keys" >> "$LOG"
  break
done

echo "[run-all $(date '+%H:%M:%S')] phase 2 — generating every pending language" >> "$LOG"

# ── Phase 2: main queue until all pending languages are done ────────
for pass in $(seq 1 $MAX_PASSES); do
  code=0
  bun scripts/i18n/generate.ts --workers 2 >> "$LOG" 2>&1 || code=$?
  if [ "$code" -eq 0 ]; then
    echo "[run-all $(date '+%H:%M:%S')] ALL LANGUAGES GENERATED — pipeline finished." >> "$LOG"
    exit 0
  fi
  echo "[run-all] queue pass $pass exited $code (crash or failures) — resuming in ${SLEEP_ON_FAIL}s" >> "$LOG"
  sleep "$SLEEP_ON_FAIL"
done

echo "[run-all] giving up after $MAX_PASSES passes" >> "$LOG"
exit 1
