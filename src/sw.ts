/// <reference lib="WebWorker" />

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

/** Cache key used to persist the active session so push-event fetches work after SW restart. */
const SW_SESSION_CACHE = 'sable-sw-session-v1';
const SW_SESSION_URL = '/sw-session-meta';

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

async function persistSession(session: SessionInfo): Promise<void> {
  try {
    const cache = await self.caches.open(SW_SESSION_CACHE);
    await cache.put(
      SW_SESSION_URL,
      new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } })
    );
  } catch {
    // Ignore — caches may be unavailable in some environments.
  }
}

async function clearPersistedSession(): Promise<void> {
  try {
    const cache = await self.caches.open(SW_SESSION_CACHE);
    await cache.delete(SW_SESSION_URL);
  } catch {
    // Ignore.
  }
}

async function loadPersistedSession(): Promise<SessionInfo | undefined> {
  try {
    const cache = await self.caches.open(SW_SESSION_CACHE);
    const response = await cache.match(SW_SESSION_URL);
    if (!response) return undefined;
    const s = await response.json();
    if (typeof s.accessToken === 'string' && typeof s.baseUrl === 'string') {
      return {
        accessToken: s.accessToken,
        baseUrl: s.baseUrl,
        userId: typeof s.userId === 'string' ? s.userId : undefined,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
  /** Matrix user ID of the account, used to identify which account a push belongs to. */
  userId?: string;
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

function setSession(clientId: string, accessToken: unknown, baseUrl: unknown, userId?: unknown) {
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    const info: SessionInfo = {
      accessToken,
      baseUrl,
      userId: typeof userId === 'string' ? userId : undefined,
    };
    sessions.set(clientId, info);
    console.debug('[SW] setSession: stored', clientId, baseUrl);
    // Persist so push-event fetches work after iOS restarts the SW.
    persistSession(info).catch(() => undefined);
  } else {
    // Logout or invalid session
    sessions.delete(clientId);
    console.debug('[SW] setSession: removed', clientId);
    clearPersistedSession().catch(() => undefined);
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
  if (!client) {
    console.warn('[SW] requestSessionWithTimeout: client not found', clientId);
    return undefined;
  }

  const sessionPromise = requestSession(client);

  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      console.warn('[SW] requestSessionWithTimeout: timed out after', timeoutMs, 'ms', clientId);
      resolve(undefined);
    }, timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]);
}

// ---------------------------------------------------------------------------
// Encrypted push — decryption relay
// ---------------------------------------------------------------------------

/**
 * The shape returned by the client tab after decrypting an encrypted push event.
 * Also used as a partial pushData object for handlePushNotificationPushData.
 */
type DecryptionResult = {
  eventId: string;
  success: boolean;
  eventType?: string;
  content?: unknown;
  sender_display_name?: string;
  room_name?: string;
  /** document.visibilityState reported by the responding app tab. */
  visibilityState?: string;
};

/** Pending decryption requests keyed by event_id. */
const decryptionPendingMap = new Map<string, (result: DecryptionResult) => void>();

/**
 * Fetch a single raw Matrix event from the homeserver.
 * Returns undefined on error (e.g. network failure, auth error, redacted event).
 */
async function fetchRawEvent(
  baseUrl: string,
  accessToken: string,
  roomId: string,
  eventId: string
): Promise<Record<string, unknown> | undefined> {
  try {
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.warn('[SW fetchRawEvent] HTTP', res.status, 'for', eventId);
      return undefined;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn('[SW fetchRawEvent] error', err);
    return undefined;
  }
}

/**
 * Fetch the m.room.name state event from the homeserver.
 * Returns undefined when not set (DMs and many encrypted rooms have no explicit name).
 */
async function fetchRoomName(
  baseUrl: string,
  accessToken: string,
  roomId: string
): Promise<string | undefined> {
  try {
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, unknown>;
    const { name } = data;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a room member's displayname from homeserver member state.
 * Returns undefined if the member has no displayname or the request fails.
 */
async function fetchMemberDisplayName(
  baseUrl: string,
  accessToken: string,
  roomId: string,
  userId: string
): Promise<string | undefined> {
  try {
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.member/${encodeURIComponent(userId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, unknown>;
    const name = data.displayname;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Return the first any-session we have stored (used for push fetches where we
 * don't have a client ID, e.g. when the app is backgrounded but still loaded).
 */
function getAnyStoredSession(): SessionInfo | undefined {
  return sessions.values().next().value;
}

/**
 * Extract the MXID localpart (@user:server → user) for fallback display names.
 */
function mxidLocalpart(userId: string): string {
  return userId.match(/^@([^:]+):/)?.[1] ?? userId;
}

/**
 * Post a decryptPushEvent request to one of the open window clients and wait
 * up to 5 s for the pushDecryptResult reply.
 */
async function requestDecryptionFromClient(
  windowClients: readonly Client[],
  rawEvent: Record<string, unknown>
): Promise<DecryptionResult | undefined> {
  const eventId = rawEvent.event_id as string;

  // Chain clients sequentially using reduce to avoid await-in-loop and for-of.
  return Array.from(windowClients).reduce(
    async (prevPromise, client) => {
      const prev = await prevPromise;
      if (prev?.success) return prev;

      const promise = new Promise<DecryptionResult>((resolve) => {
        decryptionPendingMap.set(eventId, resolve);
      });

      const timeout = new Promise<undefined>((resolve) => {
        setTimeout(() => {
          decryptionPendingMap.delete(eventId);
          console.warn('[SW decryptRelay] timed out waiting for client', client.id);
          resolve(undefined);
        }, 5000);
      });

      try {
        (client as WindowClient).postMessage({ type: 'decryptPushEvent', rawEvent });
      } catch (err) {
        decryptionPendingMap.delete(eventId);
        console.warn('[SW decryptRelay] postMessage error', err);
        return undefined;
      }

      return Promise.race([promise, timeout]);
    },
    Promise.resolve(undefined) as Promise<DecryptionResult | undefined>
  );
}

/**
 * Handle a minimal push payload (event_id_only format).
 * Fetches the event from the homeserver and shows a notification.
 * For encrypted events, attempts to relay decryption to an open app tab.
 */
async function handleMinimalPushPayload(
  roomId: string,
  eventId: string,
  windowClients: readonly Client[]
): Promise<void> {
  // On iOS the SW is killed and restarted for every push, clearing the in-memory sessions
  // Map.  Fall back to the Cache Storage copy that was written when the user last opened
  // the app (same pattern as settings persistence).
  const session = getAnyStoredSession() ?? (await loadPersistedSession());

  if (!session) {
    // No session anywhere — app was never opened since install, or the user logged out.
    // Show a minimal actionable notification so the user can tap through to the room.
    console.debug('[SW push] minimal payload: no session, showing generic notification');
    await self.registration.showNotification('New Message', {
      body: undefined,
      icon: '/public/res/apple/apple-touch-icon-180x180.png',
      badge: '/public/res/apple/apple-touch-icon-72x72.png',
      tag: `room-${roomId}`,
      renotify: true,
      data: { room_id: roomId, event_id: eventId },
    } as NotificationOptions);
    return;
  }

  // Fetch the raw event and room name state in parallel — both need only roomId.
  const [rawEvent, roomNameFromState] = await Promise.all([
    fetchRawEvent(session.baseUrl, session.accessToken, roomId, eventId),
    fetchRoomName(session.baseUrl, session.accessToken, roomId),
  ]);

  if (!rawEvent) {
    await self.registration.showNotification('New Message', {
      body: undefined,
      icon: '/public/res/apple/apple-touch-icon-180x180.png',
      badge: '/public/res/apple/apple-touch-icon-72x72.png',
      tag: `room-${roomId}`,
      renotify: true,
      data: { room_id: roomId, event_id: eventId, user_id: session.userId },
    } as NotificationOptions);
    return;
  }

  const eventType = rawEvent.type as string | undefined;
  const sender = rawEvent.sender as string | undefined;
  // Fetch sender's display name from room member state; fall back to MXID localpart.
  const senderDisplay =
    (sender
      ? await fetchMemberDisplayName(session.baseUrl, session.accessToken, roomId, sender)
      : undefined) ?? (sender ? mxidLocalpart(sender) : 'Someone');
  // For DMs (no m.room.name state), use the sender's display name as the room name.
  const resolvedRoomName = roomNameFromState ?? senderDisplay;
  const baseData = {
    room_id: roomId,
    event_id: eventId,
    user_id: session.userId,
  };

  if (eventType === 'm.room.encrypted') {
    // Try to relay decryption to an open app tab.
    const result =
      windowClients.length > 0
        ? await requestDecryptionFromClient(windowClients, rawEvent)
        : undefined;

    // If the relay responded and the app is currently visible, the in-app UI is already
    // displaying the message — skip the OS notification entirely.
    if (result?.visibilityState === 'visible') return;

    if (result?.success) {
      // App was backgrounded but not frozen — decryption succeeded.
      await handlePushNotificationPushData({
        ...baseData,
        type: result.eventType,
        content: result.content,
        sender_display_name: result.sender_display_name ?? senderDisplay,
        // Prefer relay's room name (has m.direct / computed SDK name); fall back to state fetch.
        room_name: result.room_name || resolvedRoomName,
      });
    } else {
      // App is frozen or fully closed — show "Encrypted message" fallback.
      await handlePushNotificationPushData({
        ...baseData,
        type: 'm.room.encrypted',
        content: {},
        sender_display_name: senderDisplay,
        room_name: resolvedRoomName,
      });
    }
  } else {
    // Unencrypted event — we have the plaintext, show it.
    await handlePushNotificationPushData({
      ...baseData,
      type: eventType,
      content: rawEvent.content,
      sender_display_name: senderDisplay,
      room_name: resolvedRoomName,
    });
  }
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
  const { type, accessToken, baseUrl, userId } = data as Record<string, unknown>;

  if (type === 'setSession') {
    setSession(client.id, accessToken, baseUrl, userId);
    event.waitUntil(cleanupDeadClients());
  }
  if (type === 'pushDecryptResult') {
    // Resolve a pending decryption request from handleMinimalPushPayload
    const { eventId } = data as { eventId?: string };
    if (typeof eventId === 'string') {
      const resolve = decryptionPendingMap.get(eventId);
      if (resolve) {
        decryptionPendingMap.delete(eventId);
        resolve(data as DecryptionResult);
      }
    }
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
      console.warn(
        '[SW fetch] No valid session for media request',
        { url, clientId, hasSession: !!s },
        'falling back to unauthenticated fetch'
      );
      return fetch(event.request);
    })
  );
});

// Detect a minimal (event_id_only) payload: has room_id + event_id but no
// event type field — meaning the homeserver stripped the event content.
function isMinimalPushPayload(data: unknown): data is { room_id: string; event_id: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.room_id === 'string' && typeof d.event_id === 'string' && !d.type;
}

const onPushNotification = async (event: PushEvent) => {
  if (!event?.data) return;

  // The SW may have been restarted by the OS (iOS is aggressive about this),
  // so in-memory settings would be at their defaults.  Reload from cache and
  // match active clients in parallel — they are independent operations.
  const [, , clients] = await Promise.all([
    loadPersistedSettings(),
    loadPersistedSession(),
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

  // event_id_only format: fetch the event ourselves and (for E2EE rooms) try
  // to relay decryption to an open app tab.
  if (isMinimalPushPayload(pushData)) {
    console.debug('[SW push] minimal payload detected — fetching event', pushData.event_id);
    await handleMinimalPushPayload(pushData.room_id, pushData.event_id, clients);
    return;
  }

  await handlePushNotificationPushData(pushData);
};

// ---------------------------------------------------------------------------
// Push handler
// ---------------------------------------------------------------------------

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

  const isCall = data?.isCall === true;

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
    const callParam = isCall ? '?joinCall=true' : '';
    const segments = pushEventId
      ? `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}/${encodeURIComponent(pushEventId)}/${callParam}`
      : `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}/${callParam}`;
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
            isCall,
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
