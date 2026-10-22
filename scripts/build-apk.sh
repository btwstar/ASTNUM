#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# ASTNUM — static export build for the Android APK (Capacitor).
#
# What it does:
#   1. Temporarily moves src/app/api aside (API routes can't exist in
#      `output: "export"`; the client-side adapter in src/lib/local-api
#      replaces them at runtime via NEXT_PUBLIC_STATIC=1).
#   1b. Temporarily moves public/download aside (published APKs would
#      otherwise be exported as in-app assets — dead weight megabytes
#      inside every build; a build must never embed the artifact itself).
#   2. Runs `next build` with BUILD_MODE=apk → writes ./out
#   3. Restores src/app/api + public/download no matter what (trap).
#   4. Copies ./out → android-app/www (the Capacitor webDir).
#
# Usage:  bash scripts/build-apk.sh
# NOTE: stop the dev server first (they share .next).
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR=src/app/api
API_BAK=.api-backup-build
DL_DIR=public/download
DL_BAK=.download-backup-build

if [ -d "$API_BAK" ]; then
  echo "✗ leftover backup $API_BAK exists — restoring it first"
  rm -rf "$API_DIR" && mv "$API_BAK" "$API_DIR"
fi
if [ -d "$DL_BAK" ]; then
  echo "✗ leftover backup $DL_BAK exists — restoring it first"
  rm -rf "$DL_DIR" && mv "$DL_BAK" "$DL_DIR"
fi

echo "▸ moving $API_DIR aside"
restore_dir() { rm -rf "$1" && mv "$2" "$1"; }
mv "$API_DIR" "$API_BAK"
if [ -d "$DL_DIR" ]; then
  echo "▸ moving $DL_DIR aside (keep build artifacts out of the app)"
  mv "$DL_DIR" "$DL_BAK"
fi
restore_all() {
  if [ -d "$API_BAK" ]; then
    restore_dir "$API_DIR" "$API_BAK"
    echo "▸ restored $API_DIR"
  fi
  if [ -d "$DL_BAK" ]; then
    restore_dir "$DL_DIR" "$DL_BAK"
    echo "▸ restored $DL_DIR"
  fi
}
trap restore_all EXIT INT TERM

echo "▸ building the headless quick-add bundle (public/quickadd)"
bash scripts/build-quickadd-bundle.sh

echo "▸ building static export (BUILD_MODE=apk)"
BUILD_MODE=apk NEXT_PUBLIC_STATIC=1 NEXT_TELEMETRY_DISABLED=1 \
  bunx next build

echo "▸ export complete → out/"
test -f out/index.html || { echo "✗ out/index.html missing"; exit 1; }

echo "▸ syncing out/ → android-app/www"
mkdir -p android-app/www
rm -rf android-app/www/*
cp -r out/* android-app/www/

echo "✓ web assets ready in android-app/www — run: cd android-app && bunx cap sync android"
