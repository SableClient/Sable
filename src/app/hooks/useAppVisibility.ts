import { useEffect, useMemo, useRef } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { togglePusher } from '$features/settings/notifications/PushNotifications';
import { appEvents } from '$utils/appEvents';
import { useClientConfig } from './useClientConfig';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { pushSubscriptionAtom } from '$state/pushSubscription';
import { mobileOrTablet } from '$utils/user-agent';
import { createDebugLogger } from '$utils/debugLogger';
import { getSlidingSyncManager } from '$client/initMatrix';
import { pushSessionToSW } from '../../sw-session';
import { useNotificationDeviceScope } from './useNotificationDeviceScope';

const debugLog = createDebugLogger('AppVisibility');
type PushSubscriptionState = [
  PushSubscriptionJSON | null,
  (subscription: PushSubscription | null) => void,
];

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

const retrySyncOnResume = (
  mx: MatrixClient | undefined,
  trigger: 'visibilitychange' | 'pageshow'
) => {
  if (!mx) return;
  if (document.visibilityState !== 'visible') return;

  const classicRetried = mx.retryImmediately();
  const slidingSyncManager = getSlidingSyncManager(mx);
  slidingSyncManager?.retryNow();

  Sentry.addBreadcrumb({
    category: 'app.visibility',
    message: 'Requested sync retry on app resume',
    level: 'info',
    data: {
      trigger,
      classicRetried,
      slidingSync: !!slidingSyncManager,
      syncState: mx.getSyncState(),
    },
  });
  Sentry.metrics.count('sable.app.resume_sync_retry', 1, {
    attributes: {
      trigger,
      classic_retried: String(classicRetried),
      sliding_sync: String(!!slidingSyncManager),
    },
  });
};

export function useAppVisibility(mx: MatrixClient | undefined, activeSession?: Session) {
  const clientConfig = useClientConfig();
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const pushSubscription = useAtomValue(pushSubscriptionAtom);
  const setPushSubscription = useSetAtom(pushSubscriptionAtom);
  const pushSubAtom = useMemo<PushSubscriptionState>(
    () => [pushSubscription, setPushSubscription],
    [pushSubscription, setPushSubscription]
  );
  const isMobile = mobileOrTablet();
  const { isActiveNotificationClient, notificationDeviceScope } = useNotificationDeviceScope(mx);
  const lastPusherStateRef = useRef<boolean | null>(null);

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
        retrySyncOnResume(mx, 'visibilitychange');
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
      retrySyncOnResume(mx, 'pageshow');
      appEvents.emitVisibilityChange(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [activeSession, mx]);

  useEffect(() => {
    if (!mx) return undefined;

    const reconcilePusher = (isVisible: boolean) => {
      const shouldEnablePusher = isVisible
        ? isMobile ||
          (notificationDeviceScope === 'active_client_only' && isActiveNotificationClient)
        : notificationDeviceScope !== 'active_client_only' || isActiveNotificationClient;
      if (lastPusherStateRef.current === shouldEnablePusher) return;
      lastPusherStateRef.current = shouldEnablePusher;
      void togglePusher(mx, clientConfig, shouldEnablePusher, usePushNotifications, pushSubAtom);
    };

    const unsubscribe = appEvents.onVisibilityChange((isVisible) => {
      reconcilePusher(isVisible);
    });
    reconcilePusher(document.visibilityState === 'visible');

    return () => {
      lastPusherStateRef.current = null;
      unsubscribe();
    };
  }, [
    mx,
    clientConfig,
    usePushNotifications,
    pushSubAtom,
    isMobile,
    isActiveNotificationClient,
    notificationDeviceScope,
  ]);
}
