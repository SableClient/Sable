import { isTauri } from '@tauri-apps/api/core';
import { clearMediaSession, setMediaSession } from '$generated/tauri/commands';
import { createLogger } from './debug';
import { getActiveMediaSession } from './mediaTransport';
import { clearLoopbackMediaUrlCache } from '$hooks/useRenderableMediaUrl';

const log = createLogger('tauri-media-auth');

let pendingNativeWrite: Promise<void> = Promise.resolve();
let tauriMediaSessionListenersInstalled = false;
// In memory only, never logged. Compared so a no-op sync keeps the loopback cache.
let lastMediaToken: string | undefined;

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
        // Capabilities embed the access token, so a rotated token orphans every cached URL.
        if (accessToken !== lastMediaToken) {
          clearLoopbackMediaUrlCache();
          lastMediaToken = accessToken;
        }
      } else {
        await clearMediaSession();
        clearLoopbackMediaUrlCache();
        lastMediaToken = undefined;
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
  if (!session) return Promise.resolve();
  return updateTauriMediaSession(session.baseUrl, session.accessToken, session.userId);
};

export const initTauriMediaSession = (): Promise<void> => {
  if (!isTauri()) return Promise.resolve();

  if (!tauriMediaSessionListenersInstalled) {
    const sync = () => {
      void syncTauriMediaSession();
    };
    window.addEventListener('storage', sync);
    window.addEventListener('sable-session-changed', sync);
    tauriMediaSessionListenersInstalled = true;
  }

  return syncTauriMediaSession();
};
