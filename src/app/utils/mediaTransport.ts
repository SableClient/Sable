import { hasServiceWorker } from '$utils/platform';
import { getFromMediaCache, putInMediaCache } from './mediaCache';

type StoredSession = {
  userId: string;
  accessToken: string;
};

export type MediaFetchCacheMode = 'default' | 'reload' | 'bypass';

export type MediaTransportOptions = {
  cache?: MediaFetchCacheMode;
  accessToken?: string | null;
  getAccessToken?: () => string | null | undefined;
  sessionScope?: string;
};

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

      return [
        {
          userId: (session as StoredSession).userId,
          accessToken: (session as StoredSession).accessToken,
        },
      ];
    });
  } catch {
    return [];
  }
}

function getStoredAccessToken(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;

  const sessions = parseStoredSessions();
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
  const activeSession =
    (activeSessionId
      ? sessions.find((session) => session.userId === activeSessionId)
      : undefined) ?? sessions[0];

  if (activeSession?.accessToken) return activeSession.accessToken;

  const fallbackBaseUrl = localStorage.getItem(FALLBACK_BASE_URL_KEY);
  const fallbackUserId = localStorage.getItem(FALLBACK_USER_ID_KEY);
  const fallbackAccessToken = localStorage.getItem(FALLBACK_ACCESS_TOKEN_KEY);

  if (fallbackBaseUrl && fallbackUserId && fallbackAccessToken) {
    return fallbackAccessToken;
  }

  return undefined;
}

function getStoredSessionScope(): string {
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

function getScopedMediaCacheKey(url: string, sessionScope?: string): string {
  return `${sessionScope ?? getStoredSessionScope()}:${url}`;
}

function resolveAccessToken(options?: MediaTransportOptions): string | undefined {
  if (options && Object.hasOwn(options, 'getAccessToken')) {
    return typeof options.getAccessToken === 'function'
      ? (options.getAccessToken() ?? undefined)
      : undefined;
  }

  if (options && Object.hasOwn(options, 'accessToken')) {
    return options.accessToken ?? undefined;
  }

  return getStoredAccessToken();
}

function resolveSessionScope(options?: MediaTransportOptions): string {
  if (options && Object.hasOwn(options, 'sessionScope')) {
    return options.sessionScope ?? 'anonymous';
  }

  return getStoredSessionScope();
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
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  return fetch(url, init);
}

async function fetchMediaBlobInternal(url: string, options?: MediaTransportOptions): Promise<Blob> {
  const cacheMode = options?.cache ?? 'default';
  const scopedCacheKey = getScopedMediaCacheKey(url, resolveSessionScope(options));

  if (cacheMode === 'default') {
    const cachedBlob = await getFromMediaCache(scopedCacheKey);
    if (cachedBlob) return cachedBlob;
  }

  const useServiceWorker = hasServiceWorker();
  const fetchAndCache = async (response: Response): Promise<Blob> => {
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    if (cacheMode !== 'bypass') {
      await putInMediaCache(scopedCacheKey, blob);
    }
    return blob;
  };

  if (useServiceWorker) {
    const response = await fetchMediaResponse(url, undefined, cacheMode);
    if (response.ok || !isRetryableAuthError(response)) {
      return fetchAndCache(response);
    }
    return fetchAndCache(await fetchMediaResponse(url, undefined, cacheMode));
  }

  const initialAccessToken = resolveAccessToken(options);
  const initialResponse = await fetchMediaResponse(url, initialAccessToken, cacheMode);
  if (initialResponse.ok) {
    return fetchAndCache(initialResponse);
  }

  if (!isRetryableAuthError(initialResponse)) {
    throw new Error(
      `Failed to fetch media: ${initialResponse.status} ${initialResponse.statusText}`
    );
  }

  const retryAccessToken = resolveAccessToken(options);
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
