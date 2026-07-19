#!/usr/bin/env bash
# Package the Linux CEF build into deb/rpm/AppImage. Used by CI and locally.
# Run after the binary is built (pnpm tauri:cef build).
# Usage: scripts/cef-package.sh [version]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(grep -m1 '^version' src-tauri/Cargo.toml | sed 's/.*"\(.*\)".*/\1/')}"
STAGE="src-tauri/target/release"
OUT="$STAGE/bundle"
WORK="$STAGE/cef-pkg"

[ -x "$STAGE/sable" ] || {
  echo "missing $STAGE/sable; build it first (pnpm tauri:cef build)" >&2
  exit 1
}

rm -rf "$WORK"
mkdir -p "$WORK" "$OUT/deb" "$OUT/rpm" "$OUT/appimage"

stage_runtime() {
  local dest="$1"
  mkdir -p "$dest"
  cp "$STAGE/sable" "$dest/"
  bash scripts/cef-copy-libs.sh release "$dest"
}

write_desktop() {
  cat > "$1" <<'EOF'
[Desktop Entry]
Type=Application
Name=Sable
Comment=A Matrix client
Exec=sable %U
Icon=sable
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupWMClass=sable
MimeType=x-scheme-handler/sable;x-scheme-handler/moe.sable.app;
EOF
}

if command -v fpm >/dev/null 2>&1; then
  PKGROOT="$WORK/pkgroot"
  stage_runtime "$PKGROOT/opt/sable"
  mkdir -p "$PKGROOT/usr/bin" "$PKGROOT/usr/share/applications" \
    "$PKGROOT/usr/share/icons/hicolor/128x128/apps"
  cat > "$PKGROOT/usr/bin/sable" <<'EOF'
#!/bin/sh
exec /opt/sable/sable "$@"
EOF
  chmod 755 "$PKGROOT/usr/bin/sable"
  write_desktop "$PKGROOT/usr/share/applications/sable.desktop"
  cp src-tauri/icons/128x128.png "$PKGROOT/usr/share/icons/hicolor/128x128/apps/sable.png"

  COMMON=(-s dir -n sable -v "$VERSION" --iteration 1
    --description "Sable, a Matrix client"
    --url "https://sable.moe" --maintainer "SableClient"
    --category net)
  # Stable-named deps only; version-suffixed names break install across releases.
  DEB_DEPS=(--depends libwebkit2gtk-4.1-0 --depends libgtk-3-0
    --depends libnss3 --depends libnspr4 --depends libgbm1
    --depends libdrm2 --depends libxkbcommon0 --depends xdg-utils)
  (cd "$OUT/deb" && fpm "${COMMON[@]}" -t deb -a amd64 "${DEB_DEPS[@]}" -C "$PKGROOT" .)

  RPM_DEPS=(--depends webkit2gtk4.1 --depends gtk3 --depends nss
    --depends nspr --depends mesa-libgbm --depends libdrm
    --depends libxkbcommon --depends xdg-utils)
  (cd "$OUT/rpm" && fpm "${COMMON[@]}" -t rpm -a x86_64 "${RPM_DEPS[@]}" -C "$PKGROOT" .)
else
  echo "fpm not found; skipping deb/rpm (building AppImage only)"
fi

APPDIR="$WORK/Sable.AppDir"
stage_runtime "$APPDIR/usr/bin"
# nosuid AppImage mount: drop setuid chrome-sandbox, use the namespace sandbox.
rm -f "$APPDIR/usr/bin/chrome-sandbox"
write_desktop "$APPDIR/sable.desktop"
cp src-tauri/icons/128x128.png "$APPDIR/sable.png"
cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/sable" "$@"
EOF
chmod 755 "$APPDIR/AppRun"

APPIMAGETOOL_SHA256=ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0
APPIMAGETOOL="$WORK/appimagetool"
curl -fsSL -o "$APPIMAGETOOL" \
  https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage
echo "${APPIMAGETOOL_SHA256}  $APPIMAGETOOL" | sha256sum -c -
chmod +x "$APPIMAGETOOL"
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$APPIMAGETOOL" "$APPDIR" \
  "$OUT/appimage/Sable_${VERSION}_amd64.AppImage"

echo "Packages in: $OUT"
