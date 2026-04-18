import { useCallback, useEffect, useRef } from 'react';
import { MatrixClient } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { getSlidingSyncManager } from '$client/initMatrix';
import { togglePusher } from '../features/settings/notifications/PushNotifications';
import { appEvents } from '../utils/appEvents';
import { useClientConfig, useExperimentVariant } from './useClientConfig';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { pushSubscriptionAtom } from '../state/pushSubscription';
import { mobileOrTablet } from '../utils/user-agent';
import { createDebugLogger } from '../utils/debugLogger';
import { pushSessionToSW } from '../../sw-session';

const debugLog = createDebugLogger('AppVisibility');

const DEFAULT_FOREGROUND_DEBOUNCE_MS = 1500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_RESUME_HEARTBEAT_SUPPRESS_MS = 60 * 1000;
const DEFAULT_HEARTBEAT_MAX_BACKOFF_MS = 30 * 60 * 1000;

export function useAppVisibility(mx: MatrixClient | undefined) {
  const clientConfig = useClientConfig();
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const pushSubAtom = useAtom(pushSubscriptionAtom);
  const isMobile = mobileOrTablet();

  const sessionSyncConfig = clientConfig.sessionSync;
  const sessionSyncVariant = useExperimentVariant(
    'sessionSyncStrategy',
    mx?.getUserId() ?? undefined
  );

  // Derive phase flags from experiment variant; fall back to direct config when not in experiment.
  const inSessionSync = sessionSyncVariant.inExperiment;
  const syncVariant = sessionSyncVariant.variant;
  const phase1ForegroundResync = inSessionSync
    ? syncVariant === 'session-sync-heartbeat' || syncVariant === 'session-sync-adaptive'
    : sessionSyncConfig?.phase1ForegroundResync === true;
  const phase2VisibleHeartbeat = inSessionSync
    ? syncVariant === 'session-sync-heartbeat' || syncVariant === 'session-sync-adaptive'
    : sessionSyncConfig?.phase2VisibleHeartbeat === true;
  const phase3AdaptiveBackoffJitter = inSessionSync
    ? syncVariant === 'session-sync-adaptive'
    : sessionSyncConfig?.phase3AdaptiveBackoffJitter === true;

  const foregroundDebounceMs = Math.max(
    0,
    sessionSyncConfig?.foregroundDebounceMs ?? DEFAULT_FOREGROUND_DEBOUNCE_MS
  );
  const heartbeatIntervalMs = Math.max(
    1000,
    sessionSyncConfig?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  );
  const resumeHeartbeatSuppressMs = Math.max(
    0,
    sessionSyncConfig?.resumeHeartbeatSuppressMs ?? DEFAULT_RESUME_HEARTBEAT_SUPPRESS_MS
  );
  const heartbeatMaxBackoffMs = Math.max(
    heartbeatIntervalMs,
    sessionSyncConfig?.heartbeatMaxBackoffMs ?? DEFAULT_HEARTBEAT_MAX_BACKOFF_MS
  );

  const lastForegroundPushAtRef = useRef(0);
  const suppressHeartbeatUntilRef = useRef(0);
  const heartbeatFailuresRef = useRef(0);
  const lastEmittedVisibilityRef = useRef<boolean | undefined>(undefined);

  const pushSessionNow = useCallback(
    (reason: 'foreground' | 'focus' | 'heartbeat'): 'sent' | 'skipped' => {
      const baseUrl = mx?.getHomeserverUrl();
      const accessToken = mx?.getAccessToken();
      const userId = mx?.getUserId();
      const canPush =
        !!mx &&
        typeof baseUrl === 'string' &&
        typeof accessToken === 'string' &&
        typeof userId === 'string' &&
        'serviceWorker' in navigator &&
        !!navigator.serviceWorker.controller;

      if (!canPush) {
        debugLog.warn('network', 'Skipped SW session sync', {
          reason,
          hasClient: !!mx,
          hasBaseUrl: !!baseUrl,
          hasAccessToken: !!accessToken,
          hasUserId: !!userId,
          hasSwController: !!navigator.serviceWorker?.controller,
        });
        return 'skipped';
      }

      pushSessionToSW(baseUrl, accessToken, userId);
      debugLog.info('network', 'Pushed session to SW', {
        reason,
        phase1ForegroundResync,
        phase2VisibleHeartbeat,
        phase3AdaptiveBackoffJitter,
      });
      return 'sent';
    },
    [mx, phase1ForegroundResync, phase2VisibleHeartbeat, phase3AdaptiveBackoffJitter]
  );

  useEffect(() => {
    const handleVisibilityState = (isVisible: boolean, source: 'visibilitychange' | 'pagehide') => {
      if (lastEmittedVisibilityRef.current === isVisible) return;
      lastEmittedVisibilityRef.current = isVisible;

      debugLog.info(
        'general',
        `App visibility changed: ${isVisible ? 'visible (foreground)' : 'hidden (background)'}`,
        { visibilityState: document.visibilityState, source }
      );
      appEvents.emitVisibilityChange(isVisible);
      if (!isVisible) {
        appEvents.emitVisibilityHidden();
        return;
      }

      // Always kick the sync loop on foreground regardless of phase flags —
      // the SDK may be sitting in exponential backoff after iOS froze the tab.
      mx?.retryImmediately();
      // retryImmediately() is a no-op on SlidingSyncSdk — call resend() on the
      // SlidingSync instance directly to abort a stale long-poll and start fresh.
      if (mx) getSlidingSyncManager(mx)?.slidingSync.resend();

      if (!phase1ForegroundResync) return;

      const now = Date.now();
      if (now - lastForegroundPushAtRef.current < foregroundDebounceMs) return;
      lastForegroundPushAtRef.current = now;

      if (pushSessionNow('foreground') === 'sent') {
        // A successful push proves the SW controller is up — reset adaptive backoff
        // so the heartbeat returns to its normal interval immediately rather than
        // staying on an inflated delay left over from a prior SW absence period.
        if (phase3AdaptiveBackoffJitter) heartbeatFailuresRef.current = 0;
        if (phase3AdaptiveBackoffJitter && phase2VisibleHeartbeat) {
          suppressHeartbeatUntilRef.current = now + resumeHeartbeatSuppressMs;
        }
      }
    };

    const handleVisibilityChange = () => {
      handleVisibilityState(document.visibilityState === 'visible', 'visibilitychange');
    };

    const handlePageHide = () => {
      handleVisibilityState(false, 'pagehide');
    };

    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return;

      // Always kick the sync loop on focus for the same reason as above.
      mx?.retryImmediately();
      if (mx) getSlidingSyncManager(mx)?.slidingSync.resend();

      if (!phase1ForegroundResync) return;

      const now = Date.now();
      if (now - lastForegroundPushAtRef.current < foregroundDebounceMs) return;
      lastForegroundPushAtRef.current = now;

      if (pushSessionNow('focus') === 'sent') {
        if (phase3AdaptiveBackoffJitter) heartbeatFailuresRef.current = 0;
        if (phase3AdaptiveBackoffJitter && phase2VisibleHeartbeat) {
          suppressHeartbeatUntilRef.current = now + resumeHeartbeatSuppressMs;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('focus', handleFocus);
    };
  }, [
    foregroundDebounceMs,
    mx,
    phase1ForegroundResync,
    phase2VisibleHeartbeat,
    phase3AdaptiveBackoffJitter,
    pushSessionNow,
    resumeHeartbeatSuppressMs,
  ]);

  useEffect(() => {
    if (!mx) return undefined;

    const handleVisibilityForNotifications = (isVisible: boolean) => {
      togglePusher(mx, clientConfig, isVisible, usePushNotifications, pushSubAtom, isMobile);
    };

    const unsubscribe = appEvents.onVisibilityChange(handleVisibilityForNotifications);
    return unsubscribe;
  }, [mx, clientConfig, usePushNotifications, pushSubAtom, isMobile]);

  useEffect(() => {
    if (!phase2VisibleHeartbeat) return undefined;

    // Reset adaptive backoff/suppression so a config or session change starts fresh.
    heartbeatFailuresRef.current = 0;
    suppressHeartbeatUntilRef.current = 0;

    let timeoutId: number | undefined;

    const getDelayMs = (): number => {
      let delay = heartbeatIntervalMs;

      if (phase3AdaptiveBackoffJitter) {
        const failures = heartbeatFailuresRef.current;
        const backoffFactor = Math.min(2 ** failures, heartbeatMaxBackoffMs / heartbeatIntervalMs);
        delay = Math.min(heartbeatMaxBackoffMs, Math.round(heartbeatIntervalMs * backoffFactor));

        // Add +-20% jitter to avoid synchronized heartbeat spikes across many clients.
        const jitter = 0.8 + Math.random() * 0.4;
        delay = Math.max(1000, Math.round(delay * jitter));
      }

      return delay;
    };

    const tick = () => {
      const now = Date.now();

      if (document.visibilityState !== 'visible' || !navigator.onLine) {
        timeoutId = window.setTimeout(tick, getDelayMs());
        return;
      }

      if (phase3AdaptiveBackoffJitter && now < suppressHeartbeatUntilRef.current) {
        timeoutId = window.setTimeout(tick, getDelayMs());
        return;
      }

      const result = pushSessionNow('heartbeat');
      if (phase3AdaptiveBackoffJitter) {
        if (result === 'sent') {
          heartbeatFailuresRef.current = 0;
        } else {
          // 'skipped' means prerequisites (SW controller, session) aren't ready.
          // Treat as a transient failure so backoff grows until the SW is ready.
          heartbeatFailuresRef.current += 1;
        }
      }

      timeoutId = window.setTimeout(tick, getDelayMs());
    };

    timeoutId = window.setTimeout(tick, getDelayMs());

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    heartbeatIntervalMs,
    heartbeatMaxBackoffMs,
    phase2VisibleHeartbeat,
    phase3AdaptiveBackoffJitter,
    pushSessionNow,
  ]);
}
