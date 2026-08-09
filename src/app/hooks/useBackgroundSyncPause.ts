import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { TauriEvent, listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import type { MatrixClient } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';
import { isMobileTauri } from '$utils/platform';
import { callEmbedAtom } from '../state/callEmbed';

/**
 * Stop polling while the app is backgrounded. wry only calls Android `WebView.onPause()`,
 * which does not pause JavaScript, so the long-poll otherwise runs until the OS freezes
 * the process. Driven by `visibilitychange` rather than `tauri://suspended`, which on iOS
 * maps to applicationWillResignActive.
 */
export const useBackgroundSyncPause = (mx: MatrixClient | undefined): void => {
  const callEmbed = useAtomValue(callEmbedAtom);
  const callActive = callEmbed !== undefined;

  useEffect(() => {
    if (!mx || !isMobileTauri()) return undefined;

    const resume = () => getSlidingSyncManager(mx)?.resume();
    const applyVisibility = () => {
      const manager = getSlidingSyncManager(mx);
      if (!manager) return;
      if (document.visibilityState === 'hidden' && !callActive) manager.pause();
      else manager.resume();
    };

    document.addEventListener('visibilitychange', applyVisibility);
    const unlisten = isTauri() ? listen(TauriEvent.WINDOW_RESUMED, resume) : undefined;

    applyVisibility();

    return () => {
      document.removeEventListener('visibilitychange', applyVisibility);
      unlisten?.then((off) => off());
      resume();
    };
  }, [mx, callActive]);
};
