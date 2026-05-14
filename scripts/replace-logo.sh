#!/usr/bin/env bash
set -euo pipefail

readonly BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage(){
  cat <<EOF
Usage: run this script and provide four file paths when prompted.
It will replace icons in the repository `public/` tree using ffmpeg.

You will be prompted for:
 - maskless (borderless) logo (used for maskable icons)
 - circular logo (used for circular icons)
 - highlight variant (icon for highlight indicator)
 - unread variant (icon for unread indicator)

Requires: ffmpeg, base64
EOF
}

if [[ "${1-}" == "--help" || "${1-}" == "-h" ]]; then
  usage
  exit 0
fi

read -rp "Path to maskless (borderless) logo: " MASKLESS
read -rp "Path to circular logo: " CIRCULAR
read -rp "Path to highlight variant: " HIGHLIGHT
read -rp "Path to unread variant: " UNREAD

for f in "$MASKLESS" "$CIRCULAR" "$HIGHLIGHT" "$UNREAD"; do
  if [[ ! -f "$f" ]]; then
    echo "File not found: $f" >&2
    exit 2
  fi
  if [[ "${f,,}" != *.svg ]]; then
    echo "Input must be an SVG: $f" >&2
    exit 3
  fi
done

ffmpeg_cmd(){
  local in="$1" out="$2" size="$3"
  mkdir -p "$(dirname "$out")"
  echo "Generating $out ($size x $size)"
  ffmpeg -y -width "$size" -height "$size" -i "$in" "$out" 2>/dev/null
}

# All inputs are required to be SVG. Use ffmpeg to render SVGs to PNG targets
# and copy SVGs directly to the svg assets directory.

is_svg(){
  local f="$1"
  [[ "${f,,}" == *.svg ]]
}

echo "Replacing circular icons..."

declare -a CIRCULAR_TARGETS=(
  "512:$BASE_DIR/public/favicon.png"
  "2560:$BASE_DIR/public/full_res_sable.png"
  "144:$BASE_DIR/public/res/logo/logo-144x144.png"
  "192:$BASE_DIR/public/res/logo/logo-192x192.png"
  "256:$BASE_DIR/public/res/logo/logo-256x256.png"
  "36:$BASE_DIR/public/res/logo/logo-36x36.png"
  "384:$BASE_DIR/public/res/logo/logo-384x384.png"
  "48:$BASE_DIR/public/res/logo/logo-48x48.png"
  "512:$BASE_DIR/public/res/logo/logo-512x512.png"
  "72:$BASE_DIR/public/res/logo/logo-72x72.png"
  "96:$BASE_DIR/public/res/logo/logo-96x96.png"
)

for entry in "${CIRCULAR_TARGETS[@]}"; do
  size=${entry%%:*}
  out=${entry#*:}
  ffmpeg_cmd "$CIRCULAR" "$out" "$size"
done

echo "Replacing maskable icons (using maskless input)..."

declare -a MASKABLE_TARGETS=(
  "114:$BASE_DIR/public/res/logo-maskable/logo-maskable-114x114.png"
  "120:$BASE_DIR/public/res/logo-maskable/logo-maskable-120x120.png"
  "144:$BASE_DIR/public/res/logo-maskable/logo-maskable-144x144.png"
  "152:$BASE_DIR/public/res/logo-maskable/logo-maskable-152x152.png"
  "167:$BASE_DIR/public/res/logo-maskable/logo-maskable-167x167.png"
  "180:$BASE_DIR/public/res/logo-maskable/logo-maskable-180x180.png"
  "192:$BASE_DIR/public/res/logo-maskable/logo-maskable-192x192.png"
  "256:$BASE_DIR/public/res/logo-maskable/logo-maskable-256x256.png"
  "36:$BASE_DIR/public/res/logo-maskable/logo-maskable-36x36.png"
  "384:$BASE_DIR/public/res/logo-maskable/logo-maskable-384x384.png"
  "48:$BASE_DIR/public/res/logo-maskable/logo-maskable-48x48.png"
  "512:$BASE_DIR/public/res/logo-maskable/logo-maskable-512x512.png"
  "57:$BASE_DIR/public/res/logo-maskable/logo-maskable-57x57.png"
  "60:$BASE_DIR/public/res/logo-maskable/logo-maskable-60x60.png"
  "72:$BASE_DIR/public/res/logo-maskable/logo-maskable-72x72.png"
  "76:$BASE_DIR/public/res/logo-maskable/logo-maskable-76x76.png"
  "96:$BASE_DIR/public/res/logo-maskable/logo-maskable-96x96.png"
)

for entry in "${MASKABLE_TARGETS[@]}"; do
  size=${entry%%:*}
  out=${entry#*:}
  ffmpeg_cmd "$MASKLESS" "$out" "$size"
done

echo "Handling SVG assets in public/res/svg/..."

SVG_DIR="$BASE_DIR/public/res/svg"
mkdir -p "$SVG_DIR"

# logo.svg from circular input (inputs are SVG so copy directly)
echo "Copying circular SVG to $SVG_DIR/logo.svg"
cp "$CIRCULAR" "$SVG_DIR/logo.svg"

# logo-maskable.svg from maskless input
echo "Copying maskable SVG to $SVG_DIR/logo-maskable.svg"
cp "$MASKLESS" "$SVG_DIR/logo-maskable.svg"

# highlight.svg
cp "$HIGHLIGHT" "$SVG_DIR/highlight.svg"

# unread.svg
cp "$UNREAD" "$SVG_DIR/unread.svg"

echo "All done. Please review the generated files."
