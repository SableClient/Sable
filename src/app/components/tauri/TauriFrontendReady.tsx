import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { createLogger } from '$utils/debug';
import { commands } from '$generated/tauri';

const log = createLogger('TauriFrontendReady');

export function TauriFrontendReady() {
  const [closeToTray] = useSetting(settingsAtom, 'closeToTray');

  useEffect(() => {
    if (!isTauri()) return undefined;

    const appWindow = getCurrentWindow();
    const showWindow = () => {
      appWindow.show().catch((error) => {
        log.warn('Failed to show main window after frontend mount:', error);
      });
    };

    const rafId = window.requestAnimationFrame(showWindow);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return undefined;

    commands.setCloseToTrayEnabled(closeToTray).catch((error) => {
      log.warn('Failed to sync desktop close behavior:', error);
    });

    return undefined;
  }, [closeToTray]);

  return null;
}
