import { useEffect } from 'react';
import { MatrixClient } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { togglePusher } from '../features/settings/notifications/PushNotifications';
import { appEvents } from '../utils/appEvents';
import { useClientConfig } from './useClientConfig';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { pushSubscriptionAtom } from '../state/pushSubscription';
import { mobileOrTablet } from '../utils/user-agent';
import { createDebugLogger } from '../utils/debugLogger';

const debugLog = createDebugLogger('AppVisibility');

export function useAppVisibility(mx: MatrixClient | undefined) {
  const clientConfig = useClientConfig();
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const pushSubAtom = useAtom(pushSubscriptionAtom);
  const isMobile = mobileOrTablet();

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
    if (!mx) return;

    const handleVisibilityForNotifications = (isVisible: boolean) => {
      togglePusher(mx, clientConfig, isVisible, usePushNotifications, pushSubAtom, isMobile);
    };

    appEvents.onVisibilityChange = handleVisibilityForNotifications;
    // eslint-disable-next-line consistent-return
    return () => {
      appEvents.onVisibilityChange = null;
    };
  }, [mx, clientConfig, usePushNotifications, pushSubAtom, isMobile]);
}
