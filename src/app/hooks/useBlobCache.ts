import { useState, useEffect } from 'react';
import { authenticatedMediaFetch } from '$utils/matrix';

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
        const existingBlobUrl = await inflightRequests.get(url);
        if (isMounted) setCacheState({ sourceUrl: url, blobUrl: existingBlobUrl });
        return;
      }

      const requestPromise = (async () => {
        try {
          const res = await authenticatedMediaFetch(url, accessToken);
          if (!res.ok) throw new Error();
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);

          imageBlobCache.set(url, objectUrl);
          return objectUrl;
        } catch (e) {
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
