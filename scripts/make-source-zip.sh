#!/usr/bin/env bash
#
# ASTNUM — source ZIP builder (open-source GitHub package).
#
# Produces public/download/ASTNUM-source-v1.24.zip containing the complete,
# ready-to-publish project (source, docs, android-app, brand assets, generated
# translation chunks) — WITHOUT anything regenerable, private or internal:
#   node_modules · .next · .git · local database (user data!) · gradle build
#   outputs · JDK toolchain · i18n pipeline cache · dev-only helpers ·
#   internal notes (worklog) · local uploads · environment config (.env)
#
# Unzip → `astnum/` → push to GitHub (see docs/PUBLISH_TO_GITHUB.md).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)/astnum"
OUT="$ROOT/public/download/ASTNUM-source-v1.24.zip"

mkdir -p "$STAGE"

echo "▸ staging clean source tree…"
cd "$ROOT"
rsync -a --delete-excluded \
  --include '.env.example' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude '.git' \
  --exclude '.github-backup' \
  --exclude 'db' \
  --exclude 'prisma/dev.db' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'skills' \
  --exclude 'examples' \
  --exclude 'mini-services' \
  --exclude 'agent-ctx' \
  --exclude '.zscripts' \
  --exclude 'shots' \
  --exclude 'tool-results' \
  --exclude 'vlm-review-*.json' \
  --exclude 'download' \
  --exclude 'upload' \
  --exclude 'worklog.md' \
  --exclude 'Caddyfile' \
  --exclude '*.log' \
  --exclude 'nohup.out' \
  --exclude 'toolchain-setup.log' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'preview-figure.html' \
  --exclude 'preview-logo.html' \
  --exclude 'preview-mmap.html' \
  --exclude 'preview-shot-*.png' \
  --exclude 'preview-*.png' \
  --exclude '.DS_Store' \
  --exclude 'tests/*.sh' \
  --exclude 'scripts/dev-orphan.sh' \
  --exclude 'scripts/serve-static-e2e.sh' \
  --exclude 'scripts/preview-*.ts' \
  --exclude 'scripts/logo-path.txt' \
  --exclude 'scripts/logo-traced.svg' \
  --exclude 'scripts/trace-logo.py' \
  --exclude 'scripts/i18n/out' \
  --exclude 'android-app/toolchain' \
  --exclude 'android-app/www' \
  --exclude 'android-app/android/.gradle' \
  --exclude 'android-app/android/app/build' \
  --exclude 'android-app/android/build' \
  --exclude 'android-app/android/local.properties' \
  --exclude 'android-app/android/app/src/main/assets/public' \
  --exclude 'android-app/android/capacitor-cordova-android-plugins' \
  --exclude 'public/download' \
  --exclude 'ASTNUM-source-v*.zip' \
  ./ "$STAGE/"

echo "▸ sanity checks…"
test -f "$STAGE/package.json"        || { echo "✗ package.json missing"; exit 1; }
test -f "$STAGE/README.md"           || { echo "✗ README.md missing"; exit 1; }
test -f "$STAGE/.env.example"        || { echo "✗ .env.example missing"; exit 1; }
test -f "$STAGE/LICENSE"             || { echo "✗ LICENSE missing"; exit 1; }
test -f "$STAGE/docs/README.md"      || { echo "✗ docs index missing"; exit 1; }
test -f "$STAGE/prisma/schema.prisma"|| { echo "✗ schema missing"; exit 1; }
test -f "$STAGE/scripts/i18n/generate.ts" || { echo "✗ i18n pipeline missing"; exit 1; }
test ! -e "$STAGE/db/custom.db"      || { echo "✗ user database leaked into ZIP"; exit 1; }
test ! -e "$STAGE/node_modules"      || { echo "✗ node_modules leaked into ZIP"; exit 1; }
test ! -e "$STAGE/android-app/www"   || { echo "✗ build output (www) leaked into ZIP"; exit 1; }
test ! -e "$STAGE/worklog.md"        || { echo "✗ internal worklog leaked into ZIP"; exit 1; }
test ! -e "$STAGE/upload"            || { echo "✗ local uploads leaked into ZIP"; exit 1; }
test ! -e "$STAGE/Caddyfile"         || { echo "✗ local proxy config leaked into ZIP"; exit 1; }
test ! -e "$STAGE/scripts/i18n/out"  || { echo "✗ i18n pipeline cache leaked into ZIP"; exit 1; }
test ! -e "$STAGE/tests/database-runtime-build.sh" || { echo "✗ sandbox test helpers leaked into ZIP"; exit 1; }
test ! -e "$STAGE/.env"              || { echo "✗ .env leaked into ZIP"; exit 1; }

# translation chunks are expected to exist (pipeline output)
GEN_COUNT=$(ls "$STAGE/src/lib/i18n/generated"/*.ts 2>/dev/null | grep -vc '^$' || true)
echo "  · generated language chunks: $GEN_COUNT"

echo "▸ zipping…"
mkdir -p "$ROOT/public/download"
rm -f "$OUT"
( cd "$(dirname "$STAGE")" && zip -r -q -9 "$OUT" "$(basename "$STAGE")" )

SIZE=$(du -h "$OUT" | cut -f1)
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "✓ $OUT"
echo "  · $FILES files · $SIZE · $(date)"
