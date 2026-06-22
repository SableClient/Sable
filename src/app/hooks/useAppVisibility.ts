import { useEffect, useMemo, useRef } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { togglePusher } from '$features/settings/notifications/PushNotifications';
import { appEvents } from '$utils/appEvents';
import type { ForegroundRecoveryTrigger } from '$utils/appEvents';
import { useClientConfig } from './useClientConfig';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { pushSubscriptionAtom } from '$state/pushSubscription';
import { mobileOrTablet } from '$utils/user-agent';
import { createDebugLogger } from '$utils/debugLogger';
import { getSlidingSyncManager } from '$client/initMatrix';
import { pushSessionToSW } from '../../sw-session';
import {
  shouldEnableNotificationPusher,
  useNotificationDeviceScope,
} from './useNotificationDeviceScope';

const debugLog = createDebugLogger('AppVisibility');
type PushSubscriptionState = [
  PushSubscriptionJSON | null,
  (subscription: PushSubscription | null) => void,
];
const RESUME_RECOVERY_THROTTLE_MS = 15_000;
const INTERACTION_IDLE_RECOVERY_MS = 10 * 60_000;

const requestServiceWorkerClaim = (trigger: ForegroundRecoveryTrigger) => {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return;
  if (document.visibilityState !== 'visible') return;

  Sentry.addBreadcrumb({
    category: 'app.visibility',
    message: 'Requesting service worker claim on app resume',
    level: 'info',
    data: { trigger },
  });
  Sentry.metrics.count('sable.app.resume_sw_claim_request', 1, {
    attributes: { trigger },
  });

  navigator.serviceWorker.ready
    .then((registration) => {
      const activeWorker = registration.active;
      if (!activeWorker || activeWorker.state !== 'activated') return;
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      activeWorker.postMessage({ type: 'CLAIM_CLIENTS' });
    })
    .catch(() => undefined);
};

const refreshServiceWorkerSession = (
  trigger: ForegroundRecoveryTrigger,
  activeSession?: Session
) => {
  if (!activeSession) return;
  if (document.visibilityState !== 'visible') return;
  Sentry.addBreadcrumb({
    category: 'app.visibility',
    message: 'Refreshing service worker session on app resume',
    level: 'info',
    data: {
      trigger,
      hasSession: true,
    },
  });
  pushSessionToSW(activeSession.baseUrl, activeSession.accessToken, activeSession.userId);
};

const retrySyncOnResume = (mx: MatrixClient | undefined, trigger: ForegroundRecoveryTrigger) => {
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
  const lastRecoveryRequestAtRef = useRef(0);
  const lastInteractionAtRef = useRef(Date.now());

  useEffect(() => {
    const requestForegroundRecovery = (
      trigger: ForegroundRecoveryTrigger,
      data?: Record<string, unknown>
    ) => {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      const sinceLastRecoveryMs = now - lastRecoveryRequestAtRef.current;
      if (sinceLastRecoveryMs < RESUME_RECOVERY_THROTTLE_MS) {
        debugLog.info('general', 'Skipped foreground recovery because it was requested recently', {
          trigger,
          sinceLastRecoveryMs,
        });
        return;
      }

      lastRecoveryRequestAtRef.current = now;
      Sentry.addBreadcrumb({
        category: 'app.visibility',
        message: 'Foreground recovery requested',
        level: 'info',
        data: {
          trigger,
          ...data,
        },
      });
      Sentry.metrics.count('sable.app.resume', 1, {
        attributes: { trigger },
      });
      appEvents.emitForegroundRecoveryRequested(trigger);
      requestServiceWorkerClaim(trigger);
      refreshServiceWorkerSession(trigger, activeSession);
      retrySyncOnResume(mx, trigger);
    };

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      debugLog.info(
        'general',
        `App visibility changed: ${isVisible ? 'visible (foreground)' : 'hidden (background)'}`,
        { visibilityState: document.visibilityState }
      );
      if (isVisible) {
        requestForegroundRecovery('visibilitychange');
        lastInteractionAtRef.current = Date.now();
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
      requestForegroundRecovery('pageshow_persisted', { persisted: event.persisted });
      lastInteractionAtRef.current = Date.now();
      appEvents.emitVisibilityChange(true);
    };

    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return;
      requestForegroundRecovery('focus');
      lastInteractionAtRef.current = Date.now();
      appEvents.emitVisibilityChange(true);
    };

    const handleInteraction = (trigger: 'pointerdown' | 'keydown') => {
      const now = Date.now();
      const idleForMs = now - lastInteractionAtRef.current;
      lastInteractionAtRef.current = now;
      if (document.visibilityState !== 'visible') return;
      if (idleForMs < INTERACTION_IDLE_RECOVERY_MS) return;

      requestForegroundRecovery(trigger, { idleForMs });
    };
    const handlePointerDown = () => handleInteraction('pointerdown');
    const handleKeyDown = () => handleInteraction('keydown');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('pointerdown', handlePointerDown, {
      capture: true,
      passive: true,
    });
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [activeSession, mx]);

  useEffect(() => {
    if (!mx) return undefined;

    const reconcilePusher = (isVisible: boolean) => {
      const shouldEnablePusher = shouldEnableNotificationPusher(
        isVisible,
        isMobile,
        notificationDeviceScope,
        isActiveNotificationClient
      );
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
