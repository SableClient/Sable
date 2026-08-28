/// <reference lib="WebWorker" />

/* oxlint-disable no-console, unicorn/require-post-message-target-origin */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { EventType } from 'matrix-js-sdk/lib/@types/event';

import { MATRIX_UNSTABLE_MSC4174_PUSHERS_ACK_PATH } from '$unstable/prefixes';
import { createPushNotifications } from './sw/pushNotification';
import { readPersistedSession } from './sw-session-persistence';

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

/** Cache key used to persist sessions so push-event fetches work after SW restart. */
const SW_SESSION_CACHE = 'sable-sw-session-v1';
const SW_SESSION_URL = '/sw-session-meta';

/**
 * Version of the media-auth interception protocol this service worker supports.
 * The page probes for it before handing raw authenticated-media URLs to
 * <img>/<video> elements; a stale SW build without this handler never answers
 * and the page falls back to token-attached blob fetches instead.
 * Keep in sync with src/app/utils/swMediaAuth.ts.
 */
const SW_MEDIA_AUTH_PROTOCOL_VERSION = 1;

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

async function loadPersistedSessions(): Promise<Record<string, SessionInfo>> {
  try {
    const cache = await self.caches.open(SW_SESSION_CACHE);
    const response = await cache.match(SW_SESSION_URL);
    if (!response) return {};
    const value = await response.json();
    const sessions: Record<string, SessionInfo> = {};

    if (typeof value !== 'object' || value === null) return sessions;
    const legacySession = readPersistedSession(value);
    if (legacySession?.userId) return { [legacySession.userId]: legacySession };
    for (const [userId, candidate] of Object.entries(value)) {
      const session = readPersistedSession(candidate);
      if (session?.userId === userId) sessions[userId] = session;
    }
    return sessions;
  } catch {
    return {};
  }
}

let persistedSessionWrites = Promise.resolve();

function updatePersistedSession(userId: string, session?: SessionInfo): Promise<void> {
  const update = async () => {
    try {
      const cache = await self.caches.open(SW_SESSION_CACHE);
      const sessions = await loadPersistedSessions();
      if (session) sessions[userId] = session;
      else delete sessions[userId];
      await cache.put(
        SW_SESSION_URL,
        new Response(JSON.stringify(sessions), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch {
      // Ignore, caches may be unavailable in some environments.
    }
  };

  persistedSessionWrites = persistedSessionWrites.then(update, update);
  return persistedSessionWrites;
}

async function loadPersistedSession(userId: string): Promise<SessionInfo | undefined> {
  try {
    return (await loadPersistedSessions())[userId];
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

type PendingSessionRequest = {
  promise: Promise<SessionInfo | undefined>;
  resolve: (value: SessionInfo | undefined) => void;
};
const pendingSessionRequests = new Map<string, PendingSessionRequest>();

async function cleanupDeadClients() {
  const activeClients = await self.clients.matchAll();
  const activeIds = new Set(activeClients.map((c) => c.id));

  Array.from(sessions.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      sessions.delete(id);
      pendingSessionRequests.delete(id);
    }
  });
}

function setSession(
  clientId: string,
  accessToken: unknown,
  baseUrl: unknown,
  userId?: unknown
): Promise<void> {
  const previous = sessions.get(clientId);
  const persistence: Promise<void>[] = [];
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    const info: SessionInfo = {
      accessToken,
      baseUrl,
      userId: typeof userId === 'string' ? userId : undefined,
    };
    sessions.set(clientId, info);
    console.debug('[SW] setSession: stored', clientId, baseUrl);
    if (info.userId) persistence.push(updatePersistedSession(info.userId, info));
  } else {
    // Logout or invalid session
    sessions.delete(clientId);
    console.debug('[SW] setSession: removed', clientId);
  }

  if (
    previous?.userId &&
    previous.userId !== sessions.get(clientId)?.userId &&
    ![...sessions.values()].some((session) => session.userId === previous.userId)
  ) {
    persistence.push(updatePersistedSession(previous.userId));
  }

  const pending = pendingSessionRequests.get(clientId);
  if (pending) {
    pending.resolve(sessions.get(clientId));
    pendingSessionRequests.delete(clientId);
  }

  return Promise.all(persistence).then(() => undefined);
}

function requestSession(client: Client): Promise<SessionInfo | undefined> {
  const existing = pendingSessionRequests.get(client.id);
  if (existing) return existing.promise;

  let resolveSession!: (value: SessionInfo | undefined) => void;
  const promise = new Promise<SessionInfo | undefined>((resolve) => {
    resolveSession = resolve;
  });
  pendingSessionRequests.set(client.id, { promise, resolve: resolveSession });
  client.postMessage({ type: 'requestSession' });
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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn('[SW] requestSessionWithTimeout: timed out after', timeoutMs, 'ms', clientId);
      resolve(undefined);
    }, timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (pendingSessionRequests.get(clientId)?.promise === sessionPromise) {
      pendingSessionRequests.delete(clientId);
    }
  });
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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, unknown>;
    const { name } = data;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

type MemberInfo = {
  displayname: string | undefined;
  avatarUrl: string | undefined;
};

/**
 * Fetch a room member's state from the homeserver.
 * Returns displayname and avatar_url (both may be undefined).
 */
async function fetchMemberInfo(
  baseUrl: string,
  accessToken: string,
  roomId: string,
  userId: string
): Promise<MemberInfo> {
  try {
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.member/${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { displayname: undefined, avatarUrl: undefined };
    const data = (await res.json()) as Record<string, unknown>;
    const displayname =
      typeof data.displayname === 'string' && data.displayname.trim()
        ? data.displayname.trim()
        : undefined;
    const avatarUrl =
      typeof data.avatar_url === 'string' && data.avatar_url.trim()
        ? data.avatar_url.trim()
        : undefined;
    return { displayname, avatarUrl };
  } catch {
    return { displayname: undefined, avatarUrl: undefined };
  }
}

/**
 * Fetch the m.room.avatar state event URL from the homeserver.
 * Returns undefined when the room has no avatar or the request fails.
 */
async function fetchRoomAvatar(
  baseUrl: string,
  accessToken: string,
  roomId: string
): Promise<string | undefined> {
  try {
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.avatar`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, unknown>;
    const avatarUrl = data.url;
    return typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Convert an mxc:// URL to a legacy unauthenticated thumbnail URL.
 * OS fetches notification icons without auth headers, so v1.11-strict servers will 404 here.
 */
function mxcToNotificationUrl(mxcUrl: string, baseUrl: string): string | undefined {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/([^?#]+)/);
  if (!match || !match[1] || !match[2]) return undefined;
  const [, server, mediaId] = match;
  return `${baseUrl}/_matrix/media/v3/thumbnail/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}?width=96&height=96&method=crop`;
}

async function getSessionForPush(userId?: string): Promise<SessionInfo | undefined> {
  if (userId) {
    const liveSession = [...sessions.values()].find((session) => session.userId === userId);
    return liveSession ?? loadPersistedSession(userId);
  }

  const liveAccounts = new Set([...sessions.values()].map((session) => session.userId));
  if (liveAccounts.size === 1) return sessions.values().next().value;

  const persisted = Object.values(await loadPersistedSessions());
  return persisted.length === 1 ? persisted[0] : undefined;
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
        (client as WindowClient).postMessage({
          type: 'decryptPushEvent',
          rawEvent,
        });
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
  userId: string | undefined,
  windowClients: readonly Client[]
): Promise<void> {
  const session = await getSessionForPush(userId);

  if (!session) {
    // No session anywhere — app was never opened since install, or the user logged out.
    // Show a minimal actionable notification so the user can tap through to the room.
    console.debug('[SW push] minimal payload: no session, showing generic notification');
    await self.registration.showNotification('New Message', {
      body: undefined,
      icon: '/public/res/logo-maskable/logo-maskable-180x180.png',
      badge: '/public/res/logo-maskable/logo-maskable-72x72.png',
      tag: `room-${roomId}`,
      renotify: true,
      data: { room_id: roomId, event_id: eventId },
    } as NotificationOptions);
    return;
  }

  // Fetch the raw event, room name, and room avatar in parallel — all need only roomId.
  const [rawEvent, roomNameFromState, roomAvatarMxc] = await Promise.all([
    fetchRawEvent(session.baseUrl, session.accessToken, roomId, eventId),
    fetchRoomName(session.baseUrl, session.accessToken, roomId),
    fetchRoomAvatar(session.baseUrl, session.accessToken, roomId),
  ]);

  if (!rawEvent) {
    await self.registration.showNotification('New Message', {
      body: undefined,
      icon: '/public/res/logo-maskable/logo-maskable-180x180.png',
      badge: '/public/res/logo-maskable/logo-maskable-72x72.png',
      tag: `room-${roomId}`,
      renotify: true,
      data: { room_id: roomId, event_id: eventId, user_id: session.userId },
    } as NotificationOptions);
    return;
  }

  const eventType = rawEvent.type as string | undefined;
  const sender = rawEvent.sender as string | undefined;
  // Fetch sender's member state — gives us both display name and avatar URL.
  const memberInfo = sender
    ? await fetchMemberInfo(session.baseUrl, session.accessToken, roomId, sender)
    : { displayname: undefined, avatarUrl: undefined };
  // Fall back to MXID localpart when the server returns no displayname.
  const senderDisplay = memberInfo.displayname ?? (sender ? mxidLocalpart(sender) : 'Someone');
  // For DMs (no m.room.name state), use the sender's display name as the room name.
  const resolvedRoomName = roomNameFromState ?? senderDisplay;
  // Room avatar takes priority (group rooms); for DMs fall back to sender's member avatar.
  // Convert mxc:// to a legacy unauthenticated thumbnail URL so the OS can fetch it.
  const notificationAvatarUrl =
    (roomAvatarMxc ?? memberInfo.avatarUrl) !== undefined
      ? mxcToNotificationUrl((roomAvatarMxc ?? memberInfo.avatarUrl)!, session.baseUrl)
      : undefined;
  const baseData = {
    room_id: roomId,
    event_id: eventId,
    user_id: session.userId,
    sender_id: sender,
  };

  if (eventType === EventType.RoomMessageEncrypted) {
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
      // Prefer the server-fetched display name (authoritative) over the relay's SDK cache
      // value, which may be stale or missing if the SDK hasn't fully synced yet.
      await handlePushNotificationPushData({
        ...baseData,
        type: result.eventType,
        content: result.content as { notification_type?: string; membership?: string } | undefined,
        sender_display_name: senderDisplay,
        // Prefer relay's room name (has m.direct / computed SDK name); fall back to state fetch.
        room_name: result.room_name || resolvedRoomName,
        room_avatar_url: notificationAvatarUrl,
      });
    } else {
      // App is frozen or fully closed — show "Encrypted message" fallback.
      await handlePushNotificationPushData({
        ...baseData,
        type: 'm.room.encrypted',
        content: {},
        sender_display_name: senderDisplay,
        room_name: resolvedRoomName,
        room_avatar_url: notificationAvatarUrl,
      });
    }
  } else {
    // Unencrypted event — we have the plaintext, show it.
    await handlePushNotificationPushData({
      ...baseData,
      type: eventType,
      content: rawEvent.content as { notification_type?: string; membership?: string } | undefined,
      sender_display_name: senderDisplay,
      room_name: resolvedRoomName,
      room_avatar_url: notificationAvatarUrl,
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
      // Proactively request sessions from all window clients so the sessions Map
      // is pre-populated after a SW restart, rather than waiting for the first
      // media fetch to trigger requestSessionWithTimeout.
      const windowClients = await self.clients.matchAll({ type: 'window' });
      windowClients.forEach((client) => client.postMessage({ type: 'requestSession' }));
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
    event.waitUntil(
      Promise.all([setSession(client.id, accessToken, baseUrl, userId), cleanupDeadClients()]).then(
        () => undefined
      )
    );
  }
  if (type === 'swMediaAuthProbe') {
    // Capability handshake: prove this SW intercepts authenticated media so the
    // page can safely stream raw media URLs through media elements.
    event.ports?.[0]?.postMessage({
      type: 'swMediaAuth',
      supported: true,
      version: SW_MEDIA_AUTH_PROTOCOL_VERSION,
    });
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

const ELEMENT_CALL_RINGTONE_PATH = '/public/element-call/assets/ringtone-';
let silentWavBytesCache: Uint8Array | undefined;

function createSilentWavBytes(durationMs = 250): Uint8Array {
  if (silentWavBytesCache) return silentWavBytesCache;

  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  // PCM data is already zeroed => silence.
  silentWavBytesCache = new Uint8Array(buffer);
  return silentWavBytesCache;
}

function isElementCallRingtoneRequest(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return (
      pathname.startsWith(ELEMENT_CALL_RINGTONE_PATH) &&
      (pathname.endsWith('.mp3') || pathname.endsWith('.ogg') || pathname.endsWith('.wav'))
    );
  } catch {
    return false;
  }
}

function mediaPath(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return MEDIA_PATHS.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

function authenticatedMediaPath(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith('/_matrix/client/v1/media/');
  } catch {
    return false;
  }
}

function validMediaRequest(url: string, baseUrl: string): boolean {
  try {
    const requestUrl = new URL(url);
    return MEDIA_PATHS.some((p) => {
      const mediaUrl = new URL(p, baseUrl);
      return (
        requestUrl.origin === mediaUrl.origin && requestUrl.pathname.startsWith(mediaUrl.pathname)
      );
    });
  } catch {
    return false;
  }
}

function fetchConfig(token: string, request?: Request): RequestInit {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  const range = request?.headers.get('Range');
  if (range) {
    headers.set('Range', range);
  }
  return {
    headers,
    cache: 'default',
  };
}

type BufferedMediaResponse = {
  status: number;
  statusText: string;
  headers: Headers;
  body: ArrayBuffer;
};

const inflightMediaFetches = new Map<string, Promise<BufferedMediaResponse>>();

// Ranged media is streamed straight through: buffering it would hold playback until the whole
// file had arrived, and sharing an in-flight fetch buys nothing when each request is its own
// byte range.
function respondWithStreamedMedia(
  request: Request,
  token: string,
  redirect: RequestRedirect
): Promise<Response> {
  return fetch(request.url, { ...fetchConfig(token, request), redirect }).then(
    (res) =>
      new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: new Headers(res.headers),
      })
  );
}

function respondWithInflightMedia(
  request: Request,
  token: string,
  redirect: RequestRedirect
): Promise<Response> {
  const range = request.headers.get('Range') ?? '';
  if (range) return respondWithStreamedMedia(request, token, redirect);

  const key = `${token}\x00${request.url}\x00${redirect}\x00${range}`;
  const existing = inflightMediaFetches.get(key);
  if (existing) {
    return existing.then(
      (data) =>
        new Response(data.body, {
          status: data.status,
          statusText: data.statusText,
          headers: new Headers(data.headers),
        })
    );
  }
  // Fetch by URL instead of reusing the subresource Request. Image requests commonly carry
  // mode: "no-cors", which prevents the Authorization header above from reaching the server.
  // Preserve Range header for streaming audio and video.
  const promise = fetch(request.url, { ...fetchConfig(token, request), redirect })
    .then(async (res): Promise<BufferedMediaResponse> => ({
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(res.headers),
      body: await res.arrayBuffer(),
    }))
    .finally(() => {
      inflightMediaFetches.delete(key);
    });
  inflightMediaFetches.set(key, promise);
  return promise.then(
    (data) =>
      new Response(data.body, {
        status: data.status,
        statusText: data.statusText,
        headers: new Headers(data.headers),
      })
  );
}

async function respondWithMediaAuthRecovery(
  request: Request,
  session: SessionInfo,
  redirect: RequestRedirect,
  clientId?: string
): Promise<Response> {
  const response = await respondWithInflightMedia(request, session.accessToken, redirect);
  if ((response.status !== 401 && response.status !== 403) || !clientId) return response;

  // One exact-client retry; concurrent recoveries share this request.
  const refreshed = await requestSessionWithTimeout(clientId);
  if (
    !refreshed ||
    refreshed.accessToken === session.accessToken ||
    !validMediaRequest(request.url, refreshed.baseUrl)
  ) {
    return response;
  }

  // The retry replaces this response, so release its body rather than leaving the stream open.
  await response.body?.cancel().catch(() => undefined);
  return respondWithInflightMedia(request, refreshed.accessToken, redirect);
}

function unavailableAuthenticatedMediaResponse(): Response {
  return new Response('Media session unavailable', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const swTestHooks = {
  getSessionForPush,
  requestSessionWithTimeout,
  respondWithMediaAuthRecovery,
  setSession,
  isWebPushActivationPayload,
  acknowledgeWebPushActivation,
};

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

  if (method !== 'GET') return;

  if (isElementCallRingtoneRequest(url)) {
    const silentWavBytes = createSilentWavBytes();
    const silentWavBuffer = new Uint8Array(silentWavBytes).buffer;
    event.respondWith(
      Promise.resolve(
        new Response(silentWavBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      )
    );
    return;
  }

  if (!mediaPath(url)) return;

  // Direct-auth fallback requests already carry the page's token. Let the
  // browser send them unchanged instead of routing them back through SW auth.
  if (event.request.headers.has('Authorization')) return;

  const { clientId } = event;

  // For browser sub-resource loads (images, video, audio, etc.), 'follow' is
  // the correct mode: the auth header is sent to the Matrix server which owns
  // the first hop; any CDN redirect it issues is followed natively by the
  // Fetch machinery.  'manual' would return an opaque-redirect Response that
  // the browser cannot render as an <img>/<video>/etc.
  const redirect: RequestRedirect = 'follow';

  const session = clientId ? sessions.get(clientId) : undefined;
  if (session && validMediaRequest(url, session.baseUrl)) {
    event.respondWith(respondWithMediaAuthRecovery(event.request, session, redirect, clientId));
    return;
  }

  if (!clientId) {
    event.respondWith(
      Promise.resolve().then(() => {
        if (authenticatedMediaPath(url)) return unavailableAuthenticatedMediaResponse();
        return fetch(event.request);
      })
    );
    return;
  }

  event.respondWith(
    requestSessionWithTimeout(clientId).then(async (s) => {
      // Primary: session received from the live client window.
      if (s && validMediaRequest(url, s.baseUrl)) {
        return respondWithMediaAuthRecovery(event.request, s, redirect, clientId);
      }
      if (authenticatedMediaPath(url)) return unavailableAuthenticatedMediaResponse();
      return fetch(event.request);
    })
  );
});

// ---------------------------------------------------------------------------
// MSC4174 web push activation
// ---------------------------------------------------------------------------

/** MSC4174 validation push: `{ app_id, ack_token }` and nothing else. */
function isWebPushActivationPayload(data: unknown): data is { app_id: string; ack_token: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.app_id === 'string' &&
    typeof d.ack_token === 'string' &&
    d.room_id === undefined &&
    d.event_id === undefined &&
    d.type === undefined &&
    typeof d.unread !== 'number'
  );
}

async function postWebPushAck(
  session: SessionInfo,
  appId: string,
  ackToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${session.baseUrl}${MATRIX_UNSTABLE_MSC4174_PUSHERS_ACK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_id: appId, ack_token: ackToken }),
    });
    if (res.ok) return true;
    console.warn('[SW push] MSC4174 ack rejected with HTTP', res.status);
  } catch (err) {
    console.warn('[SW push] MSC4174 ack failed', err);
  }
  return false;
}

/**
 * Acknowledges a MSC4174 validation push. The payload does not identify the
 * account that registered the pusher, so each known session is tried in turn.
 */
async function acknowledgeWebPushActivation(appId: string, ackToken: string): Promise<boolean> {
  const candidates: SessionInfo[] = [...sessions.values()];
  const seen = new Set(candidates.map((session) => session.userId).filter(Boolean));
  const persisted = await loadPersistedSessions();
  Object.values(persisted).forEach((session) => {
    if (!seen.has(session.userId)) {
      candidates.push(session);
      seen.add(session.userId);
    }
  });

  // Chain sessions sequentially to avoid await-in-loop.
  return candidates.reduce(
    (prevPromise, session) =>
      prevPromise.then((acked) => acked || postWebPushAck(session, appId, ackToken)),
    Promise.resolve(false)
  );
}

// Detect a minimal (event_id_only) payload: has room_id + event_id but no
// event type field — meaning the homeserver stripped the event content.
function isMinimalPushPayload(
  data: unknown
): data is { room_id: string; event_id: string; user_id?: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.room_id === 'string' && typeof d.event_id === 'string' && !d.type;
}

const onPushNotification = async (event: PushEvent) => {
  if (!event?.data) return;

  const pushData = event.data.json();

  // MSC4174 validation push: not a notification, ack even while visible.
  if (isWebPushActivationPayload(pushData)) {
    await acknowledgeWebPushActivation(pushData.app_id, pushData.ack_token);
    return;
  }

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

  console.debug('[SW push] raw payload:', JSON.stringify(pushData, null, 2));

  try {
    if (typeof pushData?.unread === 'number') {
      if (pushData.unread === 0) {
        // All messages read elsewhere — clear the home-screen badge and,
        // if the user opted in, dismiss outstanding lock-screen notifications.
        await (
          self.navigator as unknown as { clearAppBadge?: () => Promise<void> }
        ).clearAppBadge?.();
        if (clearNotificationsOnRead) {
          const notifs = await self.registration.getNotifications();
          notifs.forEach((n) => n.close());
        }
        return;
      }
      // unread > 0: update the PWA badge with the current count.
      await (
        self.navigator as unknown as { setAppBadge?: (count: number) => Promise<void> }
      ).setAppBadge?.(pushData.unread);
    } else {
      // No unread field in payload — clear badge to avoid a stale count.
      await (
        self.navigator as unknown as { clearAppBadge?: () => Promise<void> }
      ).clearAppBadge?.();
    }
  } catch {
    // Badging API absent (Firefox/Gecko) — continue to show the notification.
  }

  // event_id_only format: fetch the event ourselves and (for E2EE rooms) try
  // to relay decryption to an open app tab.
  if (isMinimalPushPayload(pushData)) {
    console.debug('[SW push] minimal payload detected — fetching event', pushData.event_id);
    await handleMinimalPushPayload(pushData.room_id, pushData.event_id, pushData.user_id, clients);
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
  const callNotificationType: string | undefined = data?.callNotificationType ?? undefined;
  const callIntentKind: string | undefined = data?.callIntentKind ?? undefined;
  const callIntentRaw: string | undefined = data?.callIntentRaw ?? undefined;
  const callRefEventId: string | undefined = data?.callRefEventId ?? undefined;
  const callSenderId: string | undefined = data?.sender_id ?? data?.callSenderId ?? undefined;
  const callSenderTs: number | undefined =
    typeof data?.callSenderTs === 'number' ? data.callSenderTs : undefined;
  const callExpiresAt: number | undefined =
    typeof data?.callExpiresAt === 'number' ? data.callExpiresAt : undefined;

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
    const segments = pushEventId
      ? `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}/${encodeURIComponent(pushEventId)}`
      : `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}`;
    const target = new URL(segments, scope);
    if (isCall) {
      target.searchParams.set('call', '1');
      if (callNotificationType) target.searchParams.set('callType', callNotificationType);
      if (callIntentKind) target.searchParams.set('callIntentKind', callIntentKind);
      if (callIntentRaw) target.searchParams.set('callIntentRaw', callIntentRaw);
      if (callRefEventId) target.searchParams.set('callRefEventId', callRefEventId);
      if (callSenderId) target.searchParams.set('callSenderId', callSenderId);
      if (typeof callSenderTs === 'number') {
        target.searchParams.set('callSenderTs', String(callSenderTs));
      }
      if (typeof callExpiresAt === 'number') {
        target.searchParams.set('callExpiresAt', String(callExpiresAt));
      }
    }
    targetUrl = target.href;
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
        clientList.map((c) => ({
          url: c.url,
          visibility: c.visibilityState,
          focused: c.focused,
        }))
      );

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
            callNotificationType,
            callIntentKind,
            callIntentRaw,
            callRefEventId,
            callSenderId,
            callSenderTs,
            callExpiresAt,
          });
          // oxlint-disable-next-line no-await-in-loop
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

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
