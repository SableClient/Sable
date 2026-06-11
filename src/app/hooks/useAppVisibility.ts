import { useEffect } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { togglePusher } from '../features/settings/notifications/PushNotifications';
import { appEvents } from '../utils/appEvents';
import { useClientConfig } from './useClientConfig';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { pushSubscriptionAtom } from '../state/pushSubscription';
import { createDebugLogger } from '../utils/debugLogger';
import {
  getSlidingSyncManager,
  pauseClientForBfcache,
  resumeClientFromBfcache,
} from '$client/initMatrix';
import { mobileOrTablet } from '$utils/user-agent';

const debugLog = createDebugLogger('AppVisibility');

export function useAppVisibility(mx: MatrixClient | undefined) {
  const clientConfig = useClientConfig();
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const pushSubAtom = useAtom(pushSubscriptionAtom);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      debugLog.info(
        'general',
        `App visibility changed: ${isVisible ? 'visible (foreground)' : 'hidden (background)'}`,
        { visibilityState: document.visibilityState }
      );
      appEvents.emitVisibilityChange(isVisible);
      if (!isVisible) {
        appEvents.emitVisibilityHidden();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!mx) return undefined;

    const handleVisibilityForNotifications = (isVisible: boolean) => {
      // Always keep the pusher registered regardless of visibility — the SW's
      // hasVisibleClient check handles OS-notification suppression when the app
      // is in the foreground, so we never need to delete the pusher.  Keeping
      // it permanently avoids the enable/disable race that can leave the
      // homeserver without a valid pusher after rapid tab-focus changes.
      togglePusher(mx, clientConfig, isVisible, usePushNotifications, pushSubAtom, true);
    };

    const unsub = appEvents.onVisibilityChange;
    appEvents.onVisibilityChange = handleVisibilityForNotifications;
    return () => {
      appEvents.onVisibilityChange = unsub;
    };
  }, [mx, clientConfig, usePushNotifications, pushSubAtom]);

  // Handle app foreground/background events for timeline refresh and visibility tracking.
  // The Matrix SDK handles reconnection automatically when network requests are aborted
  // by iOS suspension - we just need to emit visibility events for UI updates.
  useEffect(() => {
    if (!mx) return undefined;

    const handleForeground = () => {
      if (document.visibilityState !== 'visible') return;
      debugLog.info('general', 'App foregrounded');
      
      // Emit visibility event so timeline and other components can refresh.
      // The Matrix SDK will handle reconnection automatically if needed - no
      // need for aggressive retry logic that can cause reconnection cascades
      // on iOS when in-flight requests are aborted during suspension.
      try {
        appEvents.onVisibilityChange?.(true);
      } catch (err) {
        debugLog.error('general', 'Failed to emit visibility change', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // pageshow fires when the page is restored from the browser's back-forward
    // cache (bfcache). On some iOS versions the PWA can be restored from bfcache
    // without a visibilitychange event, so this acts as an extra safety net.
    const handlePageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        debugLog.info('general', 'App restored from bfcache');
        try {
          appEvents.onVisibilityChange?.(true);
        } catch (err) {
          debugLog.error('general', 'Failed to handle bfcache restore', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('pageshow', handlePageShow);

    // Emit initial visibility state on mount to ensure all listeners
    // (including timeline refresh) are aware of current state.
    if (document.visibilityState === 'visible') {
      const timeoutId = setTimeout(() => {
        appEvents.onVisibilityChange?.(true);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('visibilitychange', handleForeground);
        window.removeEventListener('pageshow', handlePageShow);
      };
    }

    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [mx]);
}
