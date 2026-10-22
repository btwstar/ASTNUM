#!/usr/bin/env bash
#
# i18n pipeline supervisor — restarts the generator whenever the bun runtime
# dies unexpectedly (sandbox resource pressure). Progress is stateful
# (scripts/i18n/out/state.json), so every restart resumes where it left off.
#
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

LOG=scripts/i18n/out/run.log
MAX_RESTARTS=200

for i in $(seq 1 $MAX_RESTARTS); do
  bun scripts/i18n/generate.ts --workers 2 >> "$LOG" 2>&1
  code=$?
  if [ "$code" -eq 0 ]; then
    echo "[supervisor] generator exited cleanly — all pending languages done." >> "$LOG"
    exit 0
  fi
  echo "[supervisor] generator died (code $code, attempt $i) — restarting in 5s…" >> "$LOG"
  sleep 5
done

echo "[supervisor] giving up after $MAX_RESTARTS restarts." >> "$LOG"
exit 1
