import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { exit } from '@tauri-apps/plugin-process';
import { useOpenSettings } from '$features/settings';
import { createLogger } from '$utils/debug';

const log = createLogger('DesktopShortcuts');

// macOS drives these through the native menu (emitting `open-settings`);
// Windows/Linux have no menubar, so they are wired to Ctrl-key shortcuts here.
export function DesktopShortcuts() {
  const openSettings = useOpenSettings();

  useEffect(() => {
    if (!isTauri()) return undefined;
    const os = osType();
    if (os !== 'windows' && os !== 'linux' && os !== 'macos') return undefined;

    const cleanups: Array<() => void> = [];

    let unlisten: (() => void) | undefined;
    listen('open-settings', () => openSettings())
      .then((remove) => {
        unlisten = remove;
      })
      .catch((error) => log.warn('Failed to listen for open-settings:', error));
    cleanups.push(() => unlisten?.());

    if (os !== 'macos') {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        const key = event.key.toLowerCase();
        if (key === ',') {
          event.preventDefault();
          openSettings();
        } else if (key === 't') {
          event.preventDefault();
        } else if (key === 'w') {
          event.preventDefault();
          getCurrentWindow()
            .close()
            .catch((error) => log.warn('Failed to close window:', error));
        } else if (key === 'q') {
          event.preventDefault();
          exit(0).catch((error) => log.warn('Failed to quit:', error));
        }
      };
      window.addEventListener('keydown', onKeyDown);
      cleanups.push(() => window.removeEventListener('keydown', onKeyDown));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [openSettings]);

  return null;
}
