#!/usr/bin/env bash
#MISE description="Copy the WebRTC WebKitGTK runtime next to the built binary"
# Copy the portable WebKitGTK runtime next to a built binary so wry builds get
# WebRTC regardless of the host's webkit2gtk. The bundle carries its own rpaths
# and private dependencies.
#
# Usage: scripts/webkit/copy-libs.sh [debug|release] [dest-dir]
#   dest-dir defaults to src-tauri/target/<profile> (beside the built binary).
set -euo pipefail
PROFILE="${1:-debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${2:-$ROOT/src-tauri/target/$PROFILE}"

if [ "$(uname -m)" != x86_64 ]; then
  echo "❌ the WebKit runtime is only built for x86_64 (got $(uname -m))." >&2
  exit 1
fi

SRC="${SABLE_WEBKIT_RUNTIME_DIR:-}"
if [ -z "$SRC" ]; then
  CACHE="$ROOT/src-tauri/target/webkit-runtime"
  bash "$ROOT/scripts/webkit/fetch.sh" "$CACHE"
  SRC="$CACHE/runtime"
fi

WEBKIT_LIB="$SRC/libwebkit2gtk-4.1.so.0"
[ -f "$WEBKIT_LIB" ] || {
  echo "❌ libwebkit2gtk-4.1.so.0 not found in $SRC." >&2
  exit 1
}

# Without the patch the library silently forks the host's helpers instead.
# Process substitution, not a pipe: grep -q exits early and SIGPIPEs strings,
# which trips pipefail.
if ! grep -qx WEBKIT_EXEC_PATH < <(strings -a "$WEBKIT_LIB"); then
  echo "❌ $WEBKIT_LIB was built without relocatable-exec-path.patch." >&2
  echo "   Re-pin scripts/webkit/runtime.json at a patched build." >&2
  exit 1
fi

NEED="$(node -e 'process.stdout.write(require(process.argv[1]).glibc_floor)' \
  "$SRC/runtime.json" 2>/dev/null || echo 0)"
HAVE="$(ldd --version | sed -n '1s/.*[^0-9]\([0-9]\+\.[0-9]\+\)$/\1/p')"
if [ "$(printf '%s\n%s\n' "$NEED" "$HAVE" | sort -V | tail -1)" != "$HAVE" ]; then
  echo "❌ runtime needs glibc $NEED, this host has $HAVE." >&2
  exit 1
fi

rm -rf "$DEST/webkit"
mkdir -p "$DEST"
cp -a "$SRC" "$DEST/webkit"

echo "✅ WebKit runtime staged in $DEST/webkit (glibc floor $NEED)"
