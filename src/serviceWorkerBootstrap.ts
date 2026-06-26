import { trimTrailingSlash } from './app/utils/common';
import { createLogger } from './app/utils/debug';
import * as Sentry from '@sentry/react';
import type { Sessions } from './app/state/sessions';
import { getFallbackSession, MATRIX_SESSIONS_KEY, ACTIVE_SESSION_KEY } from './app/state/sessions';
import { getLocalStorageItem } from './app/state/utils/atomWithLocalStorage';
import { hasServiceWorker } from './app/utils/platform';
import { reloadWithTelemetry } from './app/utils/reloadWithTelemetry';
import { pushSessionToSW } from './sw-session';
import { consumeLaunchContext } from './launch-context-persistence';
import { appEvents } from './app/utils/appEvents';

const log = createLogger('service-worker-bootstrap');
const SW_WATCHDOG_INTERVAL_MS = 60_000;
const SW_WATCHDOG_PING_TIMEOUT_MS = 5_000;
const SW_WATCHDOG_MAX_MISSES = 2;
let unsubscribeForegroundRecoveryListener: (() => void) | undefined;
type SwRecoveryReason =
  | 'missing_worker'
  | 'awaiting_compatible_pong'
  | 'watchdog_ping_timeout'
  | 'watchdog_timer'
  | 'foreground_focus'
  | 'visibilitychange_visible'
  | 'pageshow';

const recordWatchdogRecoveryAttempt = (
  reason: SwRecoveryReason,
  data?: Record<string, unknown>
) => {
  Sentry.addBreadcrumb({
    category: 'service_worker',
    message: 'Service worker recovery requested',
    level: 'warning',
    data: {
      reason,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      ...data,
    },
  });
  Sentry.metrics.count('sable.sw.watchdog_recovery', 1, {
    attributes: { reason },
  });
};

function maybeRecoverNotificationLaunch(targetUrl: string | undefined, clickedAt: number): boolean {
  if (!targetUrl) return false;

  const launchAgeMs = Date.now() - clickedAt;
  if (launchAgeMs > 15_000) return false;

  try {
    const target = new URL(targetUrl, window.location.origin);
    const current = new URL(window.location.href);
    if (target.origin !== current.origin || target.href === current.href) return false;

    window.location.replace(`${target.pathname}${target.search}${target.hash}`);
    return true;
  } catch {
    return false;
  }
}

function sendActiveSessionToServiceWorker() {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
  const active = sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
  pushSessionToSW(active?.baseUrl, active?.accessToken, active?.userId);
}

function createSwWatchdog() {
  let watchdogTimer = 0;
  let consecutiveMisses = 0;
  let compatibleWorkerScriptUrl: string | undefined;
  let pendingPingPromise: Promise<void> | null = null;
  const pendingPings = new Map<
    string,
    {
      resolve: () => void;
      reject: (reason?: unknown) => void;
      timeoutId: number;
    }
  >();

  const clearPendingPing = (requestId: string, reason?: unknown) => {
    const pending = pendingPings.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingPings.delete(requestId);
    if (reason !== undefined) {
      pending.reject(reason);
    }
  };

  const handleMessage = (ev: MessageEvent) => {
    const { data } = ev;
    if (!data || typeof data !== 'object') return;
    if ((data as { type?: unknown }).type !== 'pong') return;
    const requestId = (data as { requestId?: unknown }).requestId;
    if (typeof requestId !== 'string') return;

    const pending = pendingPings.get(requestId);
    if (!pending) return;
    clearPendingPing(requestId);
    consecutiveMisses = 0;
    const sourceWorker = ev.source instanceof ServiceWorker ? ev.source : undefined;
    compatibleWorkerScriptUrl = sourceWorker?.scriptURL ?? compatibleWorkerScriptUrl;
    pending.resolve();
  };

  const requestRecovery = async (reason: SwRecoveryReason, data?: Record<string, unknown>) => {
    recordWatchdogRecoveryAttempt(reason, data);
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    registration?.active?.postMessage({ type: 'CLAIM_CLIENTS' });
    try {
      await registration?.update();
    } catch (err) {
      Sentry.captureException(err);
    }
    sendActiveSessionToServiceWorker();
  };

  const pingServiceWorker = async (
    reason: Extract<
      SwRecoveryReason,
      'watchdog_timer' | 'foreground_focus' | 'visibilitychange_visible' | 'pageshow'
    > = 'visibilitychange_visible'
  ) => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (pendingPingPromise) {
      await pendingPingPromise;
      return;
    }

    const currentPingPromise = (async () => {
      const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
      const activeWorker = registration?.active;
      const controller = navigator.serviceWorker.controller;
      const worker = controller ?? activeWorker;
      const workerScriptUrl = worker?.scriptURL;
      const watchdogHandshakeComplete =
        typeof workerScriptUrl === 'string' && workerScriptUrl === compatibleWorkerScriptUrl;
      if (!worker) {
        await requestRecovery('missing_worker', {
          trigger: reason,
          hasController: !!controller,
          hasActiveWorker: !!activeWorker,
        });
        return;
      }

      const requestId = `sw-ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const pingPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          pendingPings.delete(requestId);
          reject(new Error('timeout'));
        }, SW_WATCHDOG_PING_TIMEOUT_MS);
        pendingPings.set(requestId, { resolve, reject, timeoutId });
      });

      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage({ type: 'ping', requestId });

      try {
        await pingPromise;
      } catch (err) {
        if (err instanceof Error && err.message === 'watchdog stopped') {
          return;
        }

        if (!watchdogHandshakeComplete) {
          Sentry.addBreadcrumb({
            category: 'service_worker',
            message: 'Service worker watchdog waiting for first compatible pong',
            level: 'info',
            data: {
              controllerScriptUrl: controller?.scriptURL,
              activeScriptUrl: activeWorker?.scriptURL,
              usingController: worker === controller,
            },
          });
          await requestRecovery('awaiting_compatible_pong', {
            trigger: reason,
            controllerScriptUrl: controller?.scriptURL,
            activeScriptUrl: activeWorker?.scriptURL,
            usingController: worker === controller,
          });
          return;
        }

        consecutiveMisses += 1;
        Sentry.addBreadcrumb({
          category: 'service_worker',
          message: 'Service worker watchdog ping missed',
          level: 'warning',
          data: { consecutiveMisses },
        });
        await requestRecovery('watchdog_ping_timeout', {
          trigger: reason,
          consecutiveMisses,
        });
        if (consecutiveMisses >= SW_WATCHDOG_MAX_MISSES) {
          reloadWithTelemetry('sw_watchdog_unresponsive', { consecutiveMisses });
        }
      }
    })();
    pendingPingPromise = currentPingPromise;
    try {
      await currentPingPromise;
    } finally {
      if (pendingPingPromise === currentPingPromise) {
        pendingPingPromise = null;
      }
    }
  };

  const restart = () => {
    window.clearInterval(watchdogTimer);
    watchdogTimer = window.setInterval(() => {
      void pingServiceWorker('watchdog_timer');
    }, SW_WATCHDOG_INTERVAL_MS);
  };

  const stop = () => {
    window.clearInterval(watchdogTimer);
    consecutiveMisses = 0;
    pendingPings.forEach((_pending, requestId) => {
      clearPendingPing(requestId, new Error('watchdog stopped'));
    });
    pendingPings.clear();
    pendingPingPromise = null;
  };

  return { restart, stop, handleMessage, pingServiceWorker };
}

type SwRecoveryPingReason = Extract<
  SwRecoveryReason,
  'watchdog_timer' | 'foreground_focus' | 'visibilitychange_visible' | 'pageshow'
>;

function mapForegroundRecoveryTriggerToWatchdogReason(
  trigger: Parameters<typeof appEvents.emitForegroundRecoveryRequested>[0]
): SwRecoveryPingReason {
  switch (trigger) {
    case 'focus':
      return 'foreground_focus';
    case 'pageshow_persisted':
      return 'pageshow';
    case 'visibilitychange':
    case 'pointerdown':
    case 'keydown':
      return 'visibilitychange_visible';
    default:
      throw new Error(`Unsupported foreground recovery trigger: ${String(trigger)}`);
  }
}

export function registerAppServiceWorker() {
  if (!hasServiceWorker()) return;
  const swWatchdog = createSwWatchdog();

  const isProduction = import.meta.env.MODE === 'production';
  const swUrl = isProduction
    ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
    : `/dev-sw.js?dev-sw`;

  const swRegisterOptions: RegistrationOptions = {
    updateViaCache: 'none',
    ...(isProduction
      ? {}
      : {
          type: 'module',
        }),
  };

  sendActiveSessionToServiceWorker();

  void consumeLaunchContext()
    .then((launchContext) => {
      if (!launchContext) return;
      const launchAgeMs = Date.now() - launchContext.clickedAt;
      Sentry.addBreadcrumb({
        category: 'app.launch',
        message: 'Consumed persisted launch context',
        level: 'info',
        data: {
          source: launchContext.source,
          launchAgeMs,
          hasUserId: !!launchContext.userId,
          hasRoomId: !!launchContext.roomId,
          hasEventId: !!launchContext.eventId,
        },
      });
      Sentry.metrics.count('sable.app.launch_context', 1, {
        attributes: {
          source: launchContext.source,
          has_user_id: !!launchContext.userId,
          has_room_id: !!launchContext.roomId,
          has_event_id: !!launchContext.eventId,
        },
      });
      Sentry.metrics.distribution('sable.app.launch_context_age_ms', launchAgeMs, {
        attributes: { source: launchContext.source },
      });
      if (maybeRecoverNotificationLaunch(launchContext.targetUrl, launchContext.clickedAt)) {
        Sentry.addBreadcrumb({
          category: 'app.launch',
          message: 'Recovered notification launch target during bootstrap',
          level: 'warning',
          data: { launchAgeMs },
        });
      }
    })
    .catch((err) => {
      Sentry.addBreadcrumb({
        category: 'app.launch',
        message: 'Failed to consume persisted launch context',
        level: 'warning',
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    });

  Sentry.addBreadcrumb({
    category: 'service_worker',
    message: 'Registering app service worker',
    level: 'info',
    data: {
      mode: import.meta.env.MODE,
      swUrl,
      hasController: !!navigator.serviceWorker.controller,
    },
  });

  const registrationPromise = navigator.serviceWorker.register(swUrl, swRegisterOptions);

  registrationPromise
    .then((registration) => {
      Sentry.addBreadcrumb({
        category: 'service_worker',
        message: 'Service worker registration resolved',
        level: 'info',
        data: {
          active: !!registration.active,
          waiting: !!registration.waiting,
          installing: !!registration.installing,
        },
      });
      registration.addEventListener('updatefound', () => {
        Sentry.addBreadcrumb({
          category: 'service_worker',
          message: 'Service worker update found',
          level: 'info',
        });
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            Sentry.addBreadcrumb({
              category: 'service_worker',
              message: 'Service worker install state changed',
              level: installingWorker.state === 'redundant' ? 'warning' : 'info',
              data: {
                state: installingWorker.state,
                hasController: !!navigator.serviceWorker.controller,
              },
            });
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event('sable:sw-update'));
            }
          });
        }
      });

      sendActiveSessionToServiceWorker();
    })
    .catch((err) => {
      Sentry.addBreadcrumb({
        category: 'service_worker',
        message: 'Service worker registration failed',
        level: 'error',
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      log.warn('SW registration failed:', err);
    });

  navigator.serviceWorker.ready
    .then((registration) => {
      Sentry.addBreadcrumb({
        category: 'service_worker',
        message: 'Service worker ready',
        level: 'info',
        data: { active: !!registration.active, waiting: !!registration.waiting },
      });
      sendActiveSessionToServiceWorker();
    })
    .catch((err) => {
      Sentry.addBreadcrumb({
        category: 'service_worker',
        message: 'Service worker ready failed',
        level: 'error',
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      log.warn('SW ready failed:', err);
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    Sentry.addBreadcrumb({
      category: 'service_worker',
      message: 'Service worker controller changed',
      level: 'warning',
      data: {
        visibilityState: document.visibilityState,
        online: navigator.onLine,
        hasController: !!navigator.serviceWorker.controller,
      },
    });
    Sentry.metrics.count('sable.sw.controller_change', 1, {
      attributes: {
        visibility_state: document.visibilityState,
        online: navigator.onLine,
        has_controller: !!navigator.serviceWorker.controller,
      },
    });
  });

  navigator.serviceWorker.addEventListener('message', (ev) => {
    swWatchdog.handleMessage(ev);
    const { data } = ev;
    if (!data || typeof data !== 'object') return;
    const { type } = data as { type?: unknown };

    if (type === 'sentryBreadcrumb') {
      const breadcrumb = data as {
        category?: string;
        message?: string;
        level?: Sentry.SeverityLevel;
        data?: Record<string, unknown>;
      };
      Sentry.addBreadcrumb({
        category: breadcrumb.category ?? 'service_worker',
        message: breadcrumb.message ?? 'Service worker event',
        level: breadcrumb.level ?? 'info',
        data: breadcrumb.data,
      });
      return;
    }

    if (type === 'requestSession') {
      sendActiveSessionToServiceWorker();
    }

    if (data.type === 'token' && data.id) {
      const token = localStorage.getItem('cinny_access_token') ?? undefined;
      ev.source?.postMessage({
        replyTo: data.id,
        payload: token,
      });
    } else if (data.type === 'openRoom' && data.id) {
      /* Example:
      event.source.postMessage({
        replyTo: event.data.id,
        payload: success?,
      });
      */
    }
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      swWatchdog.restart();
      void swWatchdog.pingServiceWorker('visibilitychange_visible');
      return;
    }

    swWatchdog.stop();
  };
  const handleWindowFocus = () => {
    if (document.visibilityState !== 'visible') return;
    swWatchdog.restart();
    void swWatchdog.pingServiceWorker('foreground_focus');
  };
  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    if (document.visibilityState !== 'visible') return;
    swWatchdog.restart();
    void swWatchdog.pingServiceWorker('pageshow');
  };
  unsubscribeForegroundRecoveryListener?.();
  unsubscribeForegroundRecoveryListener = appEvents.onForegroundRecoveryRequested((trigger) => {
    if (document.visibilityState !== 'visible') return;
    swWatchdog.restart();
    void swWatchdog.pingServiceWorker(mapForegroundRecoveryTriggerToWatchdogReason(trigger));
  });

  handleVisibilityChange();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener(
    'beforeunload',
    () => {
      unsubscribeForegroundRecoveryListener?.();
      unsubscribeForegroundRecoveryListener = undefined;
    },
    { once: true }
  );
}
