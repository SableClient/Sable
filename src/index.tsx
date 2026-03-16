import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource-variable/nunito';
import '@fontsource-variable/nunito/wght-italic.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/space-mono/400-italic.css';
import '@fontsource/space-mono/700-italic.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';
import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';
import './app/i18n';

import './index.css';
import './app/styles/themes.css';
import './app/styles/overrides/General.css';
import './app/styles/overrides/Privacy.css';
import { pushSessionToSW } from './sw-session';
import {
  getFallbackSession,
  MATRIX_SESSIONS_KEY,
  Sessions,
  ACTIVE_SESSION_KEY,
} from './app/state/sessions';
import { createLogger } from './app/utils/debug';
import { getLocalStorageItem } from './app/state/utils/atomWithLocalStorage';

enableMapSet();
const log = createLogger('index');

document.body.classList.add(configClass, varsClass);

if ('serviceWorker' in navigator) {
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

    if (window.confirm('A new version of the app is available. Refresh to update?')) {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
      } else {
        window.location.reload();
      }
    }
  };

  navigator.serviceWorker.register(swUrl, swRegisterOptions).then((registration) => {
    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (installingWorker) {
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              showUpdateAvailablePrompt(registration);
            }
          }
        };
      }
    });
  });

  const sendSessionToSW = () => {
    // Use the active session from the new multi-session store, fall back to legacy
    const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
    const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
    const active =
      sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
    pushSessionToSW(active?.baseUrl, active?.accessToken, active?.userId);
  };

  navigator.serviceWorker
    .register(swUrl)
    .then(sendSessionToSW)
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

injectIOSMetaTags();

// Handle chunk loading failures with automatic retry
const CHUNK_RETRY_KEY = 'cinny_chunk_retry_count';
const MAX_CHUNK_RETRIES = 2;

window.addEventListener('error', (event) => {
  // Check if this is a chunk loading error
  const isChunkLoadError =
    event.message?.includes('dynamically imported module') ||
    event.message?.includes('Failed to fetch') ||
    event.error?.name === 'ChunkLoadError';

  if (isChunkLoadError) {
    const retryCount = parseInt(sessionStorage.getItem(CHUNK_RETRY_KEY) ?? '0', 10);

    if (retryCount < MAX_CHUNK_RETRIES) {
      // Increment retry count and reload
      sessionStorage.setItem(CHUNK_RETRY_KEY, String(retryCount + 1));
      log.warn(`Chunk load failed, reloading (attempt ${retryCount + 1}/${MAX_CHUNK_RETRIES})`);
      window.location.reload();

      // Prevent default error handling since we're reloading
      event.preventDefault();
    } else {
      // Max retries exceeded, clear counter and let error bubble up
      sessionStorage.removeItem(CHUNK_RETRY_KEY);
      log.error('Chunk load failed after max retries, showing error');
    }
  }
});

// Clear chunk retry counter on successful page load
window.addEventListener('load', () => {
  sessionStorage.removeItem(CHUNK_RETRY_KEY);
});

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    throw new Error('Root container element not found!');
  }

  const root = createRoot(rootContainer);
  root.render(<App />);
};

mountApp();
