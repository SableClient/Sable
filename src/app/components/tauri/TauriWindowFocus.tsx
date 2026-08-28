import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { setNativeWindowFocused } from '$utils/dom';
import { createLogger } from '$utils/debug';

const log = createLogger('TauriWindowFocus');
const WINDOW_HIDDEN_TO_TRAY_EVENT = 'window-hidden-to-tray';

// Mobile has no window focus to report; the DOM path stays authoritative there.
const DESKTOP = new Set(['windows', 'linux', 'macos']);

export function TauriWindowFocus() {
  useEffect(() => {
    if (!isTauri() || !DESKTOP.has(osType())) return undefined;

    let unlistenFocus: (() => void) | undefined;
    let unlistenTrayHide: (() => void) | undefined;
    let cancelled = false;
    // isFocused() is an IPC round-trip and can resolve after a newer focus change.
    let sawEvent = false;

    const appWindow = getCurrentWindow();

    appWindow
      .isFocused()
      .then((focused) => {
        if (!cancelled && !sawEvent) setNativeWindowFocused(focused);
      })
      .catch((error: unknown) => log.warn('Failed to read initial window focus:', error));

    appWindow
      .onFocusChanged(({ payload }) => {
        sawEvent = true;
        setNativeWindowFocused(payload);
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlistenFocus = stop;
      })
      .catch((error: unknown) => log.warn('Failed to subscribe to window focus:', error));

    appWindow
      .listen(WINDOW_HIDDEN_TO_TRAY_EVENT, () => {
        sawEvent = true;
        setNativeWindowFocused(false);
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlistenTrayHide = stop;
      })
      .catch((error: unknown) => log.warn('Failed to subscribe to tray hide:', error));

    return () => {
      cancelled = true;
      unlistenFocus?.();
      unlistenTrayHide?.();
      setNativeWindowFocused(undefined);
    };
  }, []);

  return null;
}
