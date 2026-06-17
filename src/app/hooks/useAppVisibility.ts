import { useEffect } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { useAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { togglePusher } from '../features/settings/notifications/PushNotifications';
import { appEvents } from '../utils/appEvents';
import { useClientConfig } from './useClientConfig';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { pushSubscriptionAtom } from '../state/pushSubscription';
import { mobileOrTablet } from '../utils/user-agent';
import { createDebugLogger } from '../utils/debugLogger';
import { pushSessionToSW } from '../../sw-session';

const debugLog = createDebugLogger('AppVisibility');

const requestServiceWorkerClaim = () => {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return;
  if (document.visibilityState !== 'visible') return;

  navigator.serviceWorker.ready
    .then((registration) => {
      const activeWorker = registration.active;
      if (!activeWorker || activeWorker.state !== 'activated') return;
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      activeWorker.postMessage({ type: 'CLAIM_CLIENTS' });
    })
    .catch(() => undefined);
};

const refreshServiceWorkerSession = (activeSession?: Session) => {
  if (!activeSession) return;
  if (document.visibilityState !== 'visible') return;
  pushSessionToSW(activeSession.baseUrl, activeSession.accessToken, activeSession.userId);
};

export function useAppVisibility(mx: MatrixClient | undefined, activeSession?: Session) {
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
      if (isVisible) {
        Sentry.metrics.count('sable.app.resume', 1, {
          attributes: { trigger: 'visibilitychange' },
        });
        requestServiceWorkerClaim();
        refreshServiceWorkerSession(activeSession);
      }
      appEvents.emitVisibilityChange(isVisible);
      if (!isVisible) {
        appEvents.emitVisibilityHidden();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (document.visibilityState !== 'visible') return;
      Sentry.addBreadcrumb({
        category: 'app.visibility',
        message: 'App restored from pageshow',
        level: 'info',
        data: { persisted: event.persisted },
      });
      Sentry.metrics.count('sable.app.resume', 1, {
        attributes: { trigger: 'pageshow_persisted' },
      });
      requestServiceWorkerClaim();
      refreshServiceWorkerSession(activeSession);
      appEvents.emitVisibilityChange(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [activeSession]);

  useEffect(() => {
    if (!mx) return undefined;

    const unsubscribe = appEvents.onVisibilityChange((isVisible) => {
      void togglePusher(mx, clientConfig, isVisible, usePushNotifications, pushSubAtom, isMobile);
    });

    return unsubscribe;
  }, [mx, clientConfig, usePushNotifications, pushSubAtom, isMobile]);
}
