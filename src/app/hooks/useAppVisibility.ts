import { useEffect } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { togglePusher } from '../features/settings/notifications/PushNotifications';
import { appEvents } from '../utils/appEvents';
import { useClientConfig } from './useClientConfig';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { pushSubscriptionAtom } from '../state/pushSubscription';
import { createDebugLogger } from '../utils/debugLogger';
import { getSlidingSyncManager } from '$client/initMatrix';
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

    const unsub = appEvents.onVisibilityChange(handleVisibilityForNotifications);
    return unsub;
  }, [mx, clientConfig, usePushNotifications, pushSubAtom]);

  useEffect(() => {
    if (!mx) return undefined;

    const doRetry = () => {
      // Wrap retry calls in try-catch to prevent crashes during wake/restore.
      // The matrix client or sliding sync manager might be in an invalid state
      // if the device just woke from sleep or the app was restored from bfcache.
      try {
        // For classic sync, retryImmediately() breaks out of keepalive backoff immediately.
        // For sliding sync the SDK's retryImmediately() is a stub; retryNow() calls
        // slidingSync.resend() which aborts any stalled request and retries without backoff.
        mx.retryImmediately();
        getSlidingSyncManager(mx)?.retryNow();
      } catch (err) {
        debugLog.error('general', 'Sync retry failed during wake/restore', {
          error: err instanceof Error ? err.message : String(err),
        });
        // Don't rethrow — allow the app to continue and retry will happen naturally
        // once the client is in a healthy state again.
      }
    };

    // Debounce foreground events: both pageshow[persisted] and visibilitychange can
    // fire within milliseconds of each other on iOS bfcache restore, so coalesce them
    // to avoid duplicate sync retries.
    let debounceTimer: number | undefined;
    const debouncedRetry = () => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        doRetry();
      }, 100); // 100ms window to catch both events
    };

    const handleForeground = () => {
      if (document.visibilityState !== 'visible') return;
      debugLog.info('general', 'App foregrounded — sync retry triggered');

      // Wrap in try-catch in case retry throws (e.g., client disposed, network unavailable)
      try {
        debouncedRetry();
      } catch (err) {
        debugLog.error('general', 'Failed to schedule sync retry on foreground', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (!mobileOrTablet()) return;
      // On iOS the network layer is not always immediately available when
      // visibilitychange fires after a background suspension. Schedule
      // fallback retries so the sync recovers once networking is ready.
      // Each timer is cancelled if the app goes back to background first.
      const t1 = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          try {
            doRetry();
            debugLog.info('general', 'App foregrounded — sync retry (1.5 s fallback)');
          } catch (err) {
            debugLog.error('general', 'Sync retry failed (1.5s fallback)', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }, 1500);
      const t2 = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          try {
            doRetry();
            debugLog.info('general', 'App foregrounded — sync retry (5 s fallback)');
          } catch (err) {
            debugLog.error('general', 'Sync retry failed (5s fallback)', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }, 5000);
      const cancelOnHide = () => {
        if (document.visibilityState === 'visible') return;
        clearTimeout(t1);
        clearTimeout(t2);
        if (debounceTimer !== undefined) {
          clearTimeout(debounceTimer);
          debounceTimer = undefined;
        }
        document.removeEventListener('visibilitychange', cancelOnHide);
      };
      document.addEventListener('visibilitychange', cancelOnHide);
    };

    // pageshow fires when the page is restored from the browser's back-forward
    // cache (bfcache). On some iOS versions the PWA can be restored from bfcache
    // without a visibilitychange event, so this acts as an extra safety net.
    const handlePageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        debugLog.info('general', 'App restored from bfcache');
        try {
          handleForeground();
        } catch (err) {
          debugLog.error('general', 'Failed to handle bfcache restore', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handlePageShow);
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
    };
  }, [mx]);
}
