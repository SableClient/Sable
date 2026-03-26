import { trimTrailingSlash } from './app/utils/common';
import { createLogger } from './app/utils/debug';
import {
  getFallbackSession,
  MATRIX_SESSIONS_KEY,
  Sessions,
  ACTIVE_SESSION_KEY,
} from './app/state/sessions';
import { getLocalStorageItem } from './app/state/utils/atomWithLocalStorage';
import { hasServiceWorker } from './app/utils/platform';
import { pushSessionToSW } from './sw-session';

const log = createLogger('service-worker-bootstrap');

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

  const showUpdateAvailablePrompt = (registration: ServiceWorkerRegistration) => {
    const DONT_SHOW_PROMPT_KEY = 'cinny_dont_show_sw_update_prompt';
    const userPreference = localStorage.getItem(DONT_SHOW_PROMPT_KEY);

    if (userPreference === 'true') {
      return;
    }

    // eslint-disable-next-line no-alert
    if (window.confirm('A new version of the app is available. Refresh to update?')) {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
      }
      window.location.reload();
    }
  };

  const sendSessionToSW = () => {
    const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
    const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
    const active =
      sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
    pushSessionToSW(active?.baseUrl, active?.accessToken, active?.userId);
  };

  const registrationPromise = navigator.serviceWorker.register(swUrl, swRegisterOptions);

  registrationPromise
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateAvailablePrompt(registration);
            }
          };
        }
      });

      sendSessionToSW();
    })
    .catch((err) => {
      log.warn('SW registration failed:', err);
    });

  navigator.serviceWorker.ready.then(sendSessionToSW).catch((err) => {
    log.warn('SW ready failed:', err);
  });

  navigator.serviceWorker.addEventListener('message', (ev) => {
    const { data } = ev;
    if (!data || typeof data !== 'object') return;
    const { type } = data as { type?: unknown };

    if (type === 'requestSession') {
      sendSessionToSW();
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
