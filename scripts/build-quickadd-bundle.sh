#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# ASTNUM — headless quick-add bundle (v1.22).
#
# Bundles src/lib/widgets/quickadd-entry.ts into public/quickadd/ as a
# self-contained browser bundle. QuickAddActivity serves this page from the
# SAME ORIGIN as the app (https://localhost, intercepted from the APK web
# assets) when the app process is dead: the page commits the widget-typed
# habit/note into the app's shared localStorage database, rebuilds the
# widget snapshot and hands it back to native — a REAL add-from-widget
# without ever opening the app.
#
# public/quickadd/ ships with the static export automatically (public/ is
# copied into out/), so build-apk.sh calls this BEFORE `next build` and the
# dev server serves it for browser-level verification too.
#
# Usage:  bash scripts/build-quickadd-bundle.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=public/quickadd
ENTRY=src/lib/widgets/quickadd-entry.ts

mkdir -p "$OUT"
# the page shell is a committed source file — never clobber it
test -f "$OUT/quickadd.html" || { echo "✗ $OUT/quickadd.html missing"; exit 1; }

# drop stale build output (chunks are content-hashed → no orphans)
find "$OUT" -maxdepth 1 -type f \( -name 'quickadd.js' -o -name 'q-*.js' \) -delete

echo "▸ bundling $ENTRY → $OUT (browser, code-split, minified)"
bun build "$ENTRY" \
  --outdir "$OUT" \
  --target browser \
  --splitting \
  --minify \
  --entry-naming "quickadd.js" \
  --chunk-naming "q-[hash].[ext]" \
  --asset-naming "q-a-[hash].[ext]" \
  --define 'process.env.NEXT_PUBLIC_STATIC="1"' \
  --define 'process.env.NODE_ENV="production"'

test -f "$OUT/quickadd.js" || { echo "✗ bundle output missing"; exit 1; }

# NOTE: any *other* NEXT_PUBLIC_* referenced by the graph must be defined
# too — a bare `process.env` reference would throw in the WebView. Checked
# below so a future env addition can never silently break the dialog.
if rg -n --pcre2 'process\.env\.(?!NEXT_PUBLIC_STATIC|NODE_ENV)' "$OUT/quickadd.js" >/dev/null 2>&1; then
  echo "✗ bundle references an undefined process.env.* — add a --define"
  rg -n --pcre2 'process\.env\.(?!NEXT_PUBLIC_STATIC|NODE_ENV)' "$OUT/quickadd.js" | head -5
  exit 1
fi

SIZE=$(du -h "$OUT/quickadd.js" | cut -f1)
CHUNKS=$(find "$OUT" -maxdepth 1 -name 'q-*.js' | wc -l)
echo "✓ quickadd bundle → $OUT (entry $SIZE + $CHUNKS chunk(s))"
