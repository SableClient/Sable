import type { MatrixClient } from '$types/matrix-sdk';
import { buildFeatureSupportMap, Method, Thread } from '$types/matrix-sdk';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const keyFor = (baseUrl: string, userId: string): string =>
  `sable.versionsCache.${baseUrl}|${userId}`;

type CachedVersions = {
  versions: unknown;
  unstable_features: Record<string, boolean> | undefined;
  fetchedAt: number;
};

const readCache = (baseUrl: string, userId: string): CachedVersions | undefined => {
  try {
    const raw = localStorage.getItem(keyFor(baseUrl, userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedVersions;
    if (typeof parsed.fetchedAt !== 'number') return undefined;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

const writeCache = (
  baseUrl: string,
  userId: string,
  data: { versions: unknown; unstable_features: Record<string, boolean> | undefined }
): void => {
  try {
    const entry: CachedVersions = { ...data, fetchedAt: Date.now() };
    localStorage.setItem(keyFor(baseUrl, userId), JSON.stringify(entry));
  } catch {
    // localStorage full or disabled — non-fatal, skip caching.
  }
};

/** Fetch /versions through the SDK and persist the response for the next startup. */
export const cacheVersionsFromClient = async (
  mx: MatrixClient,
  baseUrl: string,
  userId: string
): Promise<void> => {
  try {
    const data = await mx.getVersions();
    writeCache(baseUrl, userId, {
      versions: data.versions,
      unstable_features: data.unstable_features,
    });
  } catch {
    // startup can continue without a cache entry.
  }
};

/**
 * Seed mx.serverVersionsPromise AND mx.canSupport from a cached /versions payload.
 * Seeding the promise alone leaves canSupport empty → semantic drift in
 * redaction/relation checks. Both must be set before the first sync request.
 */
export const primeVersionsFromCache = async (
  mx: MatrixClient,
  baseUrl: string,
  userId: string
): Promise<boolean> => {
  const cached = readCache(baseUrl, userId);
  if (!cached) return false;
  const serverVersions = {
    versions: cached.versions,
    unstable_features: cached.unstable_features ?? {},
  };
  (mx as unknown as { serverVersionsPromise: Promise<unknown> | undefined }).serverVersionsPromise =
    Promise.resolve(serverVersions);
  (mx as unknown as { canSupport: Map<unknown, unknown> }).canSupport =
    await buildFeatureSupportMap(serverVersions as Parameters<typeof buildFeatureSupportMap>[0]);
  return true;
};

/**
 * Fire-and-forget revalidation of the /versions cache. Updates both the cache
 * and the in-memory promise/canSupport so the client stays current.
 */
export const revalidateVersionsCache = async (
  mx: MatrixClient,
  baseUrl: string,
  userId: string
): Promise<void> => {
  try {
    const resp = await mx.http.authedRequest(
      Method.Get,
      '/_matrix/client/versions',
      undefined,
      undefined,
      { prefix: '' }
    );
    const data = resp as { versions: unknown; unstable_features?: Record<string, boolean> };
    writeCache(baseUrl, userId, {
      versions: data.versions,
      unstable_features: data.unstable_features,
    });
    (
      mx as unknown as { serverVersionsPromise: Promise<unknown> | undefined }
    ).serverVersionsPromise = Promise.resolve(data);
    (mx as unknown as { canSupport: Map<unknown, unknown> }).canSupport =
      await buildFeatureSupportMap(data as Parameters<typeof buildFeatureSupportMap>[0]);
    const { threads, list, fwdPagination } = await mx.doesServerSupportThread();
    Thread.setServerSideSupport(threads);
    Thread.setServerSideListSupport(list);
    Thread.setServerSideFwdPaginationSupport(fwdPagination);
  } catch {
    // Revalidation failed — cached values remain in effect. Non-fatal.
  }
};

/** True only when a cached /versions payload advertised the feature. */
export const wasUnstableFeatureCached = (
  baseUrl: string,
  userId: string,
  feature: string
): boolean => readCache(baseUrl, userId)?.unstable_features?.[feature] === true;

/** Clear the cached versions for a session (used on logout). */
export const clearCachedVersions = (baseUrl: string, userId: string): void => {
  try {
    localStorage.removeItem(keyFor(baseUrl, userId));
  } catch {
    // non-fatal
  }
};
