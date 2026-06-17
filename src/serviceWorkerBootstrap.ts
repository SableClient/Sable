import { trimTrailingSlash } from './app/utils/common';
import { createLogger } from './app/utils/debug';
import * as Sentry from '@sentry/react';
import type { Sessions } from './app/state/sessions';
import { getFallbackSession, MATRIX_SESSIONS_KEY, ACTIVE_SESSION_KEY } from './app/state/sessions';
import { getLocalStorageItem } from './app/state/utils/atomWithLocalStorage';
import { hasServiceWorker } from './app/utils/platform';
import { pushSessionToSW } from './sw-session';
import { consumeLaunchContext } from './launch-context-persistence';

const log = createLogger('service-worker-bootstrap');
const DONT_SHOW_PROMPT_KEY = 'cinny_dont_show_sw_update_prompt';

const recordForcedReload = (reason: string, data?: Record<string, unknown>) => {
  Sentry.addBreadcrumb({
    category: 'app.reload',
    message: 'Forced reload requested',
    level: 'warning',
    data: {
      reason,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      ...data,
    },
  });
  Sentry.metrics.count('sable.app.reload_requested', 1, {
    attributes: { reason },
  });
};

const showUpdateAvailablePrompt = (registration: ServiceWorkerRegistration) => {
  const userPreference = localStorage.getItem(DONT_SHOW_PROMPT_KEY);

  if (userPreference === 'true') {
    return;
  }

  // eslint-disable-next-line no-alert
  if (window.confirm('A new version of the app is available. Refresh to update?')) {
    if (registration.waiting) {
      recordForcedReload('sw_update_prompt_waiting', { hasWaitingWorker: true });
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
    } else {
      recordForcedReload('sw_update_prompt_reload', { hasWaitingWorker: false });
    }
    window.location.reload();
  }
};

function sendActiveSessionToServiceWorker() {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
  const active = sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
  pushSessionToSW(active?.baseUrl, active?.accessToken, active?.userId);
}

export function registerAppServiceWorker() {
  if (!hasServiceWorker()) return;

  const isProduction = import.meta.env.MODE === 'production';
  const swUrl = isProduction
    ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
    : `/dev-sw.js?dev-sw`;

  const swRegisterOptions: RegistrationOptions = {};
  if (!isProduction) {
    swRegisterOptions.type = 'module';
  }

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
              showUpdateAvailablePrompt(registration);
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
}
