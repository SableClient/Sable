import { hasControllingServiceWorker } from '$utils/platform';
import { fetch } from '$utils/fetch';
import { getFromMediaCache, putInMediaCache } from './mediaCache';
import {
  getMediaMetadata,
  getMediaMetadataSnapshot,
  storeMediaMetadataForBlob,
} from './mediaMetadata';

type StoredSession = {
  userId: string;
  accessToken: string;
  baseUrl?: string;
};

export type MediaFetchCacheMode = 'default' | 'reload' | 'bypass';

export type MediaTransportOptions = {
  cache?: MediaFetchCacheMode;
  accessToken?: string | null;
  getAccessToken?: () => string | null | undefined;
  metadataCacheKey?: string | null;
  sessionScope?: string;
};

export class MediaFetchError extends Error {
  public readonly status: number;

  public readonly statusText: string;

  public readonly url: string;

  public constructor(url: string, status: number, statusText: string) {
    super(`Failed to fetch media: ${status} ${statusText}`);
    this.name = 'MediaFetchError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

const inflightRequests = new Map<string, Promise<Blob>>();

const MATRIX_SESSIONS_KEY = 'matrixSessions';
const ACTIVE_SESSION_KEY = 'matrixActiveSession';
const FALLBACK_ACCESS_TOKEN_KEY = 'cinny_access_token';
const FALLBACK_USER_ID_KEY = 'cinny_user_id';
const FALLBACK_BASE_URL_KEY = 'cinny_hs_base_url';

function parseStoredSessions(): StoredSession[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(MATRIX_SESSIONS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((session): StoredSession[] => {
      if (
        typeof session !== 'object' ||
        session === null ||
        typeof (session as { userId?: unknown }).userId !== 'string' ||
        typeof (session as { accessToken?: unknown }).accessToken !== 'string'
      ) {
        return [];
      }

      const baseUrl = (session as { baseUrl?: unknown }).baseUrl;

      return [
        {
          userId: (session as StoredSession).userId,
          accessToken: (session as StoredSession).accessToken,
          ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

export function getCurrentMediaSessionScope(): string {
  if (typeof localStorage === 'undefined') return 'anonymous';

  const sessions = parseStoredSessions();
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
  const activeSession =
    (activeSessionId
      ? sessions.find((session) => session.userId === activeSessionId)
      : undefined) ?? sessions[0];

  if (activeSession) {
    return activeSession.userId;
  }

  const fallbackBaseUrl = localStorage.getItem(FALLBACK_BASE_URL_KEY);
  const fallbackUserId = localStorage.getItem(FALLBACK_USER_ID_KEY);

  if (fallbackBaseUrl && fallbackUserId) {
    return fallbackUserId;
  }

  return 'anonymous';
}

function getFetchCacheMode(cacheMode: MediaFetchCacheMode): RequestCache {
  if (cacheMode === 'reload') return 'reload';
  if (cacheMode === 'bypass') return 'no-store';
  return 'default';
}

function getRequestKey(url: string, cacheMode: MediaFetchCacheMode): string {
  return `${cacheMode}:${url}`;
}

export function getScopedMediaCacheKey(url: string, sessionScope?: string): string {
  return `${sessionScope ?? getCurrentMediaSessionScope()}:${url}`;
}

// Matrix media endpoints the stored token may be attached to. Mirrors the exact
// `MEDIA_PATHS` whitelist behind the service worker's `validMediaRequest()` gate
// in src/sw.ts — only the concrete download/thumbnail/preview_url endpoints, not
// whole media subtrees, so room-controlled routes like `/_matrix/media/v3/config`
// don't receive the token. Keep in sync with src/sw.ts.
const MEDIA_API_BASES = [
  '/_matrix/media/v3',
  '/_matrix/media/r0',
  '/_matrix/client/v1/media',
  '/_matrix/client/v3/media',
  '/_matrix/client/r0/media',
  '/_matrix/client/unstable/org.matrix.msc3916/media',
];
const MEDIA_ENDPOINTS = ['download', 'thumbnail', 'preview_url'];
const MEDIA_PATHS = MEDIA_API_BASES.flatMap((base) =>
  MEDIA_ENDPOINTS.map((endpoint) => `${base}/${endpoint}`)
);

/**
 * Whether `requestUrl` is a Matrix media endpoint served by the homeserver at
 * `baseUrl`. The media path is matched *relative to* the base URL so that
 * homeservers discovered with a path prefix (e.g. `https://example.org/matrix`,
 * yielding media URLs like `/matrix/_matrix/client/v1/media/...`) still match.
 */
function isMediaUrlForBase(requestUrl: URL, baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;

  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return false;
  }

  if (base.origin !== requestUrl.origin) return false;

  const basePath = base.pathname.replace(/\/+$/, '');
  if (basePath && !requestUrl.pathname.startsWith(basePath)) return false;

  const relativePath = requestUrl.pathname.slice(basePath.length);
  // Require a segment boundary after the endpoint so that an endpoint-name
  // prefix (e.g. `/download/{server}/{id}`) matches, but a room-controlled path
  // like `/downloaded/foo` or `/downloadXYZ` does not. `preview_url` carries no
  // path suffix (its args are query params, excluded from pathname), so an exact
  // match covers it.
  return MEDIA_PATHS.some(
    (endpoint) => relativePath === endpoint || relativePath.startsWith(`${endpoint}/`)
  );
}

/**
 * Resolve the stored access token to attach to an implicitly-authenticated
 * media request, or `undefined` if none should be sent.
 *
 * The stored Matrix token must never leak to an arbitrary, room-controlled URL
 * (e.g. an avatar or external icon). Mirroring the service worker's
 * `validMediaRequest()` gate, the token is attached only when the request both
 * targets a homeserver this client is signed in to AND hits a Matrix media
 * endpoint. The token of the session whose `baseUrl` matches the request is
 * returned — never another session's — so one homeserver can never receive a
 * different homeserver's bearer token. The active session is preferred when
 * multiple stored accounts share the same homeserver origin.
 */
function resolveStoredTokenForUrl(url: string): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const sessions = parseStoredSessions();
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
  const activeSession = activeSessionId
    ? sessions.find((session) => session.userId === activeSessionId)
    : undefined;

  // Prefer the active session, then any other stored session on the same origin,
  // so a same-origin account can't be served under a different account's token.
  const orderedSessions = activeSession
    ? [activeSession, ...sessions.filter((session) => session !== activeSession)]
    : sessions;

  for (const session of orderedSessions) {
    if (session.accessToken && isMediaUrlForBase(parsed, session.baseUrl)) {
      return session.accessToken;
    }
  }

  const fallbackBaseUrl = localStorage.getItem(FALLBACK_BASE_URL_KEY);
  const fallbackUserId = localStorage.getItem(FALLBACK_USER_ID_KEY);
  const fallbackAccessToken = localStorage.getItem(FALLBACK_ACCESS_TOKEN_KEY);
  if (fallbackAccessToken && fallbackUserId && isMediaUrlForBase(parsed, fallbackBaseUrl)) {
    return fallbackAccessToken;
  }

  return undefined;
}

function resolveAccessToken(url: string, options?: MediaTransportOptions): string | undefined {
  if (options && Object.hasOwn(options, 'getAccessToken')) {
    return typeof options.getAccessToken === 'function'
      ? (options.getAccessToken() ?? undefined)
      : undefined;
  }

  if (options && Object.hasOwn(options, 'accessToken')) {
    return options.accessToken ?? undefined;
  }

  return resolveStoredTokenForUrl(url);
}

function resolveSessionScope(options?: MediaTransportOptions): string {
  if (options && Object.hasOwn(options, 'sessionScope')) {
    return options.sessionScope ?? 'anonymous';
  }

  return getCurrentMediaSessionScope();
}

function hasExplicitMediaAuthOverride(options?: MediaTransportOptions): boolean {
  if (!options) return false;

  return (
    Object.hasOwn(options, 'accessToken') ||
    Object.hasOwn(options, 'getAccessToken') ||
    Object.hasOwn(options, 'sessionScope')
  );
}

function isRetryableAuthError(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

function isResponseBodyReadError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /load failed|network/i.test(error.message);
}

function buildMediaFetchError(url: string, response: Response): MediaFetchError {
  return new MediaFetchError(url, response.status, response.statusText);
}

export function isGracefullyDegradableMediaFetchError(error: unknown): boolean {
  return error instanceof MediaFetchError && error.status === 400;
}

async function fetchMediaResponse(
  url: string,
  accessToken?: string | null,
  cacheMode: MediaFetchCacheMode = 'default'
): Promise<Response> {
  const headers: HeadersInit = {};
  const token = accessToken ?? undefined;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: 'GET',
    cache: getFetchCacheMode(cacheMode),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  return fetch(url, init);
}

async function storeMediaMetadataIfMissing(
  cacheKey: string | undefined,
  blob: Blob
): Promise<void> {
  if (!cacheKey) return;
  if (getMediaMetadataSnapshot(cacheKey)) return;
  if (await getMediaMetadata(cacheKey)) return;
  await storeMediaMetadataForBlob(cacheKey, blob);
}

async function fetchMediaBlobInternal(url: string, options?: MediaTransportOptions): Promise<Blob> {
  const cacheMode = options?.cache ?? 'default';
  const scopedCacheKey = getScopedMediaCacheKey(url, resolveSessionScope(options));
  const metadataCacheKey =
    options?.metadataCacheKey === null ? undefined : (options?.metadataCacheKey ?? scopedCacheKey);

  if (cacheMode === 'default') {
    const cachedBlob = await getFromMediaCache(scopedCacheKey);
    if (cachedBlob) {
      void storeMediaMetadataIfMissing(metadataCacheKey, cachedBlob);
      return cachedBlob;
    }
  }

  const useServiceWorker = hasControllingServiceWorker() && !hasExplicitMediaAuthOverride(options);
  const fetchAndCache = async (response: Response): Promise<Blob> => {
    if (!response.ok) {
      throw buildMediaFetchError(url, response);
    }

    const blob = await response.blob();
    if (cacheMode !== 'bypass') {
      await putInMediaCache(scopedCacheKey, blob);
      if (metadataCacheKey) void storeMediaMetadataForBlob(metadataCacheKey, blob);
    }
    return blob;
  };
  const fetchAndCacheViaDirectAuth = async (): Promise<Blob | undefined> => {
    const directAccessToken = resolveAccessToken(url, options);
    if (!directAccessToken) return undefined;

    const directCacheMode = cacheMode === 'default' ? 'reload' : cacheMode;
    return fetchAndCache(await fetchMediaResponse(url, directAccessToken, directCacheMode));
  };
  const fetchAndCacheFromServiceWorker = async (response: Response): Promise<Blob> => {
    try {
      return await fetchAndCache(response);
    } catch (error) {
      if (response.ok && isResponseBodyReadError(error)) {
        const directBlob = await fetchAndCacheViaDirectAuth();
        if (directBlob) return directBlob;
      }
      throw error;
    }
  };

  if (useServiceWorker) {
    const response = await fetchMediaResponse(url, undefined, cacheMode);
    if (response.ok || !isRetryableAuthError(response)) {
      return fetchAndCacheFromServiceWorker(response);
    }
    const retryResponse = await fetchMediaResponse(url, undefined, cacheMode);
    if (retryResponse.ok || !isRetryableAuthError(retryResponse)) {
      return fetchAndCacheFromServiceWorker(retryResponse);
    }

    const directBlob = await fetchAndCacheViaDirectAuth();
    if (directBlob) return directBlob;

    return fetchAndCache(retryResponse);
  }

  const initialAccessToken = resolveAccessToken(url, options);
  const initialResponse = await fetchMediaResponse(url, initialAccessToken, cacheMode);
  if (initialResponse.ok) {
    return fetchAndCache(initialResponse);
  }

  if (!isRetryableAuthError(initialResponse)) {
    throw buildMediaFetchError(url, initialResponse);
  }

  const retryAccessToken = resolveAccessToken(url, options);
  return fetchAndCache(await fetchMediaResponse(url, retryAccessToken, cacheMode));
}

export async function fetchMediaBlob(url: string, options?: MediaTransportOptions): Promise<Blob> {
  const cacheMode = options?.cache ?? 'default';
  const requestKey = getRequestKey(
    getScopedMediaCacheKey(url, resolveSessionScope(options)),
    cacheMode
  );

  const inflight = inflightRequests.get(requestKey);
  if (inflight) return inflight;

  const request = fetchMediaBlobInternal(url, options).finally(() => {
    inflightRequests.delete(requestKey);
  });

  inflightRequests.set(requestKey, request);
  return request;
}
