#!/usr/bin/env bash
#MISE description="Download the WebRTC-enabled WebKitGTK runtime"
# Downloads the pinned webkitgtk-webrtc portable artifact into a cache dir.
#
# Usage: scripts/webkit/fetch.sh [cache-dir]
#   cache-dir defaults to src-tauri/target/webkit-runtime.
#
# Override the source with SABLE_WEBKIT_ARTIFACT_URL, or point
# SABLE_WEBKIT_RUNTIME_DIR at an already-unpacked tree to skip this entirely.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${1:-$ROOT/src-tauri/target/webkit-runtime}"
MANIFEST="$ROOT/scripts/webkit/runtime.json"

read -r REPO RUN ARTIFACT VERSION < <(
  node -e '
    const m = require(process.argv[1]);
    process.stdout.write([m.repository, m.run, m.artifact, m.version].join(" ") + "\n");
  ' "$MANIFEST"
)

URL="${SABLE_WEBKIT_ARTIFACT_URL:-$REPO/actions/runs/$RUN/artifacts/$ARTIFACT}"
STAMP="$CACHE/.stamp"
WANT="$URL $VERSION"

if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$WANT" ]; then
  echo "→ WebKit runtime already cached in $CACHE"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ downloading $URL"
curl -fL --retry 3 --progress-bar -o "$WORK/artifact.zip" "$URL"
unzip -q -j "$WORK/artifact.zip" -d "$WORK"

TARBALL="$(find "$WORK" -maxdepth 1 -name '*-portable-*.tar.zst' -print -quit)"
[ -n "$TARBALL" ] || {
  echo "❌ no portable runtime tarball in the artifact." >&2
  exit 1
}

rm -rf "$CACHE"
mkdir -p "$CACHE"
tar --zstd -xf "$TARBALL" -C "$CACHE"

echo "$WANT" > "$STAMP"
echo "✅ WebKit runtime $VERSION unpacked into $CACHE"
