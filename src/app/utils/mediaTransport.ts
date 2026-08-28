import { getCachedSWMediaAuthSupport } from './swMediaAuth';
import { fetch } from '$utils/fetch';
import { getFromMediaCache, putInMediaCache } from './mediaCache';
import { getTauriMediaSourceUrl } from './mediaSourceUrl';

type StoredSession = {
  baseUrl?: string;
  userId: string;
  accessToken: string;
};

export type MediaFetchCacheMode = 'default' | 'reload' | 'bypass';

export type MediaTransportOptions = {
  cache?: MediaFetchCacheMode;
  forceDirectAuth?: boolean;
  accessToken?: string | null;
  getAccessToken?: () => string | null | undefined;
  sessionScope?: string;
};

const inflightRequests = new Map<string, Promise<Blob>>();

const MEDIA_FETCH_TIMEOUT_MS = 120_000;

const MATRIX_SESSIONS_KEY = 'matrixSessions';
const ACTIVE_SESSION_KEY = 'matrixActiveSession';
const FALLBACK_ACCESS_TOKEN_KEY = 'cinny_access_token';
const FALLBACK_USER_ID_KEY = 'cinny_user_id';
const FALLBACK_BASE_URL_KEY = 'cinny_hs_base_url';
const MATRIX_MEDIA_PATH_PREFIXES = ['/_matrix/media/', '/_matrix/client/v1/media/'];

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

      return [
        {
          baseUrl:
            typeof (session as { baseUrl?: unknown }).baseUrl === 'string'
              ? (session as { baseUrl: string }).baseUrl
              : undefined,
          userId: (session as StoredSession).userId,
          accessToken: (session as StoredSession).accessToken,
        },
      ];
    });
  } catch {
    return [];
  }
}

function getStoredActiveSessionId(): string | undefined {
  const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    // Keep reading pre-multi-account values written without JSON encoding.
    return raw;
  }
}

function getActiveStoredSession(): StoredSession | undefined {
  if (typeof localStorage === 'undefined') return undefined;

  const sessions = parseStoredSessions();
  const activeSessionId = getStoredActiveSessionId();
  return (
    (activeSessionId
      ? sessions.find((session) => session.userId === activeSessionId)
      : undefined) ?? sessions[0]
  );
}

function getUrlOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function isMatrixMediaPath(pathname: string): boolean {
  return MATRIX_MEDIA_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isTrustedMatrixMediaUrl(url: string, baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return false;
    return parsedUrl.origin === getUrlOrigin(baseUrl) && isMatrixMediaPath(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function getStoredAccessToken(url: string): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;

  const activeSession = getActiveStoredSession();

  if (activeSession?.accessToken && isTrustedMatrixMediaUrl(url, activeSession.baseUrl)) {
    return activeSession.accessToken;
  }

  const fallbackBaseUrl = localStorage.getItem(FALLBACK_BASE_URL_KEY);
  const fallbackUserId = localStorage.getItem(FALLBACK_USER_ID_KEY);
  const fallbackAccessToken = localStorage.getItem(FALLBACK_ACCESS_TOKEN_KEY);

  if (
    fallbackBaseUrl &&
    fallbackUserId &&
    fallbackAccessToken &&
    isTrustedMatrixMediaUrl(url, fallbackBaseUrl)
  ) {
    return fallbackAccessToken;
  }

  return undefined;
}

export function getActiveMediaSession():
  | { baseUrl: string; accessToken: string; userId: string }
  | undefined {
  const activeSession = getActiveStoredSession();
  if (activeSession?.baseUrl && activeSession.accessToken) {
    return {
      baseUrl: activeSession.baseUrl,
      accessToken: activeSession.accessToken,
      userId: activeSession.userId,
    };
  }
  return undefined;
}

let cachedSessionScope: string | undefined;

const invalidateMediaSessionScope = (): void => {
  cachedSessionScope = undefined;
};

if (typeof window !== 'undefined') {
  window.addEventListener('sable-session-changed', invalidateMediaSessionScope);
  window.addEventListener('storage', invalidateMediaSessionScope);
}

export function getCurrentMediaSessionScope(): string {
  if (typeof localStorage === 'undefined') return 'anonymous';
  if (cachedSessionScope !== undefined) return cachedSessionScope;

  const activeSession = getActiveStoredSession();

  if (activeSession) {
    cachedSessionScope = activeSession.userId;
    return cachedSessionScope;
  }

  const fallbackBaseUrl = localStorage.getItem(FALLBACK_BASE_URL_KEY);
  const fallbackUserId = localStorage.getItem(FALLBACK_USER_ID_KEY);

  if (fallbackBaseUrl && fallbackUserId) {
    cachedSessionScope = fallbackUserId;
    return cachedSessionScope;
  }

  cachedSessionScope = 'anonymous';
  return cachedSessionScope;
}

function getFetchCacheMode(cacheMode: MediaFetchCacheMode): RequestCache {
  if (cacheMode === 'reload') return 'reload';
  if (cacheMode === 'bypass') return 'no-store';
  return 'default';
}

function getRequestKey(
  url: string,
  cacheMode: MediaFetchCacheMode,
  forceDirectAuth: boolean
): string {
  const transportMode = forceDirectAuth ? 'direct-auth' : 'default';
  return `${transportMode}:${cacheMode}:${getStableMediaCacheKeyFragment(url)}`;
}

type MatrixMediaInfo = {
  mxcUrl: string;
  operation: 'download' | 'thumbnail';
  query: string;
};

function getMatrixMediaInfo(url: string): MatrixMediaInfo | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const match = parsed.pathname.match(
    /^\/_matrix\/(?:media\/[^/]+|client\/v1\/media)\/(download|thumbnail)\/([^/]+)\/([^/?#]+)/
  );
  if (!match) return undefined;

  const [, operation, serverName, mediaId] = match;
  return {
    mxcUrl: `mxc://${serverName}/${mediaId}`,
    operation: operation as MatrixMediaInfo['operation'],
    query: parsed.search,
  };
}

// Kept in step with MEDIA_RETRY_MARKER in mediaUrl.ts, which cannot be imported back.
const MEDIA_RETRY_MARKER = '__sable_media_retry';

// A marker in the key would file a successful retry under a key nothing looks up again.
function stripMediaRetryMarker(url: string): string {
  if (!url.includes(MEDIA_RETRY_MARKER)) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.delete(MEDIA_RETRY_MARKER);
    if (parsed.hash.startsWith(`#${MEDIA_RETRY_MARKER}=`)) {
      parsed.hash = '';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function getStableMediaCacheKeyFragment(url: string): string {
  const stableUrl = stripMediaRetryMarker(url);
  const info = getMatrixMediaInfo(stableUrl);
  if (info) return `${info.mxcUrl}:${info.operation}${info.query}`;
  return stableUrl;
}

export { getStableMediaCacheKeyFragment };

function getScopedMediaCacheKey(url: string, sessionScope?: string): string {
  return `${sessionScope ?? getCurrentMediaSessionScope()}:${getStableMediaCacheKeyFragment(url)}`;
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

  return getStoredAccessToken(url);
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
    signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  return fetch(url, init);
}

async function fetchMediaBlobInternal(url: string, options?: MediaTransportOptions): Promise<Blob> {
  const cacheMode = options?.cache ?? 'default';
  const resolvedScope = resolveSessionScope(options);
  const scopedCacheKey = getScopedMediaCacheKey(url, resolvedScope);

  if (cacheMode === 'default') {
    const cachedBlob = await getFromMediaCache(scopedCacheKey);
    if (cachedBlob) return cachedBlob;
  }

  // Only let the service worker attach the token once it has proven media-auth
  // support; a stale SW build would forward the request bare and get a 4xx.
  const useServiceWorker =
    getCachedSWMediaAuthSupport() === true &&
    !hasExplicitMediaAuthOverride(options) &&
    !options?.forceDirectAuth;
  const fetchAndCache = async (response: Response): Promise<Blob> => {
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    if (cacheMode !== 'bypass') {
      // Persistence is best-effort and must not delay first paint/playback.
      void putInMediaCache(scopedCacheKey, blob).catch(() => undefined);
    }
    return blob;
  };

  if (useServiceWorker) {
    return fetchAndCache(await fetchMediaResponse(url, undefined, cacheMode));
  }

  const fetchWithRetry = async (
    fetchUrl: string,
    token: string | undefined,
    fetchCacheMode: MediaFetchCacheMode
  ): Promise<Response> => {
    try {
      const response = await fetchMediaResponse(fetchUrl, token, fetchCacheMode);
      if (response.ok || isRetryableAuthError(response)) return response;
      // Retry once on server errors (5xx) after a short backoff
      if (response.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        return fetchMediaResponse(fetchUrl, token, fetchCacheMode);
      }
      return response;
    } catch (err) {
      // Don't retry on AbortError (user navigated away / manual abort)
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Network error or timeout — retry once after a short backoff
      await new Promise((r) => setTimeout(r, 1500));
      return fetchMediaResponse(fetchUrl, token, fetchCacheMode);
    }
  };

  const initialAccessToken = resolveAccessToken(url, options);
  const initialResponse = await fetchWithRetry(url, initialAccessToken, cacheMode);
  if (initialResponse.ok) {
    return fetchAndCache(initialResponse);
  }

  if (!isRetryableAuthError(initialResponse)) {
    throw new Error(
      `Failed to fetch media: ${initialResponse.status} ${initialResponse.statusText}`
    );
  }

  const retryAccessToken = resolveAccessToken(url, options);
  return fetchAndCache(await fetchMediaResponse(url, retryAccessToken, cacheMode));
}

export async function fetchMediaBlob(url: string, options?: MediaTransportOptions): Promise<Blob> {
  // Keeps the webview-only `sable-media` form out of `fetch()`.
  const target = getTauriMediaSourceUrl(url) ?? url;
  const cacheMode = options?.cache ?? 'default';
  const requestKey = getRequestKey(
    getScopedMediaCacheKey(target, resolveSessionScope(options)),
    cacheMode,
    options?.forceDirectAuth === true
  );

  const inflight = inflightRequests.get(requestKey);
  if (inflight) return inflight;

  const request = fetchMediaBlobInternal(target, options).finally(() => {
    inflightRequests.delete(requestKey);
  });

  inflightRequests.set(requestKey, request);
  return request;
}
