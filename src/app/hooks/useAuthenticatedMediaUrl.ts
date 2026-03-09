import { useState, useEffect } from 'react';
import { hasServiceWorker } from '$utils/platform';
import { authenticatedMediaFetch } from '$utils/matrix';

const blobCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string | undefined>>();

/**
 * On platforms without service workers (e.g. Android WebViews), media URLs
 * that require authentication cannot be loaded directly by `<img>` tags
 * because there is no SW to inject the Authorization header. This hook
 * fetches the resource with the token attached and returns a blob URL.
 *
 * When a service worker IS available it returns the original URL unchanged.
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
        promise = authenticatedMediaFetch(url, accessToken).then(async (res) => {
          if (!res.ok) {
            inflightRequests.delete(url);
            return undefined;
          }
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          blobCache.set(url, objectUrl);
          return objectUrl;
        });
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
