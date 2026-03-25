import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { createLogger } from '$utils/debug';
import { setCloseToTrayEnabled } from '$generated/tauri/commands';

const log = createLogger('TauriFrontendReady');

export function TauriFrontendReady() {
  const [closeToTray] = useSetting(settingsAtom, 'closeToTray');

  useEffect(() => {
    if (!isTauri()) return undefined;

    const os = osType();
    if (os !== 'windows' && os !== 'linux' && os !== 'macos') return undefined;

    const appWindow = getCurrentWindow();
    const rafId = window.requestAnimationFrame(() => {
      appWindow.show().catch((error) => {
        log.warn('Failed to show main window after frontend mount:', error);
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!isTauri()) return undefined;

    const os = osType();
    if (os !== 'windows' && os !== 'linux' && os !== 'macos') return undefined;

    setCloseToTrayEnabled({ enabled: closeToTray }).catch((error) => {
      log.warn('Failed to sync desktop close behavior:', error);
    });
    return undefined;
  }, [closeToTray]);

  return null;
}
