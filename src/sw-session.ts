import { isTauri } from '@tauri-apps/api/core';
import { getStoredSession } from './app/state/sessions';
import { updateTauriMediaSession } from './app/utils/tauriMediaAuth';

export function pushSessionToSW(
  baseUrl?: string,
  accessToken?: string,
  userId?: string
): Promise<void> {
  if (isTauri()) {
    // Tauri has no service worker.
    return updateTauriMediaSession(baseUrl, accessToken, userId);
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

// Pushes the persisted session (which may hold a refreshed token) rather than the
// captured one; falls back to it when nothing is persisted.
export function pushPersistedSessionToSW(fallback: {
  baseUrl: string;
  accessToken: string;
  userId: string;
}): Promise<void> {
  const session = getStoredSession(fallback.userId) ?? fallback;
  return pushSessionToSW(session.baseUrl, session.accessToken, session.userId);
}
