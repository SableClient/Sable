import { useCallback, useEffect, useRef } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import type { Session } from '$state/sessions';
import { togglePusher } from '../features/settings/notifications/PushNotifications';
import { appEvents } from '../utils/appEvents';
import { useClientConfig, useExperimentVariant } from './useClientConfig';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { pushSubscriptionAtom } from '../state/pushSubscription';
import { createDebugLogger } from '../utils/debugLogger';
import { getSlidingSyncManager } from '$client/initMatrix';
import { mobileOrTablet } from '$utils/user-agent';
import { pushSessionToSW } from '../../sw-session';

const debugLog = createDebugLogger('AppVisibility');

const DEFAULT_FOREGROUND_DEBOUNCE_MS = 1500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_RESUME_HEARTBEAT_SUPPRESS_MS = 60 * 1000;
const DEFAULT_HEARTBEAT_MAX_BACKOFF_MS = 30 * 60 * 1000;

export function useAppVisibility(mx: MatrixClient | undefined, activeSession?: Session) {
  const clientConfig = useClientConfig();
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const pushSubAtom = useAtom(pushSubscriptionAtom);
  const sessionSyncConfig = clientConfig.sessionSync;
  const sessionSyncVariant = useExperimentVariant('sessionSyncStrategy', activeSession?.userId);
  const hasDirectSessionSyncConfig = sessionSyncConfig !== undefined;

  const phase1ForegroundResync = sessionSyncVariant.inExperiment
    ? sessionSyncVariant.variant === 'session-sync-heartbeat' ||
      sessionSyncVariant.variant === 'session-sync-adaptive'
    : hasDirectSessionSyncConfig
      ? sessionSyncConfig?.phase1ForegroundResync === true
      : true;
  const phase2VisibleHeartbeat = sessionSyncVariant.inExperiment
    ? sessionSyncVariant.variant === 'session-sync-heartbeat' ||
      sessionSyncVariant.variant === 'session-sync-adaptive'
    : hasDirectSessionSyncConfig
      ? sessionSyncConfig?.phase2VisibleHeartbeat === true
      : true;
  const phase3AdaptiveBackoffJitter = sessionSyncVariant.inExperiment
    ? sessionSyncVariant.variant === 'session-sync-adaptive'
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

  const pushSessionNow = useCallback(
    (reason: 'foreground' | 'focus' | 'pageshow' | 'heartbeat'): 'sent' | 'skipped' => {
      const baseUrl = activeSession?.baseUrl;
      const accessToken = activeSession?.accessToken;
      const userId = activeSession?.userId;
      const canPush =
        typeof baseUrl === 'string' &&
        typeof accessToken === 'string' &&
        typeof userId === 'string' &&
        'serviceWorker' in navigator &&
        !!navigator.serviceWorker.controller;

      if (!canPush) {
        debugLog.warn('network', 'Skipped SW session sync', {
          reason,
          hasBaseUrl: !!baseUrl,
          hasAccessToken: !!accessToken,
          hasUserId: !!userId,
          hasSwController: !!navigator.serviceWorker?.controller,
        });
        return 'skipped';
      }

      pushSessionToSW(baseUrl, accessToken, userId);
      Sentry.metrics.count('sable.sw.session_sync', 1, {
        attributes: {
          reason,
          phase1_foreground_resync: phase1ForegroundResync,
          phase2_visible_heartbeat: phase2VisibleHeartbeat,
          phase3_adaptive_backoff_jitter: phase3AdaptiveBackoffJitter,
        },
      });
      debugLog.info('network', 'Pushed session to SW', {
        reason,
        phase1ForegroundResync,
        phase2VisibleHeartbeat,
        phase3AdaptiveBackoffJitter,
      });
      return 'sent';
    },
    [
      activeSession?.accessToken,
      activeSession?.baseUrl,
      activeSession?.userId,
      phase1ForegroundResync,
      phase2VisibleHeartbeat,
      phase3AdaptiveBackoffJitter,
    ]
  );

  useEffect(() => {
    let hiddenAt: number | undefined =
      document.visibilityState === 'hidden' ? performance.now() : undefined;

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      const now = performance.now();
      const hiddenDurationMs = isVisible && hiddenAt !== undefined ? now - hiddenAt : undefined;
      if (!isVisible) hiddenAt = now;
      if (isVisible) hiddenAt = undefined;

      Sentry.addBreadcrumb({
        category: 'app.visibility',
        message: isVisible ? 'App became visible' : 'App became hidden',
        level: 'info',
        data: {
          visibilityState: document.visibilityState,
          hiddenDurationMs: hiddenDurationMs ? Math.round(hiddenDurationMs) : undefined,
          online: navigator.onLine,
          mobileOrTablet: mobileOrTablet(),
        },
      });
      Sentry.metrics.count('sable.app.visibility_change', 1, {
        attributes: {
          visibility_state: document.visibilityState,
          online: navigator.onLine,
          mobile: mobileOrTablet(),
        },
      });
      if (hiddenDurationMs !== undefined) {
        Sentry.metrics.distribution('sable.app.hidden_duration_ms', hiddenDurationMs, {
          attributes: { online: navigator.onLine, mobile: mobileOrTablet() },
        });
      }

      debugLog.info(
        'general',
        `App visibility changed: ${isVisible ? 'visible (foreground)' : 'hidden (background)'}`,
        {
          visibilityState: document.visibilityState,
          hiddenDurationMs: hiddenDurationMs ? Math.round(hiddenDurationMs) : undefined,
          online: navigator.onLine,
        }
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
    if (!phase1ForegroundResync) return undefined;

    const pushForegroundSession = (reason: 'foreground' | 'focus' | 'pageshow') => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastForegroundPushAtRef.current < foregroundDebounceMs) return;
      lastForegroundPushAtRef.current = now;

      if (
        pushSessionNow(reason) === 'sent' &&
        phase3AdaptiveBackoffJitter &&
        phase2VisibleHeartbeat
      ) {
        suppressHeartbeatUntilRef.current = now + resumeHeartbeatSuppressMs;
      }
    };

    const handleVisibilityChange = () => pushForegroundSession('foreground');
    const handleFocus = () => pushForegroundSession('focus');
    const handlePageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) pushForegroundSession('pageshow');
    };

    if (document.visibilityState === 'visible') {
      pushForegroundSession('foreground');
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [
    foregroundDebounceMs,
    phase1ForegroundResync,
    phase2VisibleHeartbeat,
    phase3AdaptiveBackoffJitter,
    pushSessionNow,
    resumeHeartbeatSuppressMs,
  ]);

  useEffect(() => {
    if (!phase2VisibleHeartbeat) return undefined;

    heartbeatFailuresRef.current = 0;
    suppressHeartbeatUntilRef.current = 0;

    let timeoutId: number | undefined;
    const getDelayMs = (): number => {
      if (!phase3AdaptiveBackoffJitter) return heartbeatIntervalMs;

      const failures = heartbeatFailuresRef.current;
      const backoffFactor = Math.min(2 ** failures, heartbeatMaxBackoffMs / heartbeatIntervalMs);
      const backoffDelay = Math.min(
        heartbeatMaxBackoffMs,
        Math.round(heartbeatIntervalMs * backoffFactor)
      );
      const jitter = 0.8 + Math.random() * 0.4;
      return Math.max(1000, Math.round(backoffDelay * jitter));
    };

    const tick = () => {
      const now = Date.now();

      if (document.visibilityState === 'visible' && navigator.onLine) {
        if (!phase3AdaptiveBackoffJitter || now >= suppressHeartbeatUntilRef.current) {
          const result = pushSessionNow('heartbeat');
          if (phase3AdaptiveBackoffJitter && result === 'sent') {
            heartbeatFailuresRef.current = 0;
          }
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

  useEffect(() => {
    if (!mx) return undefined;

    const doRetry = () => {
      // Wrap retry calls in try-catch to prevent crashes during wake/restore.
      // The matrix client or sliding sync manager might be in an invalid state
      // if the device just woke from sleep or the app was restored from bfcache.
      try {
        Sentry.addBreadcrumb({
          category: 'app.visibility',
          message: 'Sync retry requested after foreground',
          level: 'info',
          data: {
            syncState: mx.getSyncState(),
            clientRunning: mx.clientRunning,
            online: navigator.onLine,
          },
        });
        Sentry.metrics.count('sable.sync.foreground_retry', 1, {
          attributes: {
            sync_state: mx.getSyncState() ?? 'unknown',
            client_running: mx.clientRunning,
            online: navigator.onLine,
          },
        });
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
      Sentry.addBreadcrumb({
        category: 'app.visibility',
        message: 'Foreground handler scheduling sync retry',
        level: 'info',
        data: { syncState: mx.getSyncState(), clientRunning: mx.clientRunning },
      });

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
            Sentry.addBreadcrumb({
              category: 'app.visibility',
              message: 'Foreground fallback sync retry fired',
              level: 'info',
              data: { delayMs: 1500, syncState: mx.getSyncState() },
            });
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
            Sentry.addBreadcrumb({
              category: 'app.visibility',
              message: 'Foreground fallback sync retry fired',
              level: 'info',
              data: { delayMs: 5000, syncState: mx.getSyncState() },
            });
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
        Sentry.addBreadcrumb({
          category: 'app.visibility',
          message: 'Page restored from bfcache',
          level: 'info',
          data: { persisted: ev.persisted, syncState: mx.getSyncState() },
        });
        Sentry.metrics.count('sable.app.pageshow', 1, {
          attributes: { persisted: ev.persisted },
        });
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
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handlePageShow);
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
        appEvents.emitVisibilityChange(true);
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
          appEvents.emitVisibilityChange(true);
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
        appEvents.emitVisibilityChange(true);
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
