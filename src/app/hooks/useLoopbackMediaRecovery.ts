import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { TauriEvent, listen } from '@tauri-apps/api/event';
import { ensureLoopbackMedia } from '$generated/tauri/commands';
import { clearLoopbackMediaUrlCache } from './useRenderableMediaUrl';

// Keep in step with LOOPBACK_REBOUND_EVENT in src-tauri/src/network/media_protocol.rs.
const LOOPBACK_REBOUND_EVENT = 'sable-media://loopback-rebound';

// iOS reclaims the listener's socket while suspended, so the native side rebinds onto a new
// port and anything holding an older url has to re-resolve.
export const useLoopbackMediaRecovery = (): void => {
  useEffect(() => {
    if (!isTauri()) return undefined;

    const listeners = [
      listen(LOOPBACK_REBOUND_EVENT, () => clearLoopbackMediaUrlCache()),
      listen(TauriEvent.WINDOW_RESUMED, () => {
        void ensureLoopbackMedia().catch(() => undefined);
      }),
    ];

    return () => {
      listeners.forEach((pending) => void pending.then((off) => off()));
    };
  }, []);
};
