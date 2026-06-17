import { useCallback, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import type { Session } from '$state/sessions';
import { appEvents } from '../utils/appEvents';
import { useClientConfig, useExperimentVariant } from './useClientConfig';
import { createDebugLogger } from '../utils/debugLogger';
import { mobileOrTablet } from '$utils/user-agent';
import { pushSessionToSW } from '../../sw-session';

const debugLog = createDebugLogger('AppVisibility');

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

type SessionSyncReason = 'heartbeat';
type ServiceWorkerClaimReason = 'pageshow_restore' | 'visible_foreground';

const requestServiceWorkerClaim = (reason: ServiceWorkerClaimReason) => {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return;

  Sentry.addBreadcrumb({
    category: 'service_worker.claim',
    message: 'Requested service worker client claim',
    level: 'warning',
    data: {
      reason,
      visibilityState: document.visibilityState,
      online: navigator.onLine,
    },
  });
  Sentry.metrics.count('sable.sw.claim_requested', 1, {
    attributes: {
      reason,
      visibility_state: document.visibilityState,
      online: navigator.onLine,
    },
  });

  navigator.serviceWorker.ready
    .then((registration) => {
      const activeWorker = registration.active;
      if (!activeWorker) return;
      if (activeWorker.state !== 'activated') return;
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      activeWorker.postMessage({ type: 'CLAIM_CLIENTS' });
    })
    .catch((error) => {
      Sentry.addBreadcrumb({
        category: 'service_worker.claim',
        message: 'Service worker claim request failed',
        level: 'warning',
        data: { reason, error: error instanceof Error ? error.message : String(error) },
      });
    });
};

export function useAppVisibility(activeSession?: Session) {
  const clientConfig = useClientConfig();
  const sessionSyncConfig = clientConfig.sessionSync;
  const sessionSyncVariant = useExperimentVariant('sessionSyncStrategy', activeSession?.userId);
  const hasDirectSessionSyncConfig = sessionSyncConfig !== undefined;

  const phase2VisibleHeartbeat = sessionSyncVariant.inExperiment
    ? sessionSyncVariant.variant === 'session-sync-heartbeat' ||
      sessionSyncVariant.variant === 'session-sync-adaptive'
    : hasDirectSessionSyncConfig
      ? sessionSyncConfig?.phase2VisibleHeartbeat === true
      : true;
  const phase3AdaptiveBackoffJitter = sessionSyncVariant.inExperiment
    ? sessionSyncVariant.variant === 'session-sync-adaptive'
    : sessionSyncConfig?.phase3AdaptiveBackoffJitter === true;

  const heartbeatIntervalMs = Math.max(
    1000,
    sessionSyncConfig?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  );

  const pushSessionNow = useCallback(
    (reason: SessionSyncReason): 'sent' | 'skipped' => {
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
          phase2_visible_heartbeat: phase2VisibleHeartbeat,
          phase3_adaptive_backoff_jitter: phase3AdaptiveBackoffJitter,
        },
      });
      debugLog.info('network', 'Pushed session to SW', {
        reason,
        phase2VisibleHeartbeat,
        phase3AdaptiveBackoffJitter,
      });
      return 'sent';
    },
    [
      activeSession?.accessToken,
      activeSession?.baseUrl,
      activeSession?.userId,
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
      if (isVisible) {
        if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
          Sentry.addBreadcrumb({
            category: 'service_worker.claim',
            message: 'Foreground resume without service worker controller',
            level: 'warning',
            data: {
              reason: 'visible_foreground',
              visibilityState: document.visibilityState,
              online: navigator.onLine,
            },
          });
          requestServiceWorkerClaim('visible_foreground');
        }
      }
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
    const emitVisible = () => {
      if (document.visibilityState === 'visible') {
        appEvents.emitVisibilityChange(true);
      }
    };

    const handlePageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        Sentry.addBreadcrumb({
          category: 'app.visibility',
          message: 'App restored from pageshow',
          level: 'info',
          data: {
            persisted: ev.persisted,
            visibilityState: document.visibilityState,
            online: navigator.onLine,
          },
        });
        Sentry.metrics.count('sable.app.pageshow', 1, {
          attributes: {
            persisted: ev.persisted,
            visibility_state: document.visibilityState,
            online: navigator.onLine,
          },
        });
        requestServiceWorkerClaim('pageshow_restore');
        emitVisible();
      }
    };

    const timeoutId = window.setTimeout(emitVisible, 100);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (!phase2VisibleHeartbeat) return undefined;

    let timeoutId: number | undefined;
    const getDelayMs = (): number => {
      if (!phase3AdaptiveBackoffJitter) return heartbeatIntervalMs;

      const jitter = 0.8 + Math.random() * 0.4;
      return Math.max(1000, Math.round(heartbeatIntervalMs * jitter));
    };

    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        pushSessionNow('heartbeat');
      }

      timeoutId = window.setTimeout(tick, getDelayMs());
    };

    timeoutId = window.setTimeout(tick, getDelayMs());
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [heartbeatIntervalMs, phase2VisibleHeartbeat, phase3AdaptiveBackoffJitter, pushSessionNow]);
}
