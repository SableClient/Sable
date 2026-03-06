import { type Root } from 'react-dom/client';
import { enableMapSet } from 'immer';
import { isTauri } from '@tauri-apps/api/core';
import '@fontsource-variable/nunito';
import '@fontsource-variable/nunito/wght-italic.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/space-mono/400-italic.css';
import '@fontsource/space-mono/700-italic.css';
import App from '$pages/App';
import { trimTrailingSlash } from '$utils/common';
import './app/i18n';

import '$styles/overrides/General.css';
import '$styles/overrides/Privacy.css';
import '$styles/overrides/TauriDesktop.css';
import {
  getFallbackSession,
  MATRIX_SESSIONS_KEY,
  Sessions,
  ACTIVE_SESSION_KEY,
} from '$state/sessions';
import { createLogger } from '$utils/debug';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { pushSessionToSW } from './sw-session';

enableMapSet();
const log = createLogger('main');

const sendSessionToSW = () => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
  const active = sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
  pushSessionToSW(active?.baseUrl, active?.accessToken);
};

const showUpdateAvailablePrompt = (registration: ServiceWorkerRegistration) => {
  const DONT_SHOW_PROMPT_KEY = 'cinny_dont_show_sw_update_prompt';
  if (localStorage.getItem(DONT_SHOW_PROMPT_KEY) === 'true') return;

  // TODO: Replace with a custom in-app prompt to avoid the jarring native confirm dialog.
  // eslint-disable-next-line no-alert
  if (window.confirm('A new version of the app is available. Refresh to update?')) {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
    } else {
      window.location.reload();
    }
  }
};

const initServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;

  const isProduction = import.meta.env.MODE === 'production';
  const swUrl = isProduction
    ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
    : `/dev-sw.js?dev-sw`;

  const swRegisterOptions: RegistrationOptions = {};
  if (!isProduction) swRegisterOptions.type = 'module';

  navigator.serviceWorker
    .register(swUrl, swRegisterOptions)
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed') {
              if (!isTauri() && navigator.serviceWorker.controller) {
                showUpdateAvailablePrompt(registration);
              }
            }
          };
        }
      });
      sendSessionToSW();
    })
    .catch((err) => log.warn('SW registration failed:', err));

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
      ev.source?.postMessage({ replyTo: data.id, payload: token });
    }
  });
};

const injectIOSMetaTags = () => {
  const metaTags = [
    { name: 'theme-color', content: '#0C0B0F' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  ];
  metaTags.forEach((tag) => {
    let element = document.querySelector(`meta[name="${tag.name}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute('name', tag.name);
      document.head.appendChild(element);
    }
    element.setAttribute('content', tag.content);
  });
};

export const mountApp = (root: Root) => {
  initServiceWorker();
  injectIOSMetaTags();
  root.render(<App />);
};
