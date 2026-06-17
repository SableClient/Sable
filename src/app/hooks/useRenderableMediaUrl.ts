import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import * as Sentry from '@sentry/react';
import { activeSessionIdAtom } from '$state/sessions';
import { fetchMediaBlob, getCurrentMediaSessionScope } from '$utils/mediaTransport';

type ObjectUrlEntry = {
  refs: number;
  settled: boolean;
  disposed: boolean;
  clearOnRelease: boolean;
  lastUsed: number;
  objectUrl?: string;
  promise: Promise<string>;
};

type ResolvedMediaUrlState = {
  cacheKey?: string;
  url?: string;
};

const objectUrlCache = new Map<string, ObjectUrlEntry>();
const inflightRequests = new Map<string, Promise<string>>();
const MAX_OBJECT_URL_CACHE_ENTRIES = 500;
let lastUsedCounter = 0;

function getObjectUrlCacheKey(sessionScope: string, url: string): string {
  return `${sessionScope}\x00${url}`;
}

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

function touchObjectUrlEntry(entry: ObjectUrlEntry): void {
  lastUsedCounter += 1;
  entry.lastUsed = lastUsedCounter;
}

function revokeObjectUrlEntry(entry: ObjectUrlEntry): void {
  entry.disposed = true;
  if (entry.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl);
    entry.objectUrl = undefined;
  }
}

function deleteObjectUrlEntryIfCurrent(cacheKey: string, entry: ObjectUrlEntry): void {
  if (objectUrlCache.get(cacheKey) === entry) {
    objectUrlCache.delete(cacheKey);
  }
}

function deleteInflightRequestIfCurrent(cacheKey: string, entry: ObjectUrlEntry): void {
  if (inflightRequests.get(cacheKey) === entry.promise) {
    inflightRequests.delete(cacheKey);
  }
}

function removeObjectUrlEntry(cacheKey: string, entry: ObjectUrlEntry): void {
  revokeObjectUrlEntry(entry);
  deleteObjectUrlEntryIfCurrent(cacheKey, entry);
  deleteInflightRequestIfCurrent(cacheKey, entry);
}

function pruneObjectUrlCache(): void {
  if (objectUrlCache.size <= MAX_OBJECT_URL_CACHE_ENTRIES) return;

  const evictable = Array.from(objectUrlCache.entries())
    .filter(([, entry]) => entry.refs === 0 && entry.settled && entry.objectUrl)
    .toSorted(([, a], [, b]) => a.lastUsed - b.lastUsed);

  for (const [cacheKey, entry] of evictable) {
    if (objectUrlCache.size <= MAX_OBJECT_URL_CACHE_ENTRIES) return;

    removeObjectUrlEntry(cacheKey, entry);
  }
}

function createObjectUrlEntry(cacheKey: string, url: string): ObjectUrlEntry {
  const entry = {
    refs: 0,
    settled: false,
    disposed: false,
    clearOnRelease: false,
    lastUsed: 0,
    objectUrl: undefined,
    promise: Promise.resolve(''),
  } as ObjectUrlEntry;
  touchObjectUrlEntry(entry);
  const startedAt = performance.now();

  entry.promise = Sentry.startSpan({ name: 'media.resolve', op: 'media' }, () =>
    fetchMediaBlob(url)
  )
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      if (entry.disposed) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('Renderable media cache entry was cleared');
      }

      entry.objectUrl = objectUrl;
      touchObjectUrlEntry(entry);
      Sentry.metrics.distribution(
        'sable.media.renderable_resolve_ms',
        performance.now() - startedAt,
        {
          attributes: { result: 'success' },
        }
      );
      return objectUrl;
    })
    .catch((error) => {
      Sentry.metrics.distribution(
        'sable.media.renderable_resolve_ms',
        performance.now() - startedAt,
        {
          attributes: { result: 'error' },
        }
      );
      deleteObjectUrlEntryIfCurrent(cacheKey, entry);
      throw error;
    })
    .finally(() => {
      entry.settled = true;
      deleteInflightRequestIfCurrent(cacheKey, entry);

      if (!entry.objectUrl) {
        deleteObjectUrlEntryIfCurrent(cacheKey, entry);
        return;
      }

      if (entry.clearOnRelease && entry.refs === 0) {
        removeObjectUrlEntry(cacheKey, entry);
        return;
      }

      pruneObjectUrlCache();
    });

  objectUrlCache.set(cacheKey, entry);
  inflightRequests.set(cacheKey, entry.promise);

  return entry;
}

function retainObjectUrlEntry(cacheKey: string, url: string): ObjectUrlEntry {
  const entry = objectUrlCache.get(cacheKey) ?? createObjectUrlEntry(cacheKey, url);
  entry.refs += 1;
  touchObjectUrlEntry(entry);
  return entry;
}

function getCachedObjectUrl(cacheKey: string | undefined): string | undefined {
  if (!cacheKey) return undefined;

  const entry = objectUrlCache.get(cacheKey);
  if (!entry?.objectUrl || entry.disposed) return undefined;

  return entry.objectUrl;
}

function releaseObjectUrlEntry(cacheKey: string, entry: ObjectUrlEntry): void {
  if (objectUrlCache.get(cacheKey) !== entry) return;

  entry.refs = Math.max(0, entry.refs - 1);
  touchObjectUrlEntry(entry);
  if (entry.refs === 0 && entry.clearOnRelease && entry.settled) {
    removeObjectUrlEntry(cacheKey, entry);
    return;
  }
  pruneObjectUrlCache();
}

export function getRenderableMediaUrlStats(): { cacheSize: number; inflightCount: number } {
  return { cacheSize: objectUrlCache.size, inflightCount: inflightRequests.size };
}

export function clearRenderableMediaUrlCache(): void {
  objectUrlCache.forEach((entry, cacheKey) => {
    if (entry.refs > 0) {
      entry.clearOnRelease = true;
      touchObjectUrlEntry(entry);
      return;
    }

    removeObjectUrlEntry(cacheKey, entry);
  });
}

export async function prewarmRenderableMediaUrls(
  urls: string[],
  sessionScope = getCurrentMediaSessionScope()
): Promise<void> {
  const entries = urls.flatMap((url) => {
    const renderableUrl = normalizeRenderableMediaUrl(url);
    if (!renderableUrl || renderableUrl.startsWith('blob:')) return [];

    const cacheKey = getObjectUrlCacheKey(sessionScope, renderableUrl);
    const entry = objectUrlCache.get(cacheKey) ?? createObjectUrlEntry(cacheKey, renderableUrl);
    touchObjectUrlEntry(entry);
    return [entry];
  });

  await Promise.allSettled(entries.map((entry) => entry.promise));
}

export function useRenderableMediaUrl(url: string | undefined): string | undefined {
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const sessionScope = activeSessionId ?? getCurrentMediaSessionScope();
  const renderableUrl = normalizeRenderableMediaUrl(url);
  const objectUrlCacheKey =
    renderableUrl && !renderableUrl.startsWith('blob:')
      ? getObjectUrlCacheKey(sessionScope, renderableUrl)
      : undefined;
  const usesExistingObjectUrl = renderableUrl?.startsWith('blob:') ?? false;
  const [resolvedState, setResolvedState] = useState<ResolvedMediaUrlState>(() => ({
    cacheKey: objectUrlCacheKey,
    url: usesExistingObjectUrl ? renderableUrl : getCachedObjectUrl(objectUrlCacheKey),
  }));

  useEffect(() => {
    if (!renderableUrl) {
      setResolvedState({ cacheKey: undefined, url: undefined });
      return undefined;
    }

    if (usesExistingObjectUrl) {
      setResolvedState({ cacheKey: undefined, url: renderableUrl });
      return undefined;
    }

    if (!objectUrlCacheKey) {
      setResolvedState({ cacheKey: undefined, url: undefined });
      return undefined;
    }

    const entry = retainObjectUrlEntry(objectUrlCacheKey, renderableUrl);
    let cancelled = false;
    const { objectUrl } = entry;

    setResolvedState({ cacheKey: objectUrlCacheKey, url: objectUrl });

    entry.promise
      .then((resolvedObjectUrl) => {
        if (!cancelled) {
          setResolvedState({ cacheKey: objectUrlCacheKey, url: resolvedObjectUrl });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedState({ cacheKey: objectUrlCacheKey, url: undefined });
        }
      });

    return () => {
      cancelled = true;
      releaseObjectUrlEntry(objectUrlCacheKey, entry);
    };
  }, [objectUrlCacheKey, renderableUrl, usesExistingObjectUrl]);

  if (usesExistingObjectUrl) {
    return renderableUrl;
  }

  if (resolvedState.cacheKey !== objectUrlCacheKey) {
    return getCachedObjectUrl(objectUrlCacheKey);
  }

  return resolvedState.url ?? getCachedObjectUrl(objectUrlCacheKey);
}
