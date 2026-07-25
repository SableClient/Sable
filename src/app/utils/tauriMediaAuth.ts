import { isTauri } from '@tauri-apps/api/core';
import { clearMediaSession, setMediaSession } from '$generated/tauri/commands';
import { createLogger } from './debug';
import { getActiveMediaSession } from './mediaTransport';

const log = createLogger('tauri-media-auth');

let pendingNativeWrite: Promise<void> = Promise.resolve();

export const updateTauriMediaSession = (
  baseUrl?: string,
  accessToken?: string,
  userId?: string
): Promise<void> => {
  if (!isTauri()) return Promise.resolve();

  const write = pendingNativeWrite.then(async () => {
    try {
      if (baseUrl && accessToken) {
        // `scope` keys the native media cache. It must be the stable user ID, never the
        // access token, which rotates on every OIDC refresh.
        await setMediaSession({ baseUrl, token: accessToken, scope: userId });
      } else {
        await clearMediaSession();
      }
    } catch {
      // Do not log command arguments: they contain the homeserver URL and access token.
      log.warn('Failed to update Tauri media session');
    }
  });

  pendingNativeWrite = write;
  return write;
};

const syncTauriMediaSession = (): Promise<void> => {
  const session = getActiveMediaSession();
  return updateTauriMediaSession(session?.baseUrl, session?.accessToken, session?.userId);
};

export const initTauriMediaSession = (): Promise<void> => {
  if (!isTauri()) return Promise.resolve();

  const initialSync = syncTauriMediaSession();
  window.addEventListener('storage', () => {
    void syncTauriMediaSession();
  });
  return initialSync;
};
