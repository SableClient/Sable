#!/usr/bin/env bash
#MISE description="Stage the WebKit runtime and desktop files for packaging"
# Usage: scripts/webkit/stage.sh [stage-dir] [display-name] [profile]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

STAGE="${1:-$ROOT/src-tauri/target/webkit-stage}"
DISPLAY_NAME="${2:-Sable}"
PROFILE="${3:-release}"

RUNTIME="$STAGE/runtime"
SHARE="$STAGE/share"
rm -rf "$STAGE"
mkdir -p "$RUNTIME" "$SHARE/applications"

bash scripts/webkit/copy-libs.sh "$PROFILE" "$RUNTIME"

cat > "$SHARE/applications/sable.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$DISPLAY_NAME
Comment=A Matrix client
Exec=sable %U
Icon=sable
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupWMClass=sable
MimeType=x-scheme-handler/sable;x-scheme-handler/moe.sable.app;
EOF

for size in 32x32 64x64 128x128; do
  mkdir -p "$SHARE/icons/hicolor/${size}/apps"
  cp -f "src-tauri/icons/${size}.png" "$SHARE/icons/hicolor/${size}/apps/sable.png"
done
mkdir -p "$SHARE/icons/hicolor/256x256/apps"
cp -f "src-tauri/icons/128x128@2x.png" "$SHARE/icons/hicolor/256x256/apps/sable.png"

echo "✅ staged $DISPLAY_NAME into $STAGE"
