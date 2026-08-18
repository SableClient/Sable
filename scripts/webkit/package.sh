#!/usr/bin/env bash
#MISE description="Package the wry build with the embedded WebKit runtime"
#MISE tools={nfpm="2.47.0", "github:AppImage/appimagetool" = {version = "1.9.1", matching = ".AppImage"}}
# Usage: scripts/webkit/package.sh [version] [package-binary-path] [display-name] [appimage-binary-path]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(grep -m1 '"version":' src-tauri/tauri.conf.json | sed 's/.*: *"\(.*\)".*/\1/')}"
: "${VERSION:?version not found in src-tauri/tauri.conf.json}"
DEB_VERSION="$VERSION"
RPM_VERSION="$VERSION"
RPM_ITERATION=1
if [[ "$VERSION" == *-* ]]; then
  BASE_VERSION="${VERSION%%-*}"
  PRERELEASE="${VERSION#*-}"
  DEB_VERSION="${BASE_VERSION}~${PRERELEASE}"
  RPM_VERSION="$BASE_VERSION"
  RPM_ITERATION="0.${PRERELEASE}"
fi

# The WebKit runtime is x86_64 only.
case "$(uname -m)" in
  x86_64) export ARCH=x86_64; NFPM_ARCH=amd64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

STAGE="$ROOT/src-tauri/target/release"
OUT="$STAGE/bundle"
WORK="$STAGE/webkit-pkg"

BIN_PATH="${2:-}"
DISPLAY_NAME="${3:-}"
APPIMAGE_BIN_PATH="${4:-}"
if [ -z "$BIN_PATH" ]; then
  for candidate in "$STAGE/Sable Nightly" "$STAGE/Sable" "$STAGE/sable" \
    "$ROOT/src-tauri/target/$ARCH-unknown-linux-gnu/release/sable"; do
    [ -x "$candidate" ] || continue
    BIN_PATH="$candidate"
    break
  done
fi
[ -n "$BIN_PATH" ] && [ -x "$BIN_PATH" ] || {
  echo "no wry binary found; build it first (pnpm tauri:wry build --no-bundle)" >&2
  exit 1
}
[ -n "$APPIMAGE_BIN_PATH" ] || APPIMAGE_BIN_PATH="$BIN_PATH"
[ -x "$APPIMAGE_BIN_PATH" ] || {
  echo "AppImage binary is not executable: $APPIMAGE_BIN_PATH" >&2
  exit 1
}
if [ -z "$DISPLAY_NAME" ]; then
  case "$(basename "$BIN_PATH")" in
    "Sable Nightly") DISPLAY_NAME="Sable Nightly" ;;
    *) DISPLAY_NAME="Sable" ;;
  esac
fi

APPIMAGETOOL_CMD=""
if command -v appimagetool.AppImage >/dev/null 2>&1; then
  APPIMAGETOOL_CMD="appimagetool.AppImage"
elif command -v appimagetool >/dev/null 2>&1; then
  APPIMAGETOOL_CMD="appimagetool"
else
  echo "appimagetool not found" >&2
  exit 1
fi

rm -rf "$WORK"
mkdir -p "$OUT/deb" "$OUT/rpm" "$OUT/appimage"

bash scripts/webkit/stage.sh "$WORK/stage" "$DISPLAY_NAME"

APPDIR="$WORK/Sable.AppDir"
mkdir -p "$APPDIR/usr/bin"
cp -a "$WORK/stage/runtime/." "$APPDIR/usr/bin/"
cp -f "$APPIMAGE_BIN_PATH" "$APPDIR/usr/bin/sable"
chmod 755 "$APPDIR/usr/bin/sable"

# Bundle libayatana-appindicator3 and its closure for the tray, as CEF does.
stage_appindicator() {
  local dest="$1" main dep
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
stage_appindicator "$APPDIR/usr/bin"

if command -v nfpm >/dev/null 2>&1; then
  PKGROOT="$WORK/pkgroot"
  mkdir -p "$PKGROOT/opt/sable" "$PKGROOT/usr/bin" "$PKGROOT/usr/share/applications"
  cp -a "$WORK/stage/runtime/." "$PKGROOT/opt/sable/"
  cp -f "$BIN_PATH" "$PKGROOT/opt/sable/sable"
  chmod 755 "$PKGROOT/opt/sable/sable"
  cat > "$PKGROOT/usr/bin/sable" <<'EOF'
#!/bin/sh
exec /opt/sable/sable "$@"
EOF
  chmod 755 "$PKGROOT/usr/bin/sable"
  cp -a "$WORK/stage/share/." "$PKGROOT/usr/share/"

  PKGROOT="$PKGROOT" PKG_ARCH="$NFPM_ARCH" PKG_VERSION="$DEB_VERSION" PKG_RELEASE=1 nfpm pkg -f nfpm.webkit.yaml -p deb \
    -t "$OUT/deb/Sable-${VERSION}-linux-${ARCH}.deb"
  PKGROOT="$PKGROOT" PKG_ARCH="$NFPM_ARCH" PKG_VERSION="$RPM_VERSION" PKG_RELEASE="$RPM_ITERATION" nfpm pkg -f nfpm.webkit.yaml -p rpm \
    -t "$OUT/rpm/Sable-${VERSION}-linux-${ARCH}.rpm"
else
  echo "nfpm not found" >&2
  exit 1
fi

cp -f "$WORK/stage/share/applications/sable.desktop" "$APPDIR/sable.desktop"
cp -f src-tauri/icons/128x128.png "$APPDIR/sable.png"
cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
export LD_LIBRARY_PATH="$HERE/usr/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$HERE/usr/bin/sable" "$@"
EOF
chmod 755 "$APPDIR/AppRun"

APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL_CMD" "$APPDIR" \
  "$OUT/appimage/Sable-${VERSION}-linux-${ARCH}.AppImage"

echo "Packages in: $OUT"
