#!/usr/bin/env bash
set -euo pipefail

CEF_VERSION="${CEF_VERSION:-150.0.10+g8042e43+chromium-150.0.7871.101}"
CEF_RELEASE_URL="${CEF_RELEASE_URL:-https://github.com/tobagin/karere/releases/download/cef-150.0.10-proprietary-codecs}"
CEF_SHA256_x86_64="3bbe298368c4d87c19ad9b7ed4e8449ea91b32ffa3cefc8672791a1b96c9c3b9"
CEF_SHA256_aarch64="543bc10ce854fc39b0493ff8b369c47d65fa43f2fb974b734252eea805bffc53"

case "$(uname -m)" in
  x86_64) PLATFORM=linux64; EXPECTED_SHA="$CEF_SHA256_x86_64" ;;
  aarch64|arm64) PLATFORM=linuxarm64; EXPECTED_SHA="$CEF_SHA256_aarch64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

CACHE_DIR="${CEF_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/sable-cef}"
NAME="cef_binary_${CEF_VERSION}_${PLATFORM}_minimal"
DEST="$CACHE_DIR/$NAME"

if [ -f "$DEST/libcef.so" ] && [ -f "$DEST/archive.json" ]; then
  echo "$DEST"
  exit 0
fi

mkdir -p "$CACHE_DIR"
ARCHIVE="$CACHE_DIR/$NAME.zip"

if [ ! -f "$ARCHIVE" ]; then
  ENCODED="${NAME//+/%2B}"
  echo "fetching $CEF_RELEASE_URL/$ENCODED.zip" >&2
  curl -fL --retry 3 -o "$ARCHIVE.part" "$CEF_RELEASE_URL/$ENCODED.zip"
  mv "$ARCHIVE.part" "$ARCHIVE"
fi

ACTUAL_SHA="$(sha256sum "$ARCHIVE" | cut -d' ' -f1)"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "checksum mismatch for $ARCHIVE" >&2
  echo "  expected $EXPECTED_SHA" >&2
  echo "  actual   $ACTUAL_SHA" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

WORK="$CACHE_DIR/.extract"
rm -rf "$WORK" "$DEST"
mkdir -p "$WORK"
unzip -q "$ARCHIVE" -d "$WORK"
SRC="$WORK/$NAME"

mv "$SRC/Release" "$DEST"
cp -a "$SRC/Resources/." "$DEST/"
for entry in CMakeLists.txt cmake include libcef_dll CREDITS.html; do
  [ -e "$SRC/$entry" ] && cp -a "$SRC/$entry" "$DEST/"
done

printf '{"type":"minimal","name":"%s.tar.bz2","sha1":"%s"}\n' "$NAME" "$(printf '0%.0s' {1..40})" \
  > "$DEST/archive.json"

rm -rf "$WORK"

if [ "$(strings -a "$DEST/libcef.so" | grep -cx ff_h264_decoder)" = "0" ]; then
  echo "warning: ff_h264_decoder not found — this build may lack proprietary codecs" >&2
fi

echo "$DEST"
