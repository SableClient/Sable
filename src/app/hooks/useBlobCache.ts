import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('blob-cache');

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
    if (!url) return undefined;

    // SABLE-4Y fix: Skip URLs that previously failed auth
    if (authFailedUrls.has(url)) {
      return undefined;
    }

    // Check memory cache first (instant)
    if (imageBlobCache.has(url)) {
      Sentry.metrics.count('blob_cache.request', 1, {
        attributes: { result: 'hit', cacheType: 'memory' },
      });
      return undefined;
    }

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
          // Check persistent cache (fast, survives reloads)
          const cachedBlob = await getCachedMedia(url);
          if (cachedBlob) {
            Sentry.metrics.count('blob_cache.request', 1, {
              attributes: { result: 'hit', cacheType: 'persistent' },
            });
            const objectUrl = URL.createObjectURL(cachedBlob);
            imageBlobCache.set(url, objectUrl);
            return objectUrl;
          }

          // Fetch from network (slow)
          Sentry.metrics.count('blob_cache.request', 1, {
            attributes: { result: 'miss', cacheType: 'network' },
          });
          const res = await fetch(url, { mode: 'cors' });
          if (!res.ok) {
            throw new Error(`Failed to fetch blob: ${res.status} ${res.statusText}`);
          }
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);

          imageBlobCache.set(url, objectUrl);
          return objectUrl;
        } catch (e) {
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
