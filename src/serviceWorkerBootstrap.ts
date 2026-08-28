import { trimTrailingSlash } from './app/utils/common';
import { createLogger } from './app/utils/debug';
import type { Sessions } from './app/state/sessions';
import { getFallbackSession, MATRIX_SESSIONS_KEY, ACTIVE_SESSION_KEY } from './app/state/sessions';
import { getLocalStorageItem } from './app/state/utils/atomWithLocalStorage';
import { hasServiceWorker } from './app/utils/platform';
import { pushSessionToSW } from './sw-session';
import { waitForSessionTokenRefresh } from './client/oidcTokenRefresher';

const log = createLogger('service-worker-bootstrap');
const REFRESH_WAIT_TIMEOUT_MS = 2500;

const waitForRefreshWithTimeout = async (userId: string): Promise<void> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, REFRESH_WAIT_TIMEOUT_MS);
  });
  await Promise.race([waitForSessionTokenRefresh(userId), timeout]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
};

const getActiveSession = () => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
  return sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
};

const showUpdateAvailablePrompt = (registration: ServiceWorkerRegistration) => {
  const DONT_SHOW_PROMPT_KEY = 'cinny_dont_show_sw_update_prompt';
  const userPreference = localStorage.getItem(DONT_SHOW_PROMPT_KEY);

  if (userPreference === 'true') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ registration: ServiceWorkerRegistration }>('sable-sw-update-available', {
      detail: { registration },
    })
  );
};

const sendSessionToSW = async () => {
  const active = getActiveSession();
  if (active) await waitForRefreshWithTimeout(active.userId);
  const current = getActiveSession();
  await pushSessionToSW(current?.baseUrl, current?.accessToken, current?.userId);
};

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

  sendSessionToSW();

  const registrationPromise = navigator.serviceWorker.register(swUrl, swRegisterOptions);

  registrationPromise
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateAvailablePrompt(registration);
            }
          });
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
      void sendSessionToSW();
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
