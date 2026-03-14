import { useState, useEffect } from 'react';
import { authenticatedMediaFetch } from '$utils/matrix';
import { getFromMediaCache, putInMediaCache } from '$utils/mediaCache';

const imageBlobCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

export function useBlobCache(url?: string, accessToken?: string | null): string | undefined {
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
        const cachedBlob = await getFromMediaCache(url);
        if (cachedBlob) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          imageBlobCache.set(url, objectUrl);
          return objectUrl;
        }

        const res = await authenticatedMediaFetch(url, accessToken);
        if (!res.ok) {
          throw new Error(`Failed to fetch blob: ${res.status} ${res.statusText}`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);

        imageBlobCache.set(url, objectUrl);
        putInMediaCache(url, blob);

        return objectUrl;
      })();

      inflightRequests.set(url, requestPromise);

      try {
        const finalBlobUrl = await requestPromise;
        if (isMounted) {
          setCacheState({ sourceUrl: url, blobUrl: finalBlobUrl });
        }
      } catch {
        // silently fail
      } finally {
        inflightRequests.delete(url);
      }
    };

    fetchBlob();

    return () => {
      isMounted = false;
    };
  }, [url, accessToken]);

  return cacheState.blobUrl || url;
}
