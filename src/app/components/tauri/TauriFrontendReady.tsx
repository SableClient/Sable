import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { createLogger } from '$utils/debug';

const log = createLogger('TauriFrontendReady');

// Show the window at the first paint frame after the shell mounts, not after
// the full `window.load` event (which fires after ALL resources). This cuts the
// perceived blank-screen time substantially on desktop cold starts.
function showOnFirstPaint(cb: () => void): () => void {
  if (document.visibilityState === 'hidden') {
    // Headless/test: fall back to load event to avoid showing a hidden window.
    if (document.readyState === 'complete') {
      cb();
      return () => {};
    }
    const handleLoad = () => cb();
    window.addEventListener('load', handleLoad, { once: true });
    return () => window.removeEventListener('load', handleLoad);
  }

  const id = requestAnimationFrame(() => cb());
  return () => cancelAnimationFrame(id);
}

export function TauriFrontendReady() {
  useEffect(() => {
    if (!isTauri()) return undefined;

    const os = osType();
    if (os !== 'windows' && os !== 'linux' && os !== 'macos') return undefined;

    const appWindow = getCurrentWindow();
    return showOnFirstPaint(() => {
      appWindow.show().catch((error) => {
        log.warn('Failed to show main window after first paint:', error);
      });
    });
  }, []);

  return null;
}
