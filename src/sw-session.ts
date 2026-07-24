import { isTauri } from '@tauri-apps/api/core';
import { updateTauriMediaSession } from './app/utils/tauriMediaAuth';

export function pushSessionToSW(
  baseUrl?: string,
  accessToken?: string,
  userId?: string
): Promise<void> {
  if (isTauri()) {
    // Tauri has no service worker.
    return updateTauriMediaSession(baseUrl, accessToken);
  }

  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return Promise.resolve();
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'setSession',
    accessToken,
    baseUrl,
    userId,
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
  });
  return Promise.resolve();
}
