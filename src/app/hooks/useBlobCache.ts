import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('blob-cache');

const CACHE_NAME = 'sable-media-v1';
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE_MB = 500; // Configurable limit

const imageBlobCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();
const authFailedUrls = new Set<string>(); // Track URLs that failed with 401

type CacheMetadata = {
  url: string;
  size: number;
  cachedAt: number;
};

let cacheMetadata: CacheMetadata[] = [];
let metadataLoaded = false;

/**
 * Open the Cache API storage for media blobs.
 * Persistent across page reloads and shared between tabs.
 */
async function openMediaCache(): Promise<Cache> {
  return await caches.open(CACHE_NAME);
}

/**
 * Load cache metadata from Cache API headers.
 * This tracks size and age for eviction logic.
 */
async function loadCacheMetadata(): Promise<void> {
  if (metadataLoaded) return;

  try {
    const cache = await openMediaCache();
    const requests = await cache.keys();

    const metadataPromises = requests.map(async (request) => {
      const response = await cache.match(request);
      if (!response) return null;

      const cachedAt = parseInt(response.headers.get('X-Cached-At') ?? '0', 10);
      const size = parseInt(response.headers.get('X-Size') ?? '0', 10);

      return {
        url: request.url,
        size,
        cachedAt,
      };
    });

    const metadata = (await Promise.all(metadataPromises)).filter(
      (m): m is CacheMetadata => m !== null
    );

    cacheMetadata = metadata.toSorted((a, b) => a.cachedAt - b.cachedAt); // LRU order
    metadataLoaded = true;
  } catch {
    // Cache API unavailable — metadata stays empty
  }
}

/**
 * Store media blob in Cache API with metadata headers.
 * Runs cache size check and eviction if needed.
 */
async function cacheMedia(url: string, blob: Blob): Promise<void> {
  try {
    await loadCacheMetadata();

    const cache = await openMediaCache();
    const response = new Response(blob, {
      headers: {
        'Content-Type': blob.type,
        'X-Cached-At': Date.now().toString(),
        'X-Size': blob.size.toString(),
      },
    });

    await cache.put(url, response);

    // Update metadata
    cacheMetadata.push({
      url,
      size: blob.size,
      cachedAt: Date.now(),
    });

    // Check size and evict if needed
    await evictIfNeeded();
  } catch {
    // Cache write failed — continue without persistent cache
  }
}

/**
 * Retrieve media blob from Cache API.
 * Returns undefined if not cached or expired.
 */
async function getCachedMedia(url: string): Promise<Blob | undefined> {
  try {
    const cache = await openMediaCache();
    const response = await cache.match(url);
    if (!response) return undefined;

    // Check expiry
    const cachedAt = parseInt(response.headers.get('X-Cached-At') ?? '0', 10);
    if (Date.now() - cachedAt > MAX_CACHE_AGE_MS) {
      cache.delete(url); // Expired
      cacheMetadata = cacheMetadata.filter((m) => m.url !== url);
      return undefined;
    }

    return await response.blob();
  } catch {
    return undefined;
  }
}

/**
 * Evict oldest entries if cache exceeds size limit.
 * Uses LRU (Least Recently Used) eviction strategy.
 */
async function evictIfNeeded(): Promise<void> {
  const totalSizeBytes = cacheMetadata.reduce((sum, m) => sum + m.size, 0);
  const totalSizeMB = totalSizeBytes / (1024 * 1024);

  if (totalSizeMB <= MAX_CACHE_SIZE_MB) return;

  try {
    const cache = await openMediaCache();
    const toEvict = Math.ceil(cacheMetadata.length * 0.1); // Evict 10% of entries

    const toDelete: CacheMetadata[] = [];
    for (let i = 0; i < toEvict && cacheMetadata.length > 0; i++) {
      const oldest = cacheMetadata.shift();
      if (oldest) {
        toDelete.push(oldest);
      }
    }

    // Delete all in parallel
    await Promise.all(toDelete.map((m) => cache.delete(m.url)));
  } catch {
    // Eviction failed — continue anyway
  }
}

/**
 * Clear the in-memory blob cache and any in-flight fetch requests.
 * Does not affect persistent Cache API storage.
 */
export function clearInMemoryBlobCache(): void {
  imageBlobCache.clear();
  inflightRequests.clear();
  authFailedUrls.clear();
}

/**
 * Clear all media from persistent cache.
 * Also clears the in-memory cache.
 * Useful for "Clear Cache" settings option.
 */
export async function clearMediaCache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
    cacheMetadata = [];
    metadataLoaded = false;
    clearInMemoryBlobCache();
  } catch {
    // Cache clear failed — silent ignore
  }
}

/**
 * Get cache statistics for metrics/debugging.
 */
export function getBlobCacheStats(): {
  cacheSize: number;
  inflightCount: number;
  persistentCacheSizeMB: number;
  persistentCacheCount: number;
} {
  const totalSizeBytes = cacheMetadata.reduce((sum, m) => sum + m.size, 0);
  return {
    cacheSize: imageBlobCache.size,
    inflightCount: inflightRequests.size,
    persistentCacheSizeMB: totalSizeBytes / (1024 * 1024),
    persistentCacheCount: cacheMetadata.length,
  };
}

/**
 * Async version of getBlobCacheStats that first ensures cache metadata is
 * loaded from the Cache API. Use this in settings/diagnostics panels.
 */
export async function getBlobCacheStatsAsync(): Promise<ReturnType<typeof getBlobCacheStats>> {
  await loadCacheMetadata();
  return getBlobCacheStats();
}

/**
 * Hook to fetch and cache media blobs with persistent storage.
 * Checks in-memory cache first, then Cache API, then fetches from network.
 */
export function useBlobCache(url?: string): string | undefined {
  const [cacheState, setCacheState] = useState<{ sourceUrl?: string; blobUrl?: string }>({
    sourceUrl: url,
    blobUrl: url ? imageBlobCache.get(url) : undefined,
  });

  if (url !== cacheState.sourceUrl) {
    setCacheState({
      sourceUrl: url,
      blobUrl: url ? imageBlobCache.get(url) : undefined,
    });
  }

  useEffect(() => {
    if (!url) return undefined;

    // SABLE-4Y fix: Skip URLs that previously failed auth
    if (authFailedUrls.has(url)) {
      return undefined;
    }

    // Check memory cache first (instant)
    if (imageBlobCache.has(url)) {
      return undefined;
    }

    let isMounted = true;

    const fetchBlob = async () => {
      // Check if another component is already fetching this URL
      if (inflightRequests.has(url)) {
        try {
          const existingBlobUrl = await inflightRequests.get(url);
          if (isMounted) setCacheState({ sourceUrl: url, blobUrl: existingBlobUrl });
        } catch {
          // Inflight request failed, silently ignore
        }
        return;
      }

      const requestPromise = (async () => {
        try {
          // Check persistent cache (fast, survives reloads)
          const cachedBlob = await getCachedMedia(url);
          if (cachedBlob) {
            const objectUrl = URL.createObjectURL(cachedBlob);
            imageBlobCache.set(url, objectUrl);
            return objectUrl;
          }

          // Fetch from network (slow)
          const res = await fetch(url, { mode: 'cors' });

          // SABLE-4Y fix: Handle 401 auth failures gracefully
          if (res.status === 401) {
            debugLog.warn('general', 'Media fetch failed: authentication required', {
              url: url.substring(0, 100),
            });
            Sentry.addBreadcrumb({
              category: 'blob_cache',
              message: 'Media fetch 401 - no valid session',
              level: 'warning',
              data: { url: url.substring(0, 100) },
            });
            // Mark URL as auth-failed to prevent retries
            authFailedUrls.add(url);
            inflightRequests.delete(url);
            // Throw a specific error to bypass Sentry exception capture
            throw new Error('AUTH_FAILED_401');
          }

          if (!res.ok) {
            throw new Error(`Failed to fetch blob: ${res.status} ${res.statusText}`);
          }
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);

          // Store in both caches
          imageBlobCache.set(url, objectUrl);
          cacheMedia(url, blob); // Non-blocking persistent storage

          return objectUrl;
        } catch (e) {
          // Don't log auth failures to Sentry (expected when SW has no session)
          const isAuthFailure = e instanceof Error && e.message === 'AUTH_FAILED_401';
          if (!isAuthFailure) {
            debugLog.error('general', 'Blob fetch/cache failed', {
              url: url.substring(0, 100),
              error: e instanceof Error ? e.message : String(e),
            });
            Sentry.captureException(e, {
              tags: { media_operation: 'blob_cache' },
              contexts: {
                media: {
                  url: url.substring(0, 100),
                },
              },
            });
          }
          inflightRequests.delete(url);
          throw e;
        }
      })();

      inflightRequests.set(url, requestPromise);

      try {
        const finalBlobUrl = await requestPromise;
        if (isMounted) {
          setCacheState({ sourceUrl: url, blobUrl: finalBlobUrl });
        }
      } catch {
        // silency fail... mrow
      } finally {
        inflightRequests.delete(url);
      }
    };

    fetchBlob();

    return () => {
      isMounted = false;
    };
  }, [url]);

  // SABLE-4Y fix: Don't return original URL as fallback for auth-failed URLs
  // (would cause browser to attempt direct fetch, which also fails with 401)
  if (url && authFailedUrls.has(url)) {
    return undefined;
  }

  return cacheState.blobUrl || url;
}
