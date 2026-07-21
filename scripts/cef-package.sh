#!/usr/bin/env bash
#MISE description="Package CEF build into deb/rpm/AppImage"
# Package the Linux CEF build into deb/rpm/AppImage. Used by CI and locally.
# Run after the binary is built (pnpm tauri:cef build).
# Usage: scripts/cef-package.sh [version]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(grep -m1 '"version":' src-tauri/tauri.conf.json | sed 's/.*: *"\(.*\)".*/\1/')}"
DEB_VERSION="$VERSION"
RPM_VERSION="$VERSION"
RPM_ITERATION=1
if [[ "$VERSION" == *-* ]]; then
  BASE_VERSION="${VERSION%%-*}"
  PRERELEASE="${VERSION#*-}"
  # Debian sorts ~ before the final version. RPM uses the release field so its
  # Version remains hyphen-free and a 0.* prerelease sorts before release 1.
  DEB_VERSION="${BASE_VERSION}~${PRERELEASE}"
  RPM_VERSION="$BASE_VERSION"
  RPM_ITERATION="0.${PRERELEASE}"
fi
STAGE="$ROOT/src-tauri/target/release"
OUT="$STAGE/bundle"
WORK="$STAGE/cef-pkg"

if [ -x "$STAGE/Sable Nightly" ]; then
  BIN_NAME="Sable Nightly"
  DISPLAY_NAME="Sable Nightly"
elif [ -x "$STAGE/Sable" ]; then
  BIN_NAME="Sable"
  DISPLAY_NAME="Sable"
elif [ -x "$STAGE/sable" ]; then
  BIN_NAME="sable"
  DISPLAY_NAME="Sable"
else
  echo "missing $STAGE/Sable Nightly, Sable, or sable; build it first (pnpm tauri:cef build)" >&2
  exit 1
fi

rm -rf "$WORK"
mkdir -p "$WORK" "$OUT/deb" "$OUT/rpm" "$OUT/appimage"

stage_runtime() {
  local dest="$1"
  mkdir -p "$dest"
  cp "$STAGE/$BIN_NAME" "$dest/sable"
  bash scripts/cef-copy-libs.sh release "$dest"
}

# Bundle the system-tray libraries (Tauri's linuxdeploy path normally does this,
# which the CEF build bypasses). Bundle libayatana-appindicator3 plus its
# ayatana/dbusmenu/indicator dependency closure; host libs (gtk, glib, X11, …)
# are left to the system, matching linuxdeploy-plugin-appindicator.
stage_appindicator() {
  local dest="$1" main dep
  mkdir -p "$dest"
  # awk reads to EOF (no early exit) so ldconfig never gets SIGPIPE under pipefail.
  main="$(ldconfig -p 2>/dev/null | awk '$1=="libayatana-appindicator3.so.1"{v=$NF} END{print v}')"
  [ -n "$main" ] || main="$(find /usr/lib /usr/lib64 /lib -name libayatana-appindicator3.so.1 2>/dev/null | sort | tail -n1)"
  if [ -z "$main" ] || [ ! -e "$main" ]; then
    echo "warning: libayatana-appindicator3.so.1 not found; tray disabled in the AppImage" >&2
    return 0
  fi
  {
    echo "$main"
    ldd "$main" 2>/dev/null | awk '/=>/ {print $3}' | grep -iE 'ayatana|dbusmenu|indicator|ido' || true
  } | sort -u | while read -r dep; do
    if [ -e "$dep" ]; then
      cp -Lf "$dep" "$dest/$(basename "$dep")"
    fi
  done
}

write_desktop() {
  cat > "$1" <<EOF
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
}

if command -v fpm >/dev/null 2>&1; then
  PKGROOT="$WORK/pkgroot"
  stage_runtime "$PKGROOT/opt/sable"
  mkdir -p "$PKGROOT/usr/bin" "$PKGROOT/usr/share/applications"
  cat > "$PKGROOT/usr/bin/sable" <<'EOF'
#!/bin/sh
exec /opt/sable/sable "$@"
EOF
  chmod 755 "$PKGROOT/usr/bin/sable"
  write_desktop "$PKGROOT/usr/share/applications/sable.desktop"
  for size in 32x32 64x64 128x128; do
    mkdir -p "$PKGROOT/usr/share/icons/hicolor/${size}/apps"
    cp "src-tauri/icons/${size}.png" \
      "$PKGROOT/usr/share/icons/hicolor/${size}/apps/sable.png"
  done
  # 128x128@2x is 256x256
  mkdir -p "$PKGROOT/usr/share/icons/hicolor/256x256/apps"
  cp "src-tauri/icons/128x128@2x.png" \
    "$PKGROOT/usr/share/icons/hicolor/256x256/apps/sable.png"

  COMMON=(-s dir -n sable
    --description "Sable, a Matrix client"
    --url "https://sable.moe" --maintainer "SableClient"
    --category net)
  # CEF deps: no WebKitGTK. ALSA/CUPS are NEEDED by libcef.so;
  # xwayland because main.rs forces GDK_BACKEND=x11.
  DEB_DEPS=(--depends libgtk-3-0 --depends libnss3 --depends libnspr4
    --depends libgbm1 --depends libdrm2 --depends libxkbcommon0
    --depends libasound2 --depends libcups2 --depends xdg-utils
    --depends xwayland --depends libayatana-appindicator3-1)
  (cd "$OUT/deb" && fpm "${COMMON[@]}" -v "$DEB_VERSION" --iteration 1 \
    -t deb -a amd64 -p "Sable-${VERSION}-linux-x86_64.deb" "${DEB_DEPS[@]}" -C "$PKGROOT" .)

  RPM_DEPS=(--depends gtk3 --depends nss --depends nspr
    --depends mesa-libgbm --depends libdrm --depends libxkbcommon
    --depends alsa-lib --depends cups-libs --depends xdg-utils
    --depends xorg-x11-server-Xwayland
    --depends 'libayatana-appindicator3.so.1()(64bit)')
  (cd "$OUT/rpm" && fpm "${COMMON[@]}" -v "$RPM_VERSION" --iteration "$RPM_ITERATION" \
    -t rpm -a x86_64 -p "Sable-${VERSION}-linux-x86_64.rpm" "${RPM_DEPS[@]}" -C "$PKGROOT" .)
else
  echo "fpm not found; skipping deb/rpm (building AppImage only)"
fi

APPDIR="$WORK/Sable.AppDir"
stage_runtime "$APPDIR/usr/bin"
stage_appindicator "$APPDIR/usr/bin"
# nosuid AppImage mount: drop setuid chrome-sandbox, use the namespace sandbox.
rm -f "$APPDIR/usr/bin/chrome-sandbox"
write_desktop "$APPDIR/sable.desktop"
cp src-tauri/icons/128x128.png "$APPDIR/sable.png"
cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
export LD_LIBRARY_PATH="$HERE/usr/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
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
  "$OUT/appimage/Sable-${VERSION}-linux-x86_64.AppImage"

echo "Packages in: $OUT"
