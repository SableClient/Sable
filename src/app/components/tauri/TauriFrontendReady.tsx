import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import splashscreen from 'tauri-plugin-splashscreen-api';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { createLogger } from '$utils/debug';
import { commands } from '$generated/tauri';

const log = createLogger('TauriFrontendReady');

export function TauriFrontendReady() {
  const [closeToTray] = useSetting(settingsAtom, 'closeToTray');

  useEffect(() => {
    if (!isTauri()) return undefined;

    const os = osType();

    if (os === 'android' || os === 'ios') {
      // Wait for the first painted frame before signalling the plugin,
      // otherwise the WebView content isn't visible yet when the native
      // splash screen is dismissed — causing a blank-screen flash.
      const rafId = window.requestAnimationFrame(() => {
        log.log('Frontend is ready, sending close command to splashscreen plugin');
        splashscreen.close().catch((error: unknown) => {
          log.warn('Splashscreen close failed:', error);
        });
      });
      return () => window.cancelAnimationFrame(rafId);
    }

    if (os === 'windows' || os === 'linux' || os === 'macos') {
      const appWindow = getCurrentWindow();
      const rafId = window.requestAnimationFrame(() => {
        appWindow.show().catch((error) => {
          log.warn('Failed to show main window after frontend mount:', error);
        });
      });
      return () => window.cancelAnimationFrame(rafId);
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (!isTauri()) return undefined;

    const os = osType();
    if (os !== 'windows' && os !== 'linux' && os !== 'macos') return undefined;

    commands.setCloseToTrayEnabled(closeToTray).catch((error) => {
      log.warn('Failed to sync desktop close behavior:', error);
    });
    return undefined;
  }, [closeToTray]);

  return null;
}
