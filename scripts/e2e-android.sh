#!/usr/bin/env bash
# Orchestrate a Playwright-over-CDP run against the Tauri Android debug APK.
#
# Usage:
#   ./scripts/e2e-android.sh              # build + install + launch + forward + test
#   ./scripts/e2e-android.sh --skip-build # reuse installed APK, just launch + forward + test
#
# Environment:
#   ANDROID_SERIAL  set by android-emulator-runner in CI; when present, adb
#                   targets it automatically (no -s needed). Locally, the
#                   script auto-selects the first connected device.
#   APK_PATH         override the APK to install (defaults to the universal
#                   debug build output).
#   CDP_PORT         override the forwarded CDP port (default 9222).
#
# Requires: adb in PATH, ANDROID_HOME set, a connected device or running
# emulator, and a debug APK (built via `pnpm tauri android build --debug`).

set -euo pipefail

APP_ID="moe.sable.client"
APK="${APK_PATH:-src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk}"
CDP_PORT="${CDP_PORT:-9222}"
PLAYWRIGHT_CONFIG="playwright.android.config.ts"

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --*) ;; # pass through to playwright
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# When ANDROID_SERIAL is set (CI emulator-runner), adb uses it by default.
# Locally, auto-select the first connected device and pin it via -s.
ADB_DEV=""
if [ -z "${ANDROID_SERIAL:-}" ]; then
  echo "==> selecting device"
  DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
  if [ -z "$DEVICE" ]; then
    echo "no device/emulator found" >&2
    exit 1
  fi
  echo "device: $DEVICE"
  ADB_DEV="-s $DEVICE"
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> building debug APK (this is slow on a cold Gradle cache)"
  pnpm tauri android build --debug
fi

if [ ! -f "$APK" ]; then
  echo "APK not found at $APK — run without --skip-build first" >&2
  exit 1
fi

echo "==> installing APK"
# shellcheck disable=SC2086
adb $ADB_DEV install -r "$APK"

echo "==> launching app"
# shellcheck disable=SC2086
adb $ADB_DEV shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1

# The WebView's devtools socket is named webview_devtools_remote_<pid>. It only
# appears once the app has created its first WebView, which can take >30s after
# a fresh install on a cold device. Poll generously and print progress so a slow
# start is not mistaken for a hang.
echo "==> waiting for WebView devtools socket"
sleep 3
SOCKET=""
for i in $(seq 1 60); do
  # shellcheck disable=SC2086
  PID=$(adb $ADB_DEV shell pidof "$APP_ID" | tr -d '\r' | awk '{print $1}')
  if [ -n "$PID" ]; then
    # shellcheck disable=SC2086
    SOCKET=$(adb $ADB_DEV shell cat /proc/net/unix 2>/dev/null | grep "webview_devtools_remote_${PID}" | awk '{print $NF}' | head -1)
    if [ -n "$SOCKET" ]; then
      # /proc/net/unix prints abstract sockets with a leading @, but
      # `adb forward localabstract:` already implies abstract and rejects the @.
      SOCKET="${SOCKET#@}"
      break
    fi
  fi
  printf '.'
  sleep 1
done
echo

if [ -z "$SOCKET" ]; then
  echo "WebView devtools socket never appeared (is this a release build? debug builds expose it)" >&2
  exit 1
fi
echo "socket: $SOCKET (pid $PID)"

echo "==> forwarding to localhost:$CDP_PORT"
# shellcheck disable=SC2086
adb $ADB_DEV forward tcp:"$CDP_PORT" localabstract:"$SOCKET"

echo "==> running tests"
# Strip our own flags; pass the rest to playwright.
PW_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --skip-build) ;;
    *) PW_ARGS+=("$arg") ;;
  esac
done
pnpm exec playwright test --config "$PLAYWRIGHT_CONFIG" "${PW_ARGS[@]}"

# tidy up the forward so it does not linger across runs
# shellcheck disable=SC2086
adb $ADB_DEV forward --remove tcp:"$CDP_PORT" 2>/dev/null || true
