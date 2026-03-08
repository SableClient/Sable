/// <reference lib="WebWorker" />
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

import { createPushNotifications } from './sw/pushNotification';

export type {};
declare const self: ServiceWorkerGlobalScope;

let notificationSoundEnabled = true;
// Tracks whether a page client has reported itself as visible.
// The clients.matchAll() visibilityState is unreliable on iOS Safari PWA,
// so we use this explicit flag as a fallback.
let appIsVisible = false;
let showMessageContent = false;
let showEncryptedMessageContent = false;
let clearNotificationsOnRead = false;
const { handlePushNotificationPushData } = createPushNotifications(self, () => ({
  showMessageContent,
  showEncryptedMessageContent,
}));

/** Cache key used to persist notification settings across SW restarts (iOS kills the SW frequently). */
const SW_SETTINGS_CACHE = 'sable-sw-settings-v1';
const SW_SETTINGS_URL = '/sw-settings-meta';

async function persistSettings() {
  try {
    const cache = await self.caches.open(SW_SETTINGS_CACHE);
    await cache.put(
      SW_SETTINGS_URL,
      new Response(
        JSON.stringify({
          notificationSoundEnabled,
          showMessageContent,
          showEncryptedMessageContent,
          clearNotificationsOnRead,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );
  } catch {
    // Ignore — caches may be unavailable in some environments.
  }
}

async function loadPersistedSettings() {
  try {
    const cache = await self.caches.open(SW_SETTINGS_CACHE);
    const response = await cache.match(SW_SETTINGS_URL);
    if (!response) return;
    const s = await response.json();
    if (typeof s.notificationSoundEnabled === 'boolean')
      notificationSoundEnabled = s.notificationSoundEnabled;
    if (typeof s.showMessageContent === 'boolean') showMessageContent = s.showMessageContent;
    if (typeof s.showEncryptedMessageContent === 'boolean')
      showEncryptedMessageContent = s.showEncryptedMessageContent;
    if (typeof s.clearNotificationsOnRead === 'boolean')
      clearNotificationsOnRead = s.clearNotificationsOnRead;
  } catch {
    // Ignore — stale or missing cache is fine; we fall back to defaults.
  }
}

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
};

/**
 * Store session per client (tab)
 */
const sessions = new Map<string, SessionInfo>();

const clientToResolve = new Map<string, (value: SessionInfo | undefined) => void>();
const clientToSessionPromise = new Map<string, Promise<SessionInfo | undefined>>();

async function cleanupDeadClients() {
  const activeClients = await self.clients.matchAll();
  const activeIds = new Set(activeClients.map((c) => c.id));

  Array.from(sessions.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      sessions.delete(id);
      clientToResolve.delete(id);
      clientToSessionPromise.delete(id);
    }
  });
}

function setSession(clientId: string, accessToken: unknown, baseUrl: unknown) {
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    sessions.set(clientId, { accessToken, baseUrl });
  } else {
    // Logout or invalid session
    sessions.delete(clientId);
  }

  const resolveSession = clientToResolve.get(clientId);
  if (resolveSession) {
    resolveSession(sessions.get(clientId));
    clientToResolve.delete(clientId);
    clientToSessionPromise.delete(clientId);
  }
}

function requestSession(client: Client): Promise<SessionInfo | undefined> {
  const promise =
    clientToSessionPromise.get(client.id) ??
    new Promise((resolve) => {
      clientToResolve.set(client.id, resolve);
      client.postMessage({ type: 'requestSession' });
    });

  if (!clientToSessionPromise.has(client.id)) {
    clientToSessionPromise.set(client.id, promise);
  }

  return promise;
}

async function requestSessionWithTimeout(
  clientId: string,
  timeoutMs = 3000
): Promise<SessionInfo | undefined> {
  const client = await self.clients.get(clientId);
  if (!client) return undefined;

  const sessionPromise = requestSession(client);

  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]);
}

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await cleanupDeadClients();
    })()
  );
});

/**
 * Receive session updates from clients
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const client = event.source as Client | null;
  if (!client) return;

  const { data } = event;
  if (!data || typeof data !== 'object') return;
  const { type, accessToken, baseUrl } = data as Record<string, unknown>;

  if (type === 'setSession') {
    setSession(client.id, accessToken, baseUrl);
    event.waitUntil(cleanupDeadClients());
  }
  if (type === 'setAppVisible') {
    if (typeof (data as { visible?: unknown }).visible === 'boolean') {
      appIsVisible = (data as { visible: boolean }).visible;
    }
  }
  if (type === 'setNotificationSettings') {
    if (
      typeof (data as { notificationSoundEnabled?: unknown }).notificationSoundEnabled === 'boolean'
    ) {
      notificationSoundEnabled = (data as { notificationSoundEnabled: boolean })
        .notificationSoundEnabled;
    }
    if (typeof (data as { showMessageContent?: unknown }).showMessageContent === 'boolean') {
      showMessageContent = (data as { showMessageContent: boolean }).showMessageContent;
    }
    if (
      typeof (data as { showEncryptedMessageContent?: unknown }).showEncryptedMessageContent ===
      'boolean'
    ) {
      showEncryptedMessageContent = (data as { showEncryptedMessageContent: boolean })
        .showEncryptedMessageContent;
    }
    if (
      typeof (data as { clearNotificationsOnRead?: unknown }).clearNotificationsOnRead === 'boolean'
    ) {
      clearNotificationsOnRead = (data as { clearNotificationsOnRead: boolean })
        .clearNotificationsOnRead;
    }
    // Persist so settings survive SW restart (iOS kills the SW aggressively).
    event.waitUntil(persistSettings());
  }
});

const MEDIA_PATHS = [
  '/_matrix/client/v1/media/download',
  '/_matrix/client/v1/media/thumbnail',
  // Legacy unauthenticated endpoints — servers that require auth return 404/403
  // for these when no token is present, so intercept and add auth here too.
  '/_matrix/media/v3/download',
  '/_matrix/media/v3/thumbnail',
  '/_matrix/media/r0/download',
  '/_matrix/media/r0/thumbnail',
];

function mediaPath(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return MEDIA_PATHS.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

function validMediaRequest(url: string, baseUrl: string): boolean {
  return MEDIA_PATHS.some((p) => {
    const validUrl = new URL(p, baseUrl);
    return url.startsWith(validUrl.href);
  });
}

function fetchConfig(token: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'default',
  };
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data.type === 'togglePush') {
    const token = event.data?.token;
    const fetchOptions = fetchConfig(token);
    event.waitUntil(
      fetch(`${event.data.url}/_matrix/client/v3/pushers/set`, {
        method: 'POST',
        ...fetchOptions,
        body: JSON.stringify(event.data.pusherData),
      })
    );
  }
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;
  if (!clientId) return;

  // For browser sub-resource loads (images, video, audio, etc.), 'follow' is
  // the correct mode: the auth header is sent to the Matrix server which owns
  // the first hop; any CDN redirect it issues is followed natively by the
  // Fetch machinery.  'manual' would return an opaque-redirect Response that
  // the browser cannot render as an <img>/<video>/etc.
  const redirect: RequestRedirect = 'follow';

  const session = sessions.get(clientId);
  if (session) {
    if (validMediaRequest(url, session.baseUrl)) {
      event.respondWith(fetch(url, { ...fetchConfig(session.accessToken), redirect }));
    }
    return;
  }

  event.respondWith(
    requestSessionWithTimeout(clientId).then((s) => {
      if (s && validMediaRequest(url, s.baseUrl)) {
        return fetch(url, { ...fetchConfig(s.accessToken), redirect });
      }
      return fetch(event.request);
    })
  );
});

const onPushNotification = async (event: PushEvent) => {
  if (!event?.data) return;

  // The SW may have been restarted by the OS (iOS is aggressive about this),
  // so in-memory settings would be at their defaults.  Reload from cache and
  // match active clients in parallel — they are independent operations.
  const [, clients] = await Promise.all([
    loadPersistedSettings(),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
  ]);

  // If the app is open and visible, skip the OS push notification — the in-app
  // pill notification handles the alert instead.
  // Combine clients.matchAll() visibility with the explicit appIsVisible flag
  // because iOS Safari PWA often returns empty or stale results from matchAll().
  const hasVisibleClient =
    appIsVisible || clients.some((client) => client.visibilityState === 'visible');
  console.debug(
    '[SW push] appIsVisible:',
    appIsVisible,
    '| clients:',
    clients.map((c) => ({ url: c.url, visibility: c.visibilityState }))
  );
  console.debug('[SW push] hasVisibleClient:', hasVisibleClient);
  if (hasVisibleClient) {
    console.debug('[SW push] suppressing OS notification — app is visible');
    return;
  }

  const pushData = event.data.json();
  console.debug('[SW push] raw payload:', JSON.stringify(pushData, null, 2));

  try {
    if (typeof pushData?.unread === 'number') {
      if (pushData.unread === 0) {
        // All messages read elsewhere — clear the home-screen badge and,
        // if the user opted in, dismiss outstanding lock-screen notifications.
        await (self.navigator as any).clearAppBadge();
        if (clearNotificationsOnRead) {
          const notifs = await self.registration.getNotifications();
          notifs.forEach((n) => n.close());
        }
        return;
      }
      // unread > 0: update the PWA badge with the current count.
      await (self.navigator as any).setAppBadge(pushData.unread);
    } else {
      // No unread field in payload — clear badge to avoid a stale count.
      await (self.navigator as any).clearAppBadge();
    }
  } catch {
    // Badging API absent (Firefox/Gecko) — continue to show the notification.
  }

  await handlePushNotificationPushData(pushData);
};

self.addEventListener('push', (event: PushEvent) => event.waitUntil(onPushNotification(event)));

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const { data } = event.notification;
  const { scope } = self.registration;

  const pushUserId: string | undefined = data?.user_id ?? undefined;
  const pushRoomId: string | undefined = data?.room_id ?? undefined;
  const pushEventId: string | undefined = data?.event_id ?? undefined;
  const isInvite = data?.content?.membership === 'invite';

  console.debug('[SW notificationclick] notification data:', JSON.stringify(data, null, 2));
  console.debug('[SW notificationclick] resolved fields:', {
    pushUserId,
    pushRoomId,
    pushEventId,
    isInvite,
    scope,
  });

  // Build a canonical deep-link URL.
  //
  // Room messages: /to/:user_id/:room_id/:event_id?
  //   e.g. https://sable.cloudhub.social/to/%40alice%3Aserver/%21room%3Aserver/%24event%3Aserver
  //   The :user_id segment ensures ToRoomEvent switches to the correct account
  //   before navigating — required for background-account notifications.
  //
  // Invites: /inbox/invites/?uid=:user_id
  //   Navigates straight to the invites page for the correct account.
  let targetUrl: string;
  if (isInvite) {
    const u = new URL('inbox/invites/', scope);
    if (pushUserId) u.searchParams.set('uid', pushUserId);
    targetUrl = u.href;
  } else if (pushUserId && pushRoomId) {
    const segments = pushEventId
      ? `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}/${encodeURIComponent(pushEventId)}/`
      : `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}/`;
    targetUrl = new URL(segments, scope).href;
  } else {
    // Fallback: no room ID or no user ID in payload.
    targetUrl = new URL('inbox/notifications/', scope).href;
  }

  console.debug('[SW notificationclick] targetUrl:', targetUrl);

  event.waitUntil(
    (async () => {
      const clientList = (await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })) as WindowClient[];

      console.debug(
        '[SW notificationclick] window clients:',
        clientList.map((c) => ({ url: c.url, visibility: c.visibilityState, focused: c.focused }))
      );

      // eslint-disable-next-line no-restricted-syntax
      for (const wc of clientList) {
        console.debug('[SW notificationclick] postMessage to existing client:', wc.url);
        try {
          // Post notification data directly to the running app so its
          // ServiceWorkerClickHandler can call setActiveSessionId + setPending
          // (same path as the pill-style in-app banner) without navigating to
          // the /to/ route first.
          wc.postMessage({
            type: 'notificationClick',
            userId: pushUserId,
            roomId: pushRoomId,
            eventId: pushEventId,
            isInvite,
          });
          // eslint-disable-next-line no-await-in-loop
          await wc.focus();
          return;
        } catch (err) {
          console.debug('[SW notificationclick] postMessage/focus failed:', err);
        }
      }

      // No existing window clients — open a new window.
      // ToRoomEvent handles the /to/ URL on cold launch (account switch + pending atom).
      console.debug('[SW notificationclick] falling back to openWindow()', targetUrl);
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

if (self.__WB_MANIFEST) {
  precacheAndRoute(self.__WB_MANIFEST);
}
cleanupOutdatedCaches();
