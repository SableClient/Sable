#!/usr/bin/env bash
#MISE description="Copy CEF runtime libs next to the built binary"
# Copy the CEF runtime (libcef.so + resources) next to a built binary so the app
# is self-contained: works standalone, when launched by the OS via a sable://
# deep link, or from a release package. Pair with the rpath=$ORIGIN that
# build.rs adds for CEF builds.
#
# Usage: scripts/cef/copy-libs.sh [debug|release] [dest-dir]
#   dest-dir defaults to src-tauri/target/<profile> (beside the built binary).
set -euo pipefail
PROFILE="${1:-debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${2:-$ROOT/src-tauri/target/$PROFILE}"

case "$(uname -m)" in
  x86_64) CEF_ARCH=x86_64 ;;
  aarch64 | arm64) CEF_ARCH=aarch64 ;;
  *) echo "❌ unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# --target moves build-script output under target/<triple>/.
CEF_DIR="$(
  find "$ROOT/src-tauri/target" -type d -name "cef_linux_$CEF_ARCH" \
    -path "*/$PROFILE/build/*" -print -quit 2>/dev/null || true
)"
if [ -z "$CEF_DIR" ]; then
  echo "❌ cef_linux_$CEF_ARCH not found under target/**/$PROFILE/build — build with --features cef first." >&2
  exit 1
fi

CEF_VERSION="$(awk '
  /^\[\[package\]\]$/ { in_cef=0 }
  /^name = "cef"$/ { in_cef=1 }
  in_cef && /^version = / {
    gsub(/"/, "", $3)
    print $3
    exit
  }
' "$ROOT/src-tauri/Cargo.lock")"
if [ -z "$CEF_VERSION" ]; then
  echo "❌ Resolved cef version not found in src-tauri/Cargo.lock." >&2
  exit 1
fi
CEF_MAJOR="${CEF_VERSION%%.*}"

CEF_LIB="$CEF_DIR/libcef.so"
if [ ! -f "$CEF_LIB" ]; then
  echo "❌ libcef.so not found in $CEF_DIR." >&2
  exit 1
fi
RUNTIME_MAJOR="$(
  strings -a "$CEF_LIB" |
    grep -Eio '[0-9]{3}\.[0-9]+\.[0-9]+\+g[^[:space:]]+\+chromium-[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' |
    awk -F. 'NR == 1 { print $1; exit }'
)" || true
if [ -z "$RUNTIME_MAJOR" ]; then
  echo "❌ CEF runtime version not found in $CEF_LIB." >&2
  exit 1
fi
if [ "$RUNTIME_MAJOR" != "$CEF_MAJOR" ]; then
  echo "❌ CEF runtime major $RUNTIME_MAJOR does not match resolved cef major $CEF_MAJOR." >&2
  exit 1
fi

mkdir -p "$DEST"
echo "→ copying CEF runtime from $CEF_DIR to $DEST"
# Libraries (libcef.so + ANGLE/SwiftShader), crashpad handler, then resources.
cp -f "$CEF_DIR"/*.so* "$DEST/" 2>/dev/null || true
cp -f "$CEF_DIR"/chrome_crashpad_handler "$DEST/" 2>/dev/null || true
cp -f "$CEF_DIR"/*.pak "$CEF_DIR"/*.dat "$CEF_DIR"/*.bin "$CEF_DIR"/*.json "$DEST/" 2>/dev/null || true

# CEF's BSD license must accompany binary redistributions. The Rust crate's
# extracted runtime omits it, so package the upstream notice vendored here.
cp -f "$ROOT/packaging/licenses/CEF-LICENSE.txt" "$DEST/CEF-LICENSE.txt"

# Strip debug symbols: CEF ships libcef.so unstripped (~1.3 GB → 241 MB).
# Same approach as OutSystems cef.redist.linux and Spotify's desktop client.
for lib in "$DEST"/libcef.so "$DEST"/libEGL.so "$DEST"/libGLESv2.so; do
  [ -f "$lib" ] && strip -s "$lib" 2>/dev/null || true
done

# Only ship en-US locale (49 MB → 570 KB); see CEF README.redistrib.txt.
mkdir -p "$DEST/locales"
cp -f "$CEF_DIR"/locales/en-US.pak "$DEST/locales/" 2>/dev/null || true

# chrome-sandbox is not shipped: AppImages and snaps mount nosuid.
echo "✅ done."
