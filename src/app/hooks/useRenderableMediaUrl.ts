import { useEffect, useState } from 'react';
import { fetchMediaBlob } from '$utils/mediaTransport';
import { hasServiceWorker } from '$utils/platform';

type ObjectUrlEntry = {
  refs: number;
  settled: boolean;
  objectUrl?: string;
  promise: Promise<string>;
};

const objectUrlCache = new Map<string, ObjectUrlEntry>();
const inflightRequests = new Map<string, Promise<string>>();

function normalizeRenderableMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('blob:')) return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function createObjectUrlEntry(url: string): ObjectUrlEntry {
  const entry = {
    refs: 0,
    settled: false,
    objectUrl: undefined,
    promise: Promise.resolve(''),
  } as ObjectUrlEntry;

  entry.promise = fetchMediaBlob(url)
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      entry.objectUrl = objectUrl;
      return objectUrl;
    })
    .finally(() => {
      entry.settled = true;
      inflightRequests.delete(url);
      if (entry.refs === 0 && entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
        objectUrlCache.delete(url);
      }
    });

  objectUrlCache.set(url, entry);
  inflightRequests.set(url, entry.promise);

  return entry;
}

function retainObjectUrlEntry(url: string): ObjectUrlEntry {
  const entry = objectUrlCache.get(url) ?? createObjectUrlEntry(url);
  entry.refs += 1;
  return entry;
}

function releaseObjectUrlEntry(url: string): void {
  const entry = objectUrlCache.get(url);
  if (!entry) return;

  entry.refs -= 1;
  if (entry.refs > 0 || !entry.settled) return;
  if (entry.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  objectUrlCache.delete(url);
}

export function getRenderableMediaUrlStats(): { cacheSize: number; inflightCount: number } {
  return { cacheSize: objectUrlCache.size, inflightCount: inflightRequests.size };
}

export function useRenderableMediaUrl(url: string | undefined): string | undefined {
  const needsBlob = !hasServiceWorker();
  const renderableUrl = normalizeRenderableMediaUrl(url);
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() =>
    needsBlob ? undefined : renderableUrl
  );

  useEffect(() => {
    if (!renderableUrl) {
      setResolvedUrl(undefined);
      return undefined;
    }

    if (!needsBlob) {
      setResolvedUrl(renderableUrl);
      return undefined;
    }

    const entry = retainObjectUrlEntry(renderableUrl);
    let cancelled = false;

    setResolvedUrl(entry.objectUrl);

    entry.promise
      .then((objectUrl) => {
        if (!cancelled) {
          setResolvedUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedUrl(undefined);
        }
      });

    return () => {
      cancelled = true;
      releaseObjectUrlEntry(renderableUrl);
    };
  }, [needsBlob, renderableUrl]);

  return needsBlob ? resolvedUrl : renderableUrl;
}
