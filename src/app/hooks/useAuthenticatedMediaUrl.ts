import { useState, useEffect } from 'react';
import { hasServiceWorker } from '$utils/platform';
import { authenticatedMediaFetch } from '$utils/matrix';
import { getFromMediaCache, putInMediaCache } from '$utils/mediaCache';

const blobCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string | undefined>>();

/**
 * On platforms without a service worker (e.g. Android WebViews), fetches
 * media with the access token and returns a blob: URL.
 * When a SW is available the original URL is returned unchanged.
 */
export function useAuthenticatedMediaUrl(
  url: string | undefined,
  accessToken: string | null | undefined
): string | undefined {
  const needsBlob = !hasServiceWorker();

  const [blobUrl, setBlobUrl] = useState<string | undefined>(() => {
    if (!url) return undefined;
    if (!needsBlob) return url;
    return blobCache.get(url) ?? undefined;
  });

  const [sourceUrl, setSourceUrl] = useState(url);
  if (url !== sourceUrl) {
    setSourceUrl(url);
    if (!url) {
      setBlobUrl(undefined);
    } else if (!needsBlob) {
      setBlobUrl(url);
    } else {
      setBlobUrl(blobCache.get(url) ?? undefined);
    }
  }

  useEffect(() => {
    if (!url || !needsBlob || blobCache.has(url)) return undefined;

    let cancelled = false;

    const fetchBlob = async () => {
      let promise = inflightRequests.get(url);
      if (!promise) {
        promise = (async () => {
          const cachedBlob = await getFromMediaCache(url);
          if (cachedBlob) {
            const objectUrl = URL.createObjectURL(cachedBlob);
            blobCache.set(url, objectUrl);
            return objectUrl;
          }

          const res = await authenticatedMediaFetch(url, accessToken);
          if (!res.ok) {
            inflightRequests.delete(url);
            return undefined;
          }
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          blobCache.set(url, objectUrl);

          putInMediaCache(url, blob);

          return objectUrl;
        })();
        inflightRequests.set(url, promise);
      }

      try {
        const result = await promise;
        if (!cancelled && result) setBlobUrl(result);
      } catch {
        // Silently fail — the image will show as broken.
      } finally {
        inflightRequests.delete(url);
      }
    };

    fetchBlob();

    return () => {
      cancelled = true;
    };
  }, [url, needsBlob, accessToken]);

  if (!url) return undefined;
  if (!needsBlob) return url;
  return blobUrl;
}
