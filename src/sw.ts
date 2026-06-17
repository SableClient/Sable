/* eslint-disable no-console */
/// <reference lib="WebWorker" />

/* oxlint-disable no-console, unicorn/require-post-message-target-origin */
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';

import { createPushNotifications } from './sw/pushNotification';
import {
  buildDeclarativeNotificationOptions,
  getEncryptedMinimalPushFocusDecision,
  isDeclarativeWebPushPayload,
  isMinimalPushPayload,
} from './sw/pushRouting';
import { persistLaunchContext } from './launch-context-persistence';
import { readPersistedSession } from './sw-session-persistence';
import {
  selectPersistedSessionCandidate,
  shouldClearMediaCacheAfterSessionRemoval,
} from './sw-session-state';
import {
  buildNotificationClickTargetUrl,
  didWindowClientActivationSucceed,
  rankNotificationClickClients,
  type ServiceWorkerNotificationClickData,
} from './sw-notification-click';

declare const self: ServiceWorkerGlobalScope;

let notificationSoundEnabled = true;
// Tracks whether a page client has reported itself as visible.
// The clients.matchAll() visibilityState is unreliable on iOS Safari PWA,
// so we use this explicit flag as a fallback.
let appIsVisible = false;
let appVisibleHeartbeatAt = 0;
let showMessageContent = false;
let showEncryptedMessageContent = false;
let clearNotificationsOnRead = false;
let focusMode: 'off' | 'focus' | 'dnd' = 'off';
const APP_VISIBLE_HEARTBEAT_MAX_AGE_MS = 20_000;
const { handlePushNotificationPushData } = createPushNotifications(
  self,
  () => ({
    showMessageContent,
    showEncryptedMessageContent,
  }),
  postSentryMetric
);

/** Cache key used to persist notification settings across SW restarts (iOS kills the SW frequently). */
const SW_SETTINGS_CACHE = 'sable-sw-settings-v1';
const SW_SETTINGS_URL = '/sw-settings-meta';

/** Cache key used to persist the active session so push-event fetches work after SW restart. */
const SW_SESSION_CACHE = 'sable-sw-session-v1';
const SW_SESSION_URL = '/sw-session-meta';

/** Cache key used to persist push telemetry until a window can drain it into Sentry. */
const SW_PUSH_TELEMETRY_CACHE = 'sable-sw-push-telemetry-v1';
const SW_PUSH_TELEMETRY_URL = '/sw-push-telemetry';
const SW_PUSH_TELEMETRY_LIMIT = 50;

/** Cache for authenticated Matrix media responses — keyed by URL. */
const SW_MEDIA_CACHE = 'sable-media-sw-v2';

type PushTelemetryEvent =
  | 'received'
  | 'claim_clients'
  | 'stale_focus_ignored'
  | 'shown_os'
  | 'decrypt_timeout'
  | 'fetch_fallback'
  | 'handler_error';

type PushTelemetryRecord = {
  id: string;
  event: PushTelemetryEvent;
  timestamp: number;
  data?: Record<string, string | number | boolean>;
};

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
          focusMode,
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
    if (s.focusMode === 'off' || s.focusMode === 'focus' || s.focusMode === 'dnd') {
      focusMode = s.focusMode;
    }
  } catch {
    // Ignore — stale or missing cache is fine; we fall back to defaults.
  }
}

function focusedWindowClientCount(clients: readonly Client[]): number {
  return clients.filter((client) => (client as WindowClient).focused).length;
}

function visibleWindowClientCount(clients: readonly Client[]): number {
  return clients.filter((client) => (client as WindowClient).visibilityState === 'visible').length;
}

async function persistSession(session: SessionInfo): Promise<void> {
  try {
    const cache = await self.caches.open(SW_SESSION_CACHE);
    const sessionWithTimestamp = { ...session, persistedAt: Date.now() };
    await cache.put(
      SW_SESSION_URL,
      new Response(JSON.stringify(sessionWithTimestamp), {
        headers: { 'Content-Type': 'application/json' },
      })
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
    if (response) {
      return readPersistedSession(await response.json());
    }
    return undefined;
  } catch {
    return undefined;
  }
}

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
  userId?: string;
  persistedAt?: number;
};

async function syncPersistedSessionFromLiveSessions(): Promise<void> {
  const persistedSession = selectPersistedSessionCandidate(sessions.values());
  if (persistedSession) {
    await persistSession(persistedSession);
    return;
  }

  await clearPersistedSession();
}

/**
 * Store session per client (tab)
 */
const sessions = new Map<string, SessionInfo>();

/**
 * Session pre-loaded from cache on SW activation. Acts as an immediate
 * fallback so media fetches don't 401 during the window between SW restart
 * and the first live setSession message from the page.
 * Cleared as soon as any real setSession call comes in.
 */
let preloadedSession: SessionInfo | undefined;

const clientToSessionWaiters = new Map<string, Set<(value: SessionInfo | undefined) => void>>();
const clientWithPendingSessionRequest = new Set<string>();

async function cleanupDeadClients() {
  const activeClients = await self.clients.matchAll();
  const activeIds = new Set(activeClients.map((c) => c.id));

  Array.from(sessions.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      sessions.delete(id);
      clientToSessionWaiters.delete(id);
      clientWithPendingSessionRequest.delete(id);
    }
  });
}

function setSession(clientId: string, accessToken: unknown, baseUrl: unknown, userId?: unknown) {
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    // Only clear the media cache when the token actually changes (new account or
    // token rotation). Normal page reloads with the same token should keep the
    // cache intact so cached images survive reload without re-downloading.
    const isSameToken =
      preloadedSession?.accessToken === accessToken ||
      [...sessions.values()].some((s) => s.accessToken === accessToken);

    const info: SessionInfo = {
      accessToken,
      baseUrl,
      userId: typeof userId === 'string' ? userId : undefined,
    };
    sessions.set(clientId, info);
    // A real session has arrived — discard the preloaded fallback.
    preloadedSession = undefined;
    console.debug('[SW] setSession: stored', clientId, baseUrl);
    // Persist so push-event fetches work after iOS restarts the SW.
    persistSession(info).catch(() => undefined);
    // Clear media cache only when the access token changes (login as different
    // account, or token rotation) to avoid serving content from the wrong session.
    if (!isSameToken) {
      self.caches.delete(SW_MEDIA_CACHE).catch(() => undefined);
    }
  } else {
    // Logout or invalid session
    const removedSession = sessions.get(clientId) ?? preloadedSession;
    sessions.delete(clientId);
    preloadedSession = undefined;
    console.debug('[SW] setSession: removed', clientId);
    syncPersistedSessionFromLiveSessions().catch(() => undefined);
    if (shouldClearMediaCacheAfterSessionRemoval(removedSession?.accessToken, sessions.values())) {
      self.caches.delete(SW_MEDIA_CACHE).catch(() => undefined);
    }
  }

  const resolveSessionWaiters = clientToSessionWaiters.get(clientId);
  if (resolveSessionWaiters) {
    const session = sessions.get(clientId);
    resolveSessionWaiters.forEach((resolveSession) => resolveSession(session));
    clientToSessionWaiters.delete(clientId);
    clientWithPendingSessionRequest.delete(clientId);
  }
}

function requestSession(client: Client): {
  promise: Promise<SessionInfo | undefined>;
  cancel: () => void;
} {
  let active = true;
  let resolveWaiter: ((value: SessionInfo | undefined) => void) | undefined;

  const promise = new Promise<SessionInfo | undefined>((resolve) => {
    resolveWaiter = (value) => {
      if (!active) return;
      active = false;
      resolve(value);
    };

    const waiters = clientToSessionWaiters.get(client.id) ?? new Set();
    waiters.add(resolveWaiter);
    clientToSessionWaiters.set(client.id, waiters);

    if (!clientWithPendingSessionRequest.has(client.id)) {
      clientWithPendingSessionRequest.add(client.id);
      client.postMessage({ type: 'requestSession' });
    }
  });

  return {
    promise,
    cancel: () => {
      if (!active || !resolveWaiter) return;
      active = false;

      const waiters = clientToSessionWaiters.get(client.id);
      if (!waiters) return;

      waiters.delete(resolveWaiter);
      if (waiters.size === 0) {
        clientToSessionWaiters.delete(client.id);
        clientWithPendingSessionRequest.delete(client.id);
      }
    },
  };
}

async function requestSessionWithTimeout(
  clientId: string,
  timeoutMs = 3000,
  options?: { logTimeout?: boolean }
): Promise<SessionInfo | undefined> {
  const client = await self.clients.get(clientId);
  if (!client) {
    console.warn('[SW] requestSessionWithTimeout: client not found', clientId);
    return undefined;
  }

  const { promise: sessionPromise, cancel: cancelSessionRequest } = requestSession(client);
  const { logTimeout = true } = options ?? {};

  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      console.warn('[SW] requestSessionWithTimeout: timed out after', timeoutMs, 'ms', clientId);
      cancelSessionRequest();
      if (logTimeout) {
        postSentryBreadcrumb(
          'service_worker.session',
          'Session request to client timed out',
          'warning',
          {
            timeoutMs,
          }
        ).catch(() => undefined);
        postSentryMetric('sable.sw.session_request_timeout', 1, {
          timeout_ms: timeoutMs,
        }).catch(() => undefined);
      }
      resolve(undefined);
    }, timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]);
}

async function postSentryMetric(
  metricName: string,
  value: number,
  attributes?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    const windowClients = await self.clients.matchAll({ type: 'window' });
    windowClients.forEach((client) => {
      client.postMessage({
        type: 'sentryMetric',
        metricName,
        value,
        attributes,
      });
    });
  } catch (error) {
    console.debug('[SW] Failed to post Sentry metric:', error);
  }
}

async function postSentryBreadcrumb(
  category: string,
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, string | number | boolean | undefined>
): Promise<void> {
  try {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    windowClients.forEach((client) => {
      client.postMessage({
        type: 'sentryBreadcrumb',
        category,
        message,
        level,
        data,
      });
    });
  } catch (error) {
    console.debug('[SW] Failed to post Sentry breadcrumb:', error);
  }
}

const createRecordId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function readPushTelemetryRecords(): Promise<PushTelemetryRecord[]> {
  try {
    const cache = await self.caches.open(SW_PUSH_TELEMETRY_CACHE);
    const response = await cache.match(SW_PUSH_TELEMETRY_URL);
    if (!response) return [];
    const records = await response.json();
    return Array.isArray(records) ? (records as PushTelemetryRecord[]) : [];
  } catch {
    return [];
  }
}

async function writePushTelemetryRecords(records: PushTelemetryRecord[]): Promise<void> {
  try {
    const cache = await self.caches.open(SW_PUSH_TELEMETRY_CACHE);
    await cache.put(
      SW_PUSH_TELEMETRY_URL,
      new Response(JSON.stringify(records.slice(-SW_PUSH_TELEMETRY_LIMIT)), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch {
    // Telemetry must never affect push delivery.
  }
}

async function recordPushTelemetry(
  event: PushTelemetryEvent,
  data?: Record<string, string | number | boolean>
): Promise<void> {
  const records = await readPushTelemetryRecords();
  records.push({
    id: createRecordId('push'),
    event,
    timestamp: Date.now(),
    data,
  });
  await writePushTelemetryRecords(records);
}

async function drainPushTelemetryRecords(): Promise<PushTelemetryRecord[]> {
  const records = await readPushTelemetryRecords();
  if (records.length === 0) return [];
  await writePushTelemetryRecords([]);
  return records;
}

function pushTelemetryPayloadType(pushData: unknown): string {
  if (isDeclarativeWebPushPayload(pushData)) return 'declarative';
  return isMinimalPushPayload(pushData) ? 'minimal' : 'full';
}

// ---------------------------------------------------------------------------
// Strategy 7+: Additional Cache Priming
// ---------------------------------------------------------------------------

/**
 * Prefetch well-known Matrix client configuration.
 * This endpoint is frequently requested and safe to cache aggressively.
 * Tracks success/failure and timing via Sentry metrics.
 */
async function prefetchWellKnown(session: SessionInfo): Promise<void> {
  const startTime = performance.now();
  try {
    const baseUrl = new URL(session.baseUrl);
    const wellKnownUrl = `${baseUrl.origin}/.well-known/matrix/client`;

    console.debug('[SW] Prefetching well-known...');
    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const duration = performance.now() - startTime;
    if (response.ok) {
      console.debug('[SW] Well-known prefetch succeeded');
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'well_known',
        status: 'success',
      });
    } else {
      console.debug('[SW] Well-known prefetch failed:', response.status);
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'well_known',
        status: 'error',
        http_status: String(response.status),
      });
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.debug('[SW] Well-known prefetch error:', error);
    await postSentryMetric('sable.sw.prefetch_ms', duration, {
      endpoint: 'well_known',
      status: 'exception',
    });
  }
}

/**
 * Prefetch homeserver capabilities to warm cache.
 * This is requested during client initialization.
 * Tracks success/failure and timing via Sentry metrics.
 */
async function prefetchCapabilities(session: SessionInfo): Promise<void> {
  const startTime = performance.now();
  try {
    const capabilitiesUrl = `${session.baseUrl}/_matrix/client/v3/capabilities`;

    console.debug('[SW] Prefetching capabilities...');
    const response = await fetch(capabilitiesUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
    });

    const duration = performance.now() - startTime;
    if (response.ok) {
      console.debug('[SW] Capabilities prefetch succeeded');
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'capabilities',
        status: 'success',
      });
    } else {
      console.debug('[SW] Capabilities prefetch failed:', response.status);
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'capabilities',
        status: 'error',
        http_status: String(response.status),
      });
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.debug('[SW] Capabilities prefetch error:', error);
    await postSentryMetric('sable.sw.prefetch_ms', duration, {
      endpoint: 'capabilities',
      status: 'exception',
    });
  }
}

/**
 * Prefetch user profile data (display name, avatar).
 * This is shown immediately on client load.
 * Tracks success/failure and timing via Sentry metrics.
 */
async function prefetchUserProfile(session: SessionInfo): Promise<void> {
  if (!session.userId) {
    console.debug('[SW] Cannot prefetch user profile: userId not available');
    return;
  }

  const startTime = performance.now();
  try {
    const profileUrl = `${session.baseUrl}/_matrix/client/v3/profile/${encodeURIComponent(session.userId)}`;

    console.debug('[SW] Prefetching user profile...');
    const response = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
    });

    const duration = performance.now() - startTime;
    if (response.ok) {
      console.debug('[SW] User profile prefetch succeeded');
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'user_profile',
        status: 'success',
      });
    } else {
      console.debug('[SW] User profile prefetch failed:', response.status);
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'user_profile',
        status: 'error',
        http_status: String(response.status),
      });
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.debug('[SW] User profile prefetch error:', error);
    await postSentryMetric('sable.sw.prefetch_ms', duration, {
      endpoint: 'user_profile',
      status: 'exception',
    });
  }
}

type DecryptionResult = {
  eventId: string;
  success: boolean;
  eventType?: string;
  content?: unknown;
  sender_display_name?: string;
  room_name?: string;
  visibilityState?: string;
  focused?: boolean;
};

const decryptionPendingMap = new Map<string, (result: DecryptionResult) => void>();
const notificationClickPendingMap = new Map<string, () => void>();
const SW_FETCH_RETRY_DELAYS_MS = [250, 750] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function fetchWithNetworkRetry(
  url: string,
  init: RequestInit,
  label: string,
  attempt = 0
): Promise<Response | undefined> {
  try {
    const res = await fetch(url, init);
    if (res.ok || res.status < 500 || attempt >= SW_FETCH_RETRY_DELAYS_MS.length) {
      return res;
    }
    console.warn(`[SW ${label}] HTTP ${res.status}; retrying`, { attempt });
  } catch (err) {
    if (attempt >= SW_FETCH_RETRY_DELAYS_MS.length) {
      console.warn(`[SW ${label}] network error`, err);
      return undefined;
    }
    console.warn(`[SW ${label}] network error; retrying`, { attempt, err });
  }

  const retryDelay = SW_FETCH_RETRY_DELAYS_MS[attempt];
  if (retryDelay === undefined) return undefined;
  await sleep(retryDelay);
  return fetchWithNetworkRetry(url, init, label, attempt + 1);
}

async function waitForNotificationClickHandled(
  clickId: string,
  timeoutMs = 2_500
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (handled: boolean) => {
      if (settled) return;
      settled = true;
      notificationClickPendingMap.delete(clickId);
      resolve(handled);
    };

    const timeoutId = setTimeout(() => {
      finish(false);
    }, timeoutMs);

    notificationClickPendingMap.set(clickId, () => {
      clearTimeout(timeoutId);
      finish(true);
    });
  });
}

async function fetchRawEvent(
  baseUrl: string,
  accessToken: string,
  roomId: string,
  eventId: string
): Promise<Record<string, unknown> | undefined> {
  try {
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`;
    const res = await fetchWithNetworkRetry(
      url,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      'fetchRawEvent'
    );
    if (!res) return undefined;
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
    const res = await fetchWithNetworkRetry(
      url,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      'fetchRoomName'
    );
    if (!res) return undefined;
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
    const res = await fetchWithNetworkRetry(
      url,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      'fetchMemberInfo'
    );
    if (!res) return { displayname: undefined, avatarUrl: undefined };
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
    const res = await fetchWithNetworkRetry(
      url,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      'fetchRoomAvatar'
    );
    if (!res) return undefined;
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
 * Notification icons are fetched by the OS without auth headers, so we use
 * the pre-MSC3916 media endpoint which most homeservers still serve publicly.
 */
function mxcToNotificationUrl(mxcUrl: string, baseUrl: string): string | undefined {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/([^?#]+)/);
  if (!match || !match[1] || !match[2]) return undefined;
  const [, server, mediaId] = match;
  return `${baseUrl}/_matrix/media/v3/thumbnail/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}?width=96&height=96&method=crop`;
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
 * up to 8 s for the pushDecryptResult reply.
 *
 * 8 s: iOS bfcache restores can take 5–7 s before the MatrixClient finishes
 * loading crypto keys from IDB, so 5 s was too tight.
 */
async function requestDecryptionFromClient(
  windowClients: readonly Client[],
  rawEvent: Record<string, unknown>
): Promise<DecryptionResult | undefined> {
  const eventId = rawEvent.event_id as string;

  // Chain clients sequentially using reduce to avoid await-in-loop and for-of.
  const result = await Array.from(windowClients).reduce(
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
        }, 8000);
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

  if (!result && windowClients.length > 0) {
    console.warn('[SW] All clients timed out waiting for push decryption');
  }

  return result;
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
    await postSentryBreadcrumb(
      'notification.push',
      'Minimal push payload had no persisted session; showing generic notification',
      'warning',
      { hasWindowClients: windowClients.length > 0 }
    );
    await self.registration.showNotification('New Message', {
      body: undefined,
      icon: '/public/res/logo-maskable/logo-maskable-180x180.png',
      badge: '/public/res/logo-maskable/logo-maskable-72x72.png',
      tag: `room-${roomId}`,
      renotify: true,
      data: { room_id: roomId, event_id: eventId },
    } as NotificationOptions);
    await recordPushTelemetry('fetch_fallback', {
      payload_type: 'minimal',
      reason: 'missing_session',
      has_clients: windowClients.length > 0,
    });
    await recordPushTelemetry('shown_os', { payload_type: 'minimal', fallback: true });
    return;
  }

  // Fetch the raw event, room name, and room avatar in parallel — all need only roomId.
  const [rawEvent, roomNameFromState, roomAvatarMxc] = await Promise.all([
    fetchRawEvent(session.baseUrl, session.accessToken, roomId, eventId),
    fetchRoomName(session.baseUrl, session.accessToken, roomId),
    fetchRoomAvatar(session.baseUrl, session.accessToken, roomId),
  ]);

  if (!rawEvent) {
    await postSentryBreadcrumb(
      'notification.push',
      'Failed to fetch raw event for minimal push; showing generic notification',
      'warning',
      { hasWindowClients: windowClients.length > 0 }
    );
    await self.registration.showNotification('New Message', {
      body: undefined,
      icon: '/public/res/logo-maskable/logo-maskable-180x180.png',
      badge: '/public/res/logo-maskable/logo-maskable-72x72.png',
      tag: `room-${roomId}`,
      renotify: true,
      data: { room_id: roomId, event_id: eventId, user_id: session.userId },
    } as NotificationOptions);
    await recordPushTelemetry('fetch_fallback', {
      payload_type: 'minimal',
      reason: 'raw_event_fetch_failed',
      has_clients: windowClients.length > 0,
    });
    await recordPushTelemetry('shown_os', { payload_type: 'minimal', fallback: true });
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
  };

  if (eventType === 'm.room.encrypted') {
    // Try to relay decryption to an open app tab.
    const result =
      windowClients.length > 0
        ? await requestDecryptionFromClient(windowClients, rawEvent)
        : undefined;

    // Track decryption relay results
    postSentryMetric('sable.push.decrypt_relay', 1, {
      success: result?.success ?? false,
      visibility_state: result?.visibilityState ?? 'unknown',
      has_clients: windowClients.length > 0,
      timed_out: result === undefined && windowClients.length > 0,
    }).catch(() => undefined);

    if (result === undefined && windowClients.length > 0) {
      await recordPushTelemetry('decrypt_timeout', { payload_type: 'minimal' });
    }

    const focusedClientCount = focusedWindowClientCount(windowClients);
    const browserVisibleClientCount = visibleWindowClientCount(windowClients);
    if (getEncryptedMinimalPushFocusDecision(focusedClientCount) === 'ignore_stale_focus') {
      // iOS standalone PWAs can report a bfcached/background page as focused.
      // A push event is our only reliable wake-up path in that state, so do not
      // let stale WindowClient focus suppress the OS notification.
      await recordPushTelemetry('stale_focus_ignored', {
        payload_type: 'minimal',
        focused_client_count: focusedClientCount,
        browser_visible_client_count: browserVisibleClientCount,
        visibility_state: result?.visibilityState ?? 'unknown',
      });
    }

    if (result?.success) {
      await postSentryBreadcrumb(
        'notification.push',
        'Encrypted push decrypted through window client',
        'info',
        {
          hasFocusedClient: focusedClientCount > 0,
          browserVisibleClientCount,
          visible: false,
          hasWindowClients: windowClients.length > 0,
        }
      );
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
      await recordPushTelemetry('shown_os', { payload_type: 'minimal', encrypted: true });
    } else {
      await postSentryBreadcrumb(
        'notification.push',
        'Encrypted push used fallback content',
        'warning',
        {
          timedOut: result === undefined && windowClients.length > 0,
          hasWindowClients: windowClients.length > 0,
        }
      );
      // App is frozen or fully closed — show "Encrypted message" fallback.
      await handlePushNotificationPushData({
        ...baseData,
        type: 'm.room.encrypted',
        content: {},
        sender_display_name: senderDisplay,
        room_name: resolvedRoomName,
        room_avatar_url: notificationAvatarUrl,
      });
      await recordPushTelemetry('shown_os', {
        payload_type: 'minimal',
        encrypted: true,
        fallback: true,
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
    await recordPushTelemetry('shown_os', { payload_type: 'minimal', encrypted: false });
  }
}

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      postSentryBreadcrumb('service_worker', 'Service worker install event', 'info'),
      postSentryMetric('sable.sw.install', 1),
    ])
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const activationStartedAt = performance.now();
      // Do NOT call clients.claim() here.
      //
      // Calling clients.claim() in activate evicts iOS bfcache entries: it fires
      // controllerchange on every client — including cached ones — and iOS evicts
      // any page whose SW controller changes while it is in bfcache.  On iOS PWA
      // (no browser chrome) this looks identical to a hard reload: the user sees
      // the splash screen instead of an instant restore.
      //
      // Pages detect a stale/missing controller on every foreground event
      // (pageshow[persisted] and visibilitychange→visible) and send CLAIM_CLIENTS
      // so the SW claims them lazily once they are already visible.  New page
      // navigations are automatically controlled by the active SW without an
      // explicit claim.
      await cleanupDeadClients();
      // Pre-load the persisted session into memory so that media fetches arriving
      // before the first setSession message from the page are immediately
      // authenticated. If the token is expired, the media fetch will get a 401
      // and the UI will show a retry button.
      preloadedSession = await loadPersistedSession();
      await postSentryBreadcrumb('service_worker', 'Service worker activated', 'info', {
        hasPreloadedSession: !!preloadedSession,
      });
      await postSentryMetric('sable.sw.activate_ms', performance.now() - activationStartedAt, {
        has_preloaded_session: !!preloadedSession,
      });

      // Prefetch critical non-sync data on activation to warm browser cache.
      // Sliding sync request state is owned by the foreground Matrix client.
      // Fire-and-forget: don't block activation on these optional optimizations.
      if (preloadedSession) {
        // Prefetch in parallel for maximum speed
        Promise.allSettled([
          prefetchWellKnown(preloadedSession),
          prefetchCapabilities(preloadedSession),
          prefetchUserProfile(preloadedSession),
        ]).catch(() => {
          // Silently ignore — these are best-effort optimizations
        });
      }

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
    setSession(client.id, accessToken, baseUrl, userId);
    const persisted = sessions.get(client.id);
    event.waitUntil(
      postSentryBreadcrumb('service_worker.session', 'Service worker session updated', 'info', {
        hasSession: !!persisted,
        sessionCount: sessions.size,
      })
    );
    event.waitUntil(cleanupDeadClients());
  }
  if (type === 'setAppVisible') {
    if (typeof (data as { visible?: unknown }).visible === 'boolean') {
      appIsVisible = (data as { visible: boolean }).visible;
      appVisibleHeartbeatAt = appIsVisible ? Date.now() : 0;
    }
  }
  if (type === 'CLAIM_CLIENTS') {
    // Sent by the page on pageshow[persisted] or visibilitychange→visible when it
    // detects that its SW controller is stale (e.g. after iOS killed and restarted
    // the SW while the page was in bfcache or in the foreground under memory
    // pressure).  Claiming here — after the page is visible — never evicts bfcache.
    event.waitUntil(
      (async () => {
        const claimStartedAt = performance.now();
        await self.clients.claim();
        // Re-request sessions from all newly-claimed clients to repopulate the
        // sessions Map. Fire-and-forget: responses come via setSession messages.
        const claimedClients = await self.clients.matchAll({ type: 'window' });
        claimedClients.forEach((c) => c.postMessage({ type: 'requestSession' }));
        await recordPushTelemetry('claim_clients', {
          client_count: claimedClients.length,
          duration_ms: Math.round(performance.now() - claimStartedAt),
        });
        await postSentryBreadcrumb('service_worker', 'Service worker claimed clients', 'warning', {
          claimedClientCount: claimedClients.length,
          durationMs: Math.round(performance.now() - claimStartedAt),
        });
        await postSentryMetric('sable.sw.claim_clients', 1, {
          client_count: claimedClients.length,
        });
      })()
    );
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
  if (type === 'notificationClickHandled') {
    const { clickId } = data as { clickId?: unknown };
    if (typeof clickId === 'string') {
      const handleNotificationClick = notificationClickPendingMap.get(clickId);
      if (handleNotificationClick) {
        handleNotificationClick();
      }
    }
  }
  if (type === 'drainPushTelemetry') {
    const { requestId } = data as { requestId?: unknown };
    event.waitUntil(
      (async () => {
        const records = await drainPushTelemetryRecords();
        client.postMessage({
          type: 'pushTelemetryRecords',
          requestId: typeof requestId === 'string' ? requestId : undefined,
          records,
        });
      })()
    );
  }
  if (type === 'ping') {
    event.waitUntil(Promise.resolve());
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
    const fm = (data as { focusMode?: unknown }).focusMode;
    if (fm === 'off' || fm === 'focus' || fm === 'dnd') {
      focusMode = fm;
      console.debug('[SW setNotificationSettings] focusMode updated to:', focusMode);
    }
    // Persist so settings survive SW restart (iOS kills the SW aggressively).
    event.waitUntil(persistSettings());
  }
});

const MEDIA_PATHS = [
  '/_matrix/client/v1/media/download',
  '/_matrix/client/v1/media/thumbnail',
  '/_matrix/client/v1/media/preview_url',
  '/_matrix/client/v3/media/download',
  '/_matrix/client/v3/media/thumbnail',
  '/_matrix/client/v3/media/preview_url',
  '/_matrix/client/r0/media/download',
  '/_matrix/client/r0/media/thumbnail',
  '/_matrix/client/r0/media/preview_url',
  '/_matrix/client/unstable/org.matrix.msc3916/media/download',
  '/_matrix/client/unstable/org.matrix.msc3916/media/thumbnail',
  '/_matrix/client/unstable/org.matrix.msc3916/media/preview_url',
  // Legacy unauthenticated endpoints — servers that require auth return 404/403
  // for these when no token is present, so intercept and add auth here too.
  '/_matrix/media/v3/download',
  '/_matrix/media/v3/thumbnail',
  '/_matrix/media/v3/preview_url',
  '/_matrix/media/r0/download',
  '/_matrix/media/r0/thumbnail',
  '/_matrix/media/r0/preview_url',
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

function getMatchingSessions(url: string): SessionInfo[] {
  return [...sessions.values()].filter((s) => validMediaRequest(url, s.baseUrl));
}

function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function fetchConfig(token: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'default',
  };
}

async function validateSession(session: SessionInfo): Promise<SessionInfo | undefined> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${session.baseUrl}/_matrix/client/v3/account/whoami`, {
      ...fetchConfig(session.accessToken),
      signal: controller.signal,
    });
    return response.ok ? session : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getValidatedPersistedSession(url: string): Promise<SessionInfo | undefined> {
  const persisted = await loadPersistedSession();
  const validated = persisted ? await validateSession(persisted) : undefined;
  if (validated && validMediaRequest(url, validated.baseUrl)) {
    return validated;
  }

  return undefined;
}

async function resolveFirstUsableMediaSession(
  url: string,
  liveSessionPromise: Promise<SessionInfo | undefined>,
  persistedSessionPromise: Promise<SessionInfo | undefined>
): Promise<SessionInfo | undefined> {
  const pendingSettles = [
    liveSessionPromise.then((session) => ({ session })),
    persistedSessionPromise.then((session) => ({ session })),
  ];

  const drainPendingSettles = async (
    remainingSettles: Array<Promise<{ session: SessionInfo | undefined }>>
  ): Promise<SessionInfo | undefined> => {
    if (remainingSettles.length === 0) return undefined;

    const settled = await Promise.race(
      remainingSettles.map((pending, index) =>
        pending.then((result) => ({
          index,
          result,
        }))
      )
    );

    const nextSettles = remainingSettles.filter((_, index) => index !== settled.index);
    const { session } = settled.result;
    if (session && validMediaRequest(url, session.baseUrl)) {
      return session;
    }

    return drainPendingSettles(nextSettles);
  };

  return drainPendingSettles(pendingSettles);
}

async function getLiveWindowSessions(url: string, clientId: string): Promise<SessionInfo[]> {
  const collected: SessionInfo[] = [];
  const seen = new Set<string>();

  const add = (session?: SessionInfo) => {
    if (!session || !validMediaRequest(url, session.baseUrl)) return;
    const key = `${session.baseUrl}\x00${session.accessToken}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push(session);
  };

  if (clientId) {
    add(await requestSessionWithTimeout(clientId, 1500));
    return collected;
  }

  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const liveSessions = await Promise.all(
    windowClients.map((client) => requestSessionWithTimeout(client.id, 750))
  );
  liveSessions.forEach((session) => add(session));

  return collected;
}

async function fetchMediaWithRetry(
  url: string,
  token: string,
  redirect: RequestRedirect,
  clientId: string,
  preferredRetrySessions: Array<SessionInfo | Promise<SessionInfo | undefined> | undefined> = []
): Promise<Response> {
  let response = await fetch(url, { ...fetchConfig(token), redirect });
  if (!isAuthFailureStatus(response.status)) return response;

  const attemptedTokens = new Set<string>([token]);
  const retrySessions: SessionInfo[] = [];
  const seenSessions = new Set<string>();

  const addRetrySession = (session?: SessionInfo) => {
    if (!session || !validMediaRequest(url, session.baseUrl)) return;
    const key = `${session.baseUrl}\x00${session.accessToken}`;
    if (seenSessions.has(key)) return;
    seenSessions.add(key);
    retrySessions.push(session);
  };

  if (clientId) addRetrySession(sessions.get(clientId));
  getMatchingSessions(url).forEach((session) => addRetrySession(session));
  addRetrySession(preloadedSession);
  addRetrySession(await loadPersistedSession());
  (await Promise.all(preferredRetrySessions.map((session) => Promise.resolve(session)))).forEach(
    (session) => addRetrySession(session)
  );
  (await getLiveWindowSessions(url, clientId)).forEach((session) => addRetrySession(session));

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < retrySessions.length; i += 1) {
    const candidate = retrySessions[i];
    if (candidate && !attemptedTokens.has(candidate.accessToken)) {
      attemptedTokens.add(candidate.accessToken);
      response = await fetch(url, { ...fetchConfig(candidate.accessToken), redirect });
      if (!isAuthFailureStatus(response.status)) {
        return response;
      }
    }
  }
  /* eslint-enable no-await-in-loop */

  return response;
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data.type === 'SKIP_WAITING') {
    // Client requested the waiting SW to activate immediately (user clicked update banner)
    self.skipWaiting();
    return;
  }

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

// Asset validation: prevent caching HTML responses for JavaScript/CSS assets.
// After a new deployment, stale HTML might reference old hashed asset URLs that
// no longer exist. The server returns a 404 HTML page, which Safari refuses to
// execute as JavaScript, causing "text/html is not a valid JavaScript MIME type"
// errors. This handler validates asset responses and deletes bad cache entries.
self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;
  const parsedUrl = new URL(url);

  // Skip audio files — let them pass through without validation
  const isAudio =
    parsedUrl.pathname.endsWith('.ogg') ||
    parsedUrl.pathname.endsWith('.mp3') ||
    parsedUrl.pathname.endsWith('.webm') ||
    parsedUrl.pathname.endsWith('.wav');

  // Only intercept GET requests to /assets/ paths (but not audio files)
  if (method !== 'GET' || !parsedUrl.pathname.startsWith('/assets/') || isAudio) return;

  event.respondWith(
    (async () => {
      const cache = await self.caches.open('workbox-precache-v2-' + self.registration.scope);

      // Try cache first (workbox precache strategy)
      let response = await cache.match(event.request);

      if (!response) {
        // Not in cache, fetch from network
        try {
          response = await fetch(event.request);
        } catch (networkError) {
          // Network error - try returning cached version if it exists
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) return cachedResponse;
          throw networkError;
        }
      }

      // Validate response before using/caching it
      const contentType = response.headers.get('content-type') || '';
      const isJavaScript =
        parsedUrl.pathname.endsWith('.js') || parsedUrl.pathname.endsWith('.mjs');
      const isCSS = parsedUrl.pathname.endsWith('.css');
      const isWASM = parsedUrl.pathname.endsWith('.wasm');

      // Check if response is valid for the requested asset type
      const isValidResponse =
        response.ok &&
        response.status >= 200 &&
        response.status < 300 &&
        !contentType.includes('text/html');

      // Additional MIME type validation for specific asset types
      const hasValidMimeType =
        (isJavaScript &&
          (contentType.includes('javascript') || contentType.includes('ecmascript'))) ||
        (isCSS && contentType.includes('css')) ||
        (isWASM && contentType.includes('wasm')) ||
        (!isJavaScript && !isCSS && !isWASM);

      if (!isValidResponse || !hasValidMimeType) {
        // Invalid response (likely a 404 HTML page) - delete from cache
        await cache.delete(event.request);

        console.warn(
          '[SW] Deleted invalid asset cache entry:',
          parsedUrl.pathname,
          'status:',
          response.status,
          'content-type:',
          contentType
        );

        // Return a synthetic error response
        return new Response('Asset not available', {
          status: 404,
          statusText: 'Asset Not Found',
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // Valid response - cache it if it came from the network
      if (response && !response.redirected) {
        await cache.put(event.request, response.clone());
      }

      return response;
    })()
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;
  const redirect: RequestRedirect = 'follow';

  // Fast path: active session for this window
  const session = clientId ? sessions.get(clientId) : undefined;
  if (session && validMediaRequest(url, session.baseUrl)) {
    event.respondWith(fetchMediaWithRetry(url, session.accessToken, redirect, clientId));
    return;
  }

  // Widget fast path: match by baseUrl (Element Call, etc)
  // Since widgets like Element Call have their own client ids, we need to find
  // a session that matches the homeserver. Media requests to a homeserver work
  // with any authenticated account on that homeserver.
  const byBaseUrl = [...sessions.values()].find((s) => validMediaRequest(url, s.baseUrl));
  if (byBaseUrl) {
    event.respondWith(fetchMediaWithRetry(url, byBaseUrl.accessToken, redirect, clientId));
    return;
  }

  // No clientId: the fetch came from a context not associated with a specific
  // window (e.g. a prerender). Fall back to the persisted session directly.
  if (!clientId) {
    event.respondWith(
      loadPersistedSession().then((persisted) => {
        if (persisted && validMediaRequest(url, persisted.baseUrl)) {
          return fetchMediaWithRetry(url, persisted.accessToken, redirect, '');
        }
        const matching = getMatchingSessions(url);
        const [matchingSession] = matching;
        if (matching.length === 1 && matchingSession) {
          return fetchMediaWithRetry(url, matchingSession.accessToken, redirect, '');
        }
        if (preloadedSession && validMediaRequest(url, preloadedSession.baseUrl)) {
          return fetchMediaWithRetry(url, preloadedSession.accessToken, redirect, '');
        }
        return fetch(event.request);
      })
    );
    return;
  }

  const syncByBaseUrl = getMatchingSessions(url);
  const [syncSession] = syncByBaseUrl;
  if (syncByBaseUrl.length === 1 && syncSession) {
    event.respondWith(fetchMediaWithRetry(url, syncSession.accessToken, redirect, clientId));
    return;
  }
  if (preloadedSession && validMediaRequest(url, preloadedSession.baseUrl)) {
    event.respondWith(fetchMediaWithRetry(url, preloadedSession.accessToken, redirect, clientId));
    return;
  }

  event.respondWith(
    // Wrap the entire chain in a global timeout to prevent infinite hangs.
    // Even though requestSessionWithTimeout has its own 10s timeout, edge cases
    // (e.g., loadPersistedSession hanging on IDB, validateSession stuck) could
    // leave the fetch hanging indefinitely. 15s is generous enough to allow all
    // fallbacks to complete, but short enough to fail fast if something is stuck.
    Promise.race([
      (async () => {
        const liveSessionPromise = requestSessionWithTimeout(clientId, 3000, {
          logTimeout: false,
        });
        const persistedSessionPromise = getValidatedPersistedSession(url);

        const resolvedSession =
          (await resolveFirstUsableMediaSession(
            url,
            liveSessionPromise,
            persistedSessionPromise
          )) ??
          (await liveSessionPromise) ??
          (await persistedSessionPromise);

        if (resolvedSession && validMediaRequest(url, resolvedSession.baseUrl)) {
          if (resolvedSession === preloadedSession) {
            console.debug('[SW fetch] Using preloaded session fallback', { url, clientId });
          } else if (resolvedSession !== sessions.get(clientId)) {
            console.debug('[SW fetch] Using validated persisted session fallback', {
              url,
              clientId,
            });
          }
          return fetchMediaWithRetry(url, resolvedSession.accessToken, redirect, clientId, [
            liveSessionPromise,
          ]);
        }

        await postSentryBreadcrumb(
          'service_worker.session',
          'Session request to client timed out',
          'warning',
          {
            timeoutMs: 3000,
            usedPersistedFallback: false,
          }
        ).catch(() => undefined);
        await postSentryMetric('sable.sw.session_request_timeout', 1, {
          timeout_ms: 3000,
          used_persisted_fallback: false,
        }).catch(() => undefined);

        console.warn('[SW fetch] No valid session for media request — returning 401', {
          url,
          clientId,
          hasSession: !!sessions.get(clientId),
        });
        // SABLE-4Y fix: Return synthetic 401 instead of attempting unauthenticated
        // fetch. Prevents network requests that will fail with 401 anyway, and
        // allows client-side blob cache to handle auth failures gracefully.
        return new Response(
          JSON.stringify({ errcode: 'M_MISSING_TOKEN', error: 'No session available' }),
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })(),
      new Promise<Response>((_, reject) => {
        setTimeout(() => {
          console.error('[SW fetch] Global timeout after 15s — SW may be stuck', { url, clientId });
          reject(new Error('Service worker media fetch timeout'));
        }, 15000);
      }),
    ])
  );
});

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

  const focusedClientCount = focusedWindowClientCount(clients);
  const browserVisibleClientCount = visibleWindowClientCount(clients);
  const hasRecentAppVisibilityHeartbeat =
    appIsVisible && Date.now() - appVisibleHeartbeatAt <= APP_VISIBLE_HEARTBEAT_MAX_AGE_MS;
  const hasVisibleClient = hasRecentAppVisibilityHeartbeat || browserVisibleClientCount > 0;

  console.debug(
    '[SW push] appIsVisible:',
    appIsVisible,
    '| hasRecentAppVisibilityHeartbeat:',
    hasRecentAppVisibilityHeartbeat,
    '| focusedClientCount:',
    focusedClientCount,
    '| browserVisibleClientCount:',
    browserVisibleClientCount,
    '| clients:',
    clients.map((c) => ({
      url: c.url,
      visibility: c.visibilityState,
      focused: c.focused,
    }))
  );
  console.debug('[SW push] hasVisibleClient:', hasVisibleClient);

  if (hasVisibleClient) {
    console.debug('[SW push] suppressing OS notification — app is visible');
    return;
  }

  const pushData = event.data.json();
  const payloadType = pushTelemetryPayloadType(pushData);
  console.debug('[SW push] raw payload:', JSON.stringify(pushData, null, 2));

  // Track push notification arrival
  await recordPushTelemetry('received', {
    has_clients: clients.length > 0,
    focused_client_count: focusedClientCount,
    browser_visible_client_count: browserVisibleClientCount,
    payload_type: payloadType,
  });
  postSentryMetric('sable.push.received', 1, {
    has_clients: clients.length > 0,
    focused_client_count: focusedClientCount,
    browser_visible_client_count: browserVisibleClientCount,
    payload_type: payloadType,
  }).catch(() => undefined);
  postSentryBreadcrumb('notification.push', 'Push received by service worker', 'info', {
    clientCount: clients.length,
    focusedClientCount,
    browserVisibleClientCount,
    payloadType,
  }).catch(() => undefined);

  try {
    const declarativeBadge =
      isDeclarativeWebPushPayload(pushData) && pushData.notification.app_badge !== undefined
        ? Number(pushData.notification.app_badge)
        : undefined;
    if (typeof declarativeBadge === 'number' && Number.isFinite(declarativeBadge)) {
      if (declarativeBadge <= 0) {
        await (
          self.navigator as unknown as { clearAppBadge?: () => Promise<void> }
        ).clearAppBadge?.();
      } else {
        await (
          self.navigator as unknown as { setAppBadge?: (count: number) => Promise<void> }
        ).setAppBadge?.(declarativeBadge);
      }
    } else if (typeof pushData?.unread === 'number') {
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

  if (isDeclarativeWebPushPayload(pushData)) {
    const { title, options } = buildDeclarativeNotificationOptions(pushData);
    await self.registration.showNotification(title, options);
    await recordPushTelemetry('shown_os', { payload_type: 'declarative' });
    return;
  }

  // event_id_only format: fetch the event ourselves and (for E2EE rooms) try
  // to relay decryption to an open app tab.
  if (isMinimalPushPayload(pushData)) {
    console.debug('[SW push] minimal payload detected — fetching event', pushData.event_id);
    await handleMinimalPushPayload(pushData.room_id, pushData.event_id, clients);
    return;
  }

  await handlePushNotificationPushData(pushData);
  await recordPushTelemetry('shown_os', { payload_type: 'full' });
};

// ---------------------------------------------------------------------------
// Push handler
// ---------------------------------------------------------------------------

self.addEventListener('push', (event: PushEvent) =>
  event.waitUntil(
    onPushNotification(event).catch(async (error: unknown) => {
      await recordPushTelemetry('handler_error', {
        error_type: error instanceof Error ? error.name : 'unknown',
      });
      await postSentryBreadcrumb('notification.push', 'Push handler failed', 'error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
  )
);

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const { data } = event.notification as Notification & {
    data?: ServiceWorkerNotificationClickData;
  };
  const { scope } = self.registration;

  const pushUserId: string | undefined = data?.user_id ?? undefined;
  const pushRoomId: string | undefined = data?.room_id ?? undefined;
  const pushEventId: string | undefined = data?.event_id ?? undefined;
  const pushNavigate: string | undefined =
    typeof data?.navigate === 'string' ? data.navigate : undefined;
  const isInvite = data?.content?.membership === 'invite';

  console.debug('[SW notificationclick] notification data:', JSON.stringify(data, null, 2));
  console.debug('[SW notificationclick] resolved fields:', {
    pushUserId,
    pushRoomId,
    pushEventId,
    pushNavigate,
    isInvite,
    scope,
  });

  const isCall = data?.isCall === true;

  const targetUrl = buildNotificationClickTargetUrl(scope, data ?? {});

  console.debug('[SW notificationclick] targetUrl:', targetUrl);
  postSentryBreadcrumb(
    'notification.click',
    'Notification click received by service worker',
    'info',
    {
      hasUserId: !!pushUserId,
      hasRoomId: !!pushRoomId,
      hasEventId: !!pushEventId,
      isInvite,
      isCall,
    }
  ).catch(() => undefined);
  postSentryMetric('sable.notification.clicked', 1, {
    has_user_id: !!pushUserId,
    has_room_id: !!pushRoomId,
    is_invite: isInvite,
    is_call: isCall,
  }).catch(() => undefined);

  event.waitUntil(
    (async () => {
      await persistLaunchContext({
        source: 'notification_click',
        clickedAt: Date.now(),
        userId: pushUserId,
        roomId: pushRoomId,
        eventId: pushEventId,
        targetUrl,
      }).catch(() => undefined);

      const clientList = (await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })) as WindowClient[];
      const rankedClients = rankNotificationClickClients(clientList, scope);

      console.debug(
        '[SW notificationclick] window clients:',
        rankedClients.map((c) => ({
          url: c.url,
          visibility: c.visibilityState,
          focused: c.focused,
        }))
      );

      for (const wc of rankedClients) {
        console.debug('[SW notificationclick] postMessage to existing client:', wc.url);
        try {
          const clickId = createRecordId('notification-click');

          wc.postMessage({
            type: 'notificationClick',
            clickId,
            targetUrl,
            userId: pushUserId,
            roomId: pushRoomId,
            eventId: pushEventId,
            navigate: pushNavigate,
            isInvite,
            isCall,
          });

          // Give already-live clients a chance to route without forcing a reload.
          // This preserves in-app account switching and room-restore behavior when
          // the handler is ready, but still falls back if the message is dropped.
          // oxlint-disable-next-line no-await-in-loop
          const focusedClient = await wc.focus();
          const handledByLiveClient =
            didWindowClientActivationSucceed(focusedClient) &&
            // oxlint-disable-next-line no-await-in-loop
            (await waitForNotificationClickHandled(clickId));
          if (handledByLiveClient) {
            return;
          }

          if (typeof wc.navigate === 'function') {
            // oxlint-disable-next-line no-await-in-loop
            const navigatedClient = await wc.navigate(targetUrl);
            if (!didWindowClientActivationSucceed(navigatedClient)) {
              continue;
            }
            // oxlint-disable-next-line no-await-in-loop
            const refocusedClient = await navigatedClient.focus();
            if (!didWindowClientActivationSucceed(refocusedClient)) {
              continue;
            }
            return;
          }
        } catch (err) {
          console.debug('[SW notificationclick] postMessage/focus failed:', err);
          postSentryBreadcrumb(
            'notification.click',
            'Failed to focus existing notification client',
            'warning',
            {
              error: err instanceof Error ? err.message : String(err),
            }
          ).catch(() => undefined);
        }
      }

      // No existing window clients — open a new window.
      // ToRoomEvent handles the /to/ URL on cold launch (account switch + pending atom).
      console.debug('[SW notificationclick] falling back to openWindow()', targetUrl);
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
        await postSentryBreadcrumb(
          'notification.click',
          'Opened new window for notification click',
          'info'
        );
      }
    })()
  );
});

precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

// SABLE-5G: Catch-all fetch handler for navigation requests
// Handles FetchEvent.respondWith errors when precached assets fail to load
// (e.g., right after SW update when old cached URLs are being cleaned up).
// Falls back to serving cached index.html for navigation requests.
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  // Only handle navigation requests (document loads)
  if (request.mode !== 'navigate') {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Try network first
        return await fetch(request);
      } catch (fetchError) {
        console.debug('[SW fetch fallback] Network fetch failed, trying cache:', fetchError);
        // Network failed, try to serve cached index.html
        try {
          const cachedResponse = await matchPrecache('/index.html');
          if (cachedResponse) {
            console.debug('[SW fetch fallback] Serving cached index.html');
            return cachedResponse;
          }
        } catch (cacheError) {
          console.error('[SW fetch fallback] Failed to serve cached index.html:', cacheError);
        }
        // Both network and cache failed, rethrow original error
        throw fetchError;
      }
    })()
  );
});
