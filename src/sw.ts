/* eslint-disable no-console */
/// <reference lib="WebWorker" />

/* oxlint-disable no-console, unicorn/require-post-message-target-origin */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

import { createPushNotifications } from './sw/pushNotification';
import { readPersistedSession } from './sw-session-persistence';

declare const self: ServiceWorkerGlobalScope;

let notificationSoundEnabled = true;
// Tracks whether a page client has reported itself as visible.
// The clients.matchAll() visibilityState is unreliable on iOS Safari PWA,
// so we use this explicit flag as a fallback.
let appIsVisible = false;
// Tracks whether the Matrix sync connection is healthy.
// Defaults to true; set false when the app reports Reconnecting/Error so that
// OS push notifications are not suppressed while the in-app path is broken.
let syncIsHealthy = true;
let showMessageContent = false;
let showEncryptedMessageContent = false;
let clearNotificationsOnRead = false;
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

/** Cache for authenticated Matrix media responses — keyed by URL. */
const SW_MEDIA_CACHE = 'sable-media-sw-v2';

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
          // Persist when the app was last visible so cold-SW-restart suppression works on iOS/iPad.
          // A timestamp lets us expire stale entries (app may have closed without sending false).
          appVisibleAt: appIsVisible ? Date.now() : 0,
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
    if (s.focusMode === 'off' || s.focusMode === 'focus' || s.focusMode === 'dnd')
      focusMode = s.focusMode;
    // Restore appIsVisible from the last-known visibility timestamp.
    // On iOS/iPad, the SW is killed between pushes so appIsVisible always resets to false.
    // If the app reported itself visible within the last 2 s, trust that it still is.
    // Use a very short window (2s) to only catch rapid SW restarts during active use,
    // not when the phone has been locked for a few seconds.
    // The page will send an explicit visible=true message once it initializes anyway.
    if (typeof s.appVisibleAt === 'number' && s.appVisibleAt > 0) {
      const ageMs = Date.now() - s.appVisibleAt;
      if (ageMs < 2_000) {
        appIsVisible = true;
        console.debug('[SW] Restored appIsVisible from cache (age:', ageMs, 'ms)');
      }
    }
  } catch {
    // Ignore — stale or missing cache is fine; we fall back to defaults.
  }
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
  /** Matrix user ID of the account, used to identify which account a push belongs to. */
  userId?: string;
  /** Timestamp when this session was persisted to cache. */
  persistedAt?: number;
};

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

async function cleanupDeadClients() {
  const activeClients = await self.clients.matchAll();
  const activeIds = new Set(activeClients.map((c) => c.id));

  Array.from(sessions.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      sessions.delete(id);
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
    sessions.delete(clientId);
    preloadedSession = undefined;
    console.debug('[SW] setSession: removed', clientId);
    clearPersistedSession().catch(() => undefined);
    // Clear media cache on logout.
    self.caches.delete(SW_MEDIA_CACHE).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Strategy 7: Sliding Sync Prefetch
// ---------------------------------------------------------------------------

/**
 * Post a Sentry metric to all window clients.
 * Used to track SW prefetch performance from the main thread.
 */
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

/**
 * Prefetch sliding sync data on SW activation to warm the browser's HTTP cache.
 * This makes the first sync response arrive faster when the app opens.
 * Tracks success/failure and timing via Sentry metrics.
 */
async function prefetchSlidingSyncData(session: SessionInfo): Promise<void> {
  const startTime = performance.now();
  try {
    // Determine sliding sync proxy URL from homeserver base URL
    const proxyUrl = new URL(session.baseUrl);
    // Most deployments use /sliding-sync on the same server
    // or a well-known sliding sync proxy endpoint
    const slidingSyncEndpoint = `${proxyUrl.origin}/_matrix/client/unstable/org.matrix.msc3575/sync`;

    // Minimal sliding sync request to fetch recent rooms
    const requestBody = {
      lists: {
        joined: {
          ranges: [[0, 99]], // First 100 rooms
          sort: ['by_recency', 'by_name'],
          timeline_limit: 1, // Minimal timeline to keep response small
          required_state: [
            ['m.room.name', ''],
            ['m.room.avatar', ''],
            ['m.room.encryption', ''],
          ],
          slow_get_all_rooms: false,
        },
      },
    };

    console.debug('[SW] Prefetching sliding sync data...');
    const response = await fetch(slidingSyncEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const duration = performance.now() - startTime;
    if (response.ok) {
      console.debug('[SW] Sliding sync prefetch succeeded');
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'sliding_sync',
        status: 'success',
      });
    } else {
      console.debug('[SW] Sliding sync prefetch failed:', response.status);
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'sliding_sync',
        status: 'error',
        http_status: String(response.status),
      });
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.debug('[SW] Sliding sync prefetch error:', error);
    await postSentryMetric('sable.sw.prefetch_ms', duration, {
      endpoint: 'sliding_sync',
      status: 'exception',
    });
  }
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

// ---------------------------------------------------------------------------
// Strategy 7: Sliding Sync Prefetch
// ---------------------------------------------------------------------------

/**
 * Post a Sentry metric to all window clients.
 * Used to track SW prefetch performance from the main thread.
 */
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

/**
 * Prefetch sliding sync data on SW activation to warm the browser's HTTP cache.
 * This makes the first sync response arrive faster when the app opens.
 * Tracks success/failure and timing via Sentry metrics.
 */
async function prefetchSlidingSyncData(session: SessionInfo): Promise<void> {
  const startTime = performance.now();
  try {
    // Determine sliding sync proxy URL from homeserver base URL
    const proxyUrl = new URL(session.baseUrl);
    // Most deployments use /sliding-sync on the same server
    // or a well-known sliding sync proxy endpoint
    const slidingSyncEndpoint = `${proxyUrl.origin}/_matrix/client/unstable/org.matrix.msc3575/sync`;

    // Minimal sliding sync request to fetch recent rooms
    const requestBody = {
      lists: {
        joined: {
          ranges: [[0, 99]], // First 100 rooms
          sort: ['by_recency', 'by_name'],
          timeline_limit: 1, // Minimal timeline to keep response small
          required_state: [
            ['m.room.name', ''],
            ['m.room.avatar', ''],
            ['m.room.encryption', ''],
          ],
          slow_get_all_rooms: false,
        },
      },
    };

    console.debug('[SW] Prefetching sliding sync data...');
    const response = await fetch(slidingSyncEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const duration = performance.now() - startTime;
    if (response.ok) {
      console.debug('[SW] Sliding sync prefetch succeeded');
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'sliding_sync',
        status: 'success',
      });
    } else {
      console.debug('[SW] Sliding sync prefetch failed:', response.status);
      await postSentryMetric('sable.sw.prefetch_ms', duration, {
        endpoint: 'sliding_sync',
        status: 'error',
        http_status: String(response.status),
      });
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.debug('[SW] Sliding sync prefetch error:', error);
    await postSentryMetric('sable.sw.prefetch_ms', duration, {
      endpoint: 'sliding_sync',
      status: 'exception',
    });
  }
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

  // If all clients timed out, the page is likely crashed/unresponsive.
  // Mark appIsVisible=false and persist so future push notifications aren't
  // suppressed by a stale appVisibleAt timestamp in the cache.
  if (!result && windowClients.length > 0) {
    console.warn('[SW] All clients timed out — marking app as not visible');
    appIsVisible = false;
    persistSettings().catch(() => undefined);
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
      app_visible: result?.visibilityState === 'visible',
      has_clients: windowClients.length > 0,
      timed_out: result === undefined && windowClients.length > 0,
    }).catch(() => undefined);

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

      // Strategy 7: Prefetch sliding sync data on activation (warm cache scenario).
      // This makes the first sync response arrive faster when the app opens.
      // Fire-and-forget: don't block activation on this optional optimization.
      if (preloadedSession) {
        prefetchSlidingSyncData(preloadedSession).catch(() => {
          // Silently ignore — this is a best-effort optimization
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
      (persisted ? persistSession(persisted) : clearPersistedSession()).catch(() => undefined)
    );
    event.waitUntil(cleanupDeadClients());
  }
  if (type === 'CLAIM_CLIENTS') {
    // Sent by the page on pageshow[persisted] or visibilitychange→visible when it
    // detects that its SW controller is stale (e.g. after iOS killed and restarted
    // the SW while the page was in bfcache or in the foreground under memory
    // pressure).  Claiming here — after the page is visible — never evicts bfcache.
    event.waitUntil(
      (async () => {
        await self.clients.claim();
        // Re-request sessions from all newly-claimed clients to repopulate the
        // sessions Map. Fire-and-forget: responses come via setSession messages.
        const claimedClients = await self.clients.matchAll({ type: 'window' });
        claimedClients.forEach((c) => c.postMessage({ type: 'requestSession' }));
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
  if (type === 'setAppVisible') {
    if (typeof (data as { visible?: unknown }).visible === 'boolean') {
      appIsVisible = (data as { visible: boolean }).visible;
      // Persist the visibility timestamp so cold SW restarts (iOS/iPad) can still
      // suppress duplicate OS notifications when the app was recently visible.
      // Equally important: when the app goes to background (visible=false), this
      // clears appVisibleAt so the next cold SW restart won't falsely restore
      // appIsVisible=true from a stale cache entry.
      event.waitUntil(persistSettings());
    }
  }
  if (type === 'setSyncState') {
    if (typeof (data as { healthy?: unknown }).healthy === 'boolean') {
      syncIsHealthy = (data as { healthy: boolean }).healthy;
    }
  }
  if (type === 'ping') {
    // iOS terminates SWs after ~30 s of inactivity. The page sends a ping every
    // 20 s; receiving the message itself resets the SW idle timer. A long-running
    // waitUntil promise (e.g. a 25 s setTimeout) is harmful on iOS: backgrounded
    // pages freeze timers, leaving a perpetually-pending waitUntil that causes an
    // ungraceful IDB teardown when iOS force-kills the SW, losing crypto keys.
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
  clientId: string
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

/**
 * Fetch a Matrix media URL with auth injection and persistent caching.
 *
 * Strategy: cache-first for normal requests (Matrix media is immutable by
 * content address — the media ID never changes for a given file).
 * Requests with `cache: 'no-cache'` or `'no-store'` bypass the cache lookup
 * and always go to the network — this preserves the intent of downloadMedia()
 * which sets `no-cache` so retries always fetch fresh bytes.
 *
 * 1. For cacheable requests: return the cached response if available.
 * 2. Fetch with Bearer auth; fall back to unauthenticated on network error.
 * 3. Store successful responses in SW_MEDIA_CACHE only when:
 *    - The content-type is `image/*` (skip encrypted blobs, video, audio, etc.)
 *    - AND the original request was NOT `no-cache`/`no-store` — encrypted images
 *      are uploaded with the original file's MIME type (e.g. image/jpeg) even
 *      though the bytes are ciphertext, so caching them under the image URL would
 *      serve garbage to any future <img> tag. downloadMedia() always uses
 *      `no-cache`, so these encrypted bytes are never stored.
 */
async function handleMediaFetch(
  url: string,
  session: SessionInfo,
  fallbackRequest: Request
): Promise<Response> {
  const redirect: RequestRedirect = 'follow';

  // `no-cache` / `no-store` — skip the cache and always hit the network.
  // downloadMedia() uses `no-cache` so retries bypass stale or encrypted-byte entries.
  const bypassCache = fallbackRequest.cache === 'no-cache' || fallbackRequest.cache === 'no-store';

  if (!bypassCache) {
    // Cache-first: serve from SW media cache if available
    try {
      const cache = await self.caches.open(SW_MEDIA_CACHE);
      const cached = await cache.match(url);
      if (cached) return cached;
    } catch {
      // Cache API unavailable — fall through to network
    }
  }

  // Fetch with auth header; fall back to unauthenticated on network error
  let response: Response;
  try {
    response = await fetch(url, { ...fetchConfig(session.accessToken), redirect });
  } catch {
    try {
      response = await fetch(fallbackRequest);
    } catch {
      return new Response(null, { status: 503, statusText: 'Service Unavailable' });
    }
  }

  // Cache immutable Matrix media images for future <img> tag requests.
  // Only cache when:
  //   - response is successful and content-type is image/*
  //   - the original request did NOT use no-cache (encrypted blobs sent with
  //     the wrong image/* content-type must not be stored here)
  if (!bypassCache && response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.startsWith('image/')) {
      try {
        const cache = await self.caches.open(SW_MEDIA_CACHE);
        await cache.put(url, response.clone());
      } catch {
        // Quota exceeded or storage unavailable — continue without caching
      }
    }
  }

  return response;
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;

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
        if (matching.length === 1) {
          return fetchMediaWithRetry(url, matching[0].accessToken, redirect, '');
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
  if (syncByBaseUrl.length === 1) {
    event.respondWith(fetchMediaWithRetry(url, syncByBaseUrl[0].accessToken, redirect, clientId));
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
      requestSessionWithTimeout(clientId).then(async (s) => {
        // Primary: session received from the live client window.
        if (s && validMediaRequest(url, s.baseUrl)) {
          return fetch(url, { ...fetchConfig(s.accessToken), redirect });
        }
        // Fallback: try the persisted session (helps when SW restarts on iOS and
        // the client window hasn't responded to requestSession yet).
        const persisted = await loadPersistedSession();
        const validated = persisted ? await validateSession(persisted) : undefined;
        if (validated && validMediaRequest(url, validated.baseUrl)) {
          console.debug('[SW fetch] Using validated persisted session fallback', { url, clientId });
          return fetch(url, { ...fetchConfig(validated.accessToken), redirect });
        }
        console.warn('[SW fetch] No valid session for media request — returning 401', {
          url,
          clientId,
          hasSession: !!s,
          hadPersistedSession: !!persisted,
          persistedSessionValid: !!validated,
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
      }),
      new Promise<Response>((_, reject) => {
        setTimeout(() => {
          console.error('[SW fetch] Global timeout after 15s — SW may be stuck', { url, clientId });
          reject(new Error('Service worker media fetch timeout'));
        }, 15000);
      }),
    ])
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
  //
  // Require BOTH the explicit appIsVisible flag AND a visible client from
  // matchAll() before suppressing.  appIsVisible resets to false every time the
  // SW starts fresh; on iOS the browser kills the SW between pushes, so on the
  // next push appIsVisible is always false — we never suppress on a cold SW
  // restart, which prevents the "notifications stop after a while" bug where
  // stale matchAll() data (visibilityState stuck at 'visible') would cause all
  // subsequent notifications to be silently dropped.
  //
  // Also require syncIsHealthy: if the Matrix sync is in Reconnecting/Error
  // state, the in-app notification path is broken, so we must show the OS
  // notification even when the app is visible.
  //
  // When matchAll() returns zero clients (iOS Safari PWA fully-suspended quirk),
  // clients.some() returns false — do NOT suppress.  Better to show a duplicate
  // (handled gracefully by the in-app banner) than to silently drop a
  // notification while the app is backgrounded.
  const hasVisibleClient =
    appIsVisible && syncIsHealthy && clients.some((client) => client.visibilityState === 'visible');
  console.debug(
    '[SW push] appIsVisible:',
    appIsVisible,
    '| syncIsHealthy:',
    syncIsHealthy,
    '| clients:',
    clients.map((c) => ({ url: c.url, visibility: c.visibilityState }))
  );
  console.debug('[SW push] hasVisibleClient:', hasVisibleClient);
  if (hasVisibleClient) {
    console.debug('[SW push] suppressing OS notification — app is visible and sync is healthy');
    // Post telemetry to app for Sentry tracking
    postSentryMetric('sable.push.suppressed', 1, {
      reason: 'app_visible_and_healthy',
      has_clients: clients.length > 0,
      sync_healthy: syncIsHealthy,
    }).catch(() => undefined);
    return;
  }

  const pushData = event.data.json();
  console.debug('[SW push] raw payload:', JSON.stringify(pushData, null, 2));

  // Track push notification arrival
  postSentryMetric('sable.push.received', 1, {
    app_visible: appIsVisible,
    sync_healthy: syncIsHealthy,
    has_clients: clients.length > 0,
    payload_type: isMinimalPushPayload(pushData) ? 'minimal' : 'full',
  }).catch(() => undefined);

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
          const cache = await caches.open('workbox-precache-v2-' + self.registration.scope);
          const cachedResponse = await cache.match('/index.html');
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
