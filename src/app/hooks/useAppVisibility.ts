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
      appEvents.onVisibilityChange?.(isVisible);
      if (!isVisible) {
        appEvents.onVisibilityHidden?.();
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

    appEvents.onVisibilityChange = handleVisibilityForNotifications;
    return () => {
      appEvents.onVisibilityChange = null;
    };
  }, [mx, clientConfig, usePushNotifications, pushSubAtom]);

  useEffect(() => {
    if (!mx) return undefined;

    const handleForeground = () => {
      if (document.visibilityState !== 'visible') return;
      // For classic sync, retryImmediately() breaks out of keepalive backoff immediately.
      // For sliding sync the SDK's retryImmediately() is a stub; retryNow() calls
      // slidingSync.resend() which aborts any stalled request and retries without backoff.
      mx.retryImmediately();
      getSlidingSyncManager(mx)?.retryNow();
      debugLog.info('general', 'App foregrounded — sync retry triggered');
    };

    document.addEventListener('visibilitychange', handleForeground);
    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
    };
  }, [mx]);
}
