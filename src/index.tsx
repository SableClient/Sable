import './instrument';
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
import type { Sessions } from './app/state/sessions';
import { getFallbackSession, MATRIX_SESSIONS_KEY, ACTIVE_SESSION_KEY } from './app/state/sessions';
import { createLogger } from './app/utils/debug';
import { getLocalStorageItem } from './app/state/utils/atomWithLocalStorage';
import { installConsolePasteScamWarning } from './app/utils/consolePasteScamWarning';

// SABLE-5A: Track app start time for reload throttling
if (!sessionStorage.getItem('sable:app_start_time')) {
  sessionStorage.setItem('sable:app_start_time', String(Date.now()));
}

enableMapSet();
installConsolePasteScamWarning();
const log = createLogger('index');

document.body.classList.add(configClass, varsClass);

// Lazy SW re-claim — avoids iOS bfcache eviction.
//
// clients.claim() is NOT called unconditionally in the SW's activate handler
// because doing so fires controllerchange on every open client including
// bfcached ones, which evicts them from bfcache and causes a hard reload.
//
// Instead, the page requests a claim whenever it comes to the foreground and
// detects that the active SW is not yet its controller (e.g. after iOS killed
// and restarted the SW while the page was backgrounded).  Safe to call
// speculatively: if the SW is already the controller, clients.claim() is a
// no-op and controllerchange does not re-fire.
const requestSWClaim = () => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      if (reg.active && reg.active !== navigator.serviceWorker.controller) {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        reg.active.postMessage({ type: 'CLAIM_CLIENTS' });
      }
    })
    .catch(() => undefined);
};

// Bfcache restore: page snaps back instantly; check whether the SW was
// restarted while the page was away.
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) requestSWClaim();
});

// Visibility-change foreground: covers the case where iOS kills the SW
// while the screen is on (memory pressure) and the user touches the app.
// Also check for service worker updates when returning to the app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestSWClaim();
    // Check for SW updates when user returns to the app (e.g., after deploy)
    navigator.serviceWorker.getRegistration().then((registration) => {
      registration?.update().catch((err) => {
        // Update checks can fail during deployment or due to network issues.
        // Log but don't throw — the periodic check will retry later.
        log.warn('SW update check failed (visibilitychange):', err);
      });
    });
  }
});

if ('serviceWorker' in navigator) {
  const isProduction = import.meta.env.MODE === 'production';
  const swUrl = isProduction
    ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
    : `/dev-sw.js?dev-sw`;

  const swRegisterOptions: RegistrationOptions = {};
  if (!isProduction) {
    swRegisterOptions.type = 'module';
  }

  const sendSessionToSW = () => {
    // Use the active session from the new multi-session store, fall back to legacy
    const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
    const activeId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
    const active =
      sessions.find((s) => s.userId === activeId) ?? sessions[0] ?? getFallbackSession();
    pushSessionToSW(active?.baseUrl, active?.accessToken, active?.userId);
  };

  // Emergency: unregister stale service worker if sw.js is 404ing (SABLE-2B).
  // This self-heals for existing users who already have the broken SW registered,
  // without waiting for a full cache clear.
  (async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const checks = registrations
        .filter(
          (reg) =>
            reg.active?.scriptURL.endsWith('/sw.js') || reg.active?.scriptURL.endsWith('/dev-sw.js')
        )
        .map(async (reg) => {
          try {
            // Check if sw.js is actually available
            const check = await fetch(swUrl, { method: 'HEAD', cache: 'no-cache' }).catch(
              () => null
            );
            if (!check || !check.ok) {
              await reg.unregister();
              return {
                success: true,
                message: 'Stale service worker unregistered (sw.js not found)',
              };
            }
            return { success: true, message: 'SW script OK' };
          } catch (err) {
            return { success: false, error: err };
          }
        });

      const results = await Promise.allSettled(checks);
      results.forEach((result) => {
        if (
          result.status === 'fulfilled' &&
          result.value.message &&
          result.value.message.includes('unregistered')
        ) {
          log.log(result.value.message);
        }
      });
    } catch (err) {
      // Non-fatal — continue app init regardless
      log.warn('SW emergency unregister check failed:', err);
    }
  })();

  navigator.serviceWorker
    .register(swUrl, swRegisterOptions)
    .then((registration) => {
      // Check if there's already an update waiting (happens on mobile when SW was
      // updated while the app was closed, or when updatefound fired before we
      // added the listener). This is critical for iOS PWA where the app might
      // launch with a stale index.html and the SW update has already completed.
      if (registration.waiting && navigator.serviceWorker.controller) {
        log.log('SW update already waiting at registration time');
        window.dispatchEvent(new CustomEvent('sable:sw-update'));
      }

      // Listen for future updates (when the server deploys a new sw.js while
      // the app is running).
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // Notify the app rather than silently reloading — the user
                // should see a banner and choose when to refresh, especially
                // on mobile where an unexpected reload is very disorienting.
                log.log('SW update detected via statechange');
                window.dispatchEvent(new CustomEvent('sable:sw-update'));
              }
            }
          });
        }
      });
      sendSessionToSW();

      // Periodically check for updates while the app is running.
      // Browsers only check automatically ~every 24h, so we check every 5 minutes
      // to detect deployments faster without requiring a restart.
      setInterval(
        () => {
          registration.update().catch((err) => {
            // Update checks can fail during deployment (404 while new SW is being uploaded)
            // or due to network issues. Log but don't throw — the next check will retry.
            log.warn('SW update check failed:', err);
          });
        },
        5 * 60 * 1000
      );
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

const injectIOSMetaTags = () => {
  const metaTags = [
    { name: 'theme-color', content: '#0C0B0F' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    {
      name: 'apple-mobile-web-app-status-bar-style',
      content: 'black-translucent',
    },
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
  // Check if this is a chunk loading error.
  // Include 'Failed to fetch' only if it's from a script/style resource (not media/API).
  const isChunkLoadError =
    event.message?.includes('dynamically imported module') ||
    event.error?.name === 'ChunkLoadError' ||
    (event.message?.includes('Failed to fetch') &&
      (event.filename?.endsWith('.js') ||
        event.filename?.endsWith('.css') ||
        event.filename?.includes('/assets/')));

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
