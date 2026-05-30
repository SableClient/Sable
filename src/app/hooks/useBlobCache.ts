import { useState, useEffect } from 'react';

const imageBlobCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

export function getBlobCacheStats(): { cacheSize: number; inflightCount: number } {
  return { cacheSize: imageBlobCache.size, inflightCount: inflightRequests.size };
}

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
    if (!url || imageBlobCache.has(url)) return undefined;

    let isMounted = true;

    const fetchBlob = async () => {
      if (inflightRequests.has(url)) {
        try {
          const existingBlobUrl = await inflightRequests.get(url);
          if (isMounted) setCacheState({ sourceUrl: url, blobUrl: existingBlobUrl });
        } catch {
          // Inflight request failed, silently ignore (consistent with fetchBlob behavior)
        }
        return;
      }

      const requestPromise = (async () => {
        try {
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

          // SABLE-4X fix: Handle 400 errors for federated media (e.g., thumbnail not found)
          if (res.status === 400) {
            debugLog.warn('general', 'Media fetch failed: bad request (likely federated media)', {
              url: url.substring(0, 100),
            });
            Sentry.addBreadcrumb({
              category: 'blob_cache',
              message: 'Media fetch 400 - bad request',
              level: 'warning',
              data: { url: url.substring(0, 100) },
            });
            // Mark URL as auth-failed to prevent retries (reusing same set for any non-retryable error)
            authFailedUrls.add(url);
            inflightRequests.delete(url);
            // Throw a specific error to bypass Sentry exception capture
            throw new Error('BAD_REQUEST_400');
          }

          if (!res.ok) {
            throw new Error(`Failed to fetch blob: ${res.status} ${res.statusText}`);
          }
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);

          imageBlobCache.set(url, objectUrl);
          return objectUrl;
        } catch (e) {
          // Don't log expected failures to Sentry (auth/bad-request errors)
          const isExpectedFailure =
            e instanceof Error &&
            (e.message === 'AUTH_FAILED_401' || e.message === 'BAD_REQUEST_400');
          if (!isExpectedFailure) {
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

  return cacheState.blobUrl || url;
}
