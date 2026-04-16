import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { activeSessionIdAtom } from '$state/sessions';
import { fetchMediaBlob, getCurrentMediaSessionScope } from '$utils/mediaTransport';
import { hasControllingServiceWorker, hasServiceWorker } from '$utils/platform';

type ObjectUrlEntry = {
  refs: number;
  settled: boolean;
  objectUrl?: string;
  promise: Promise<string>;
};

type ResolvedMediaUrlState = {
  cacheKey?: string;
  url?: string;
};

const objectUrlCache = new Map<string, ObjectUrlEntry>();
const inflightRequests = new Map<string, Promise<string>>();

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

function createObjectUrlEntry(cacheKey: string, url: string): ObjectUrlEntry {
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
      inflightRequests.delete(cacheKey);
      if (entry.refs === 0 && entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
        objectUrlCache.delete(cacheKey);
      }
    });

  objectUrlCache.set(cacheKey, entry);
  inflightRequests.set(cacheKey, entry.promise);

  return entry;
}

function retainObjectUrlEntry(cacheKey: string, url: string): ObjectUrlEntry {
  const entry = objectUrlCache.get(cacheKey) ?? createObjectUrlEntry(cacheKey, url);
  entry.refs += 1;
  return entry;
}

function releaseObjectUrlEntry(cacheKey: string): void {
  const entry = objectUrlCache.get(cacheKey);
  if (!entry) return;

  entry.refs -= 1;
  if (entry.refs > 0 || !entry.settled) return;
  if (entry.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  objectUrlCache.delete(cacheKey);
}

export function getRenderableMediaUrlStats(): { cacheSize: number; inflightCount: number } {
  return { cacheSize: objectUrlCache.size, inflightCount: inflightRequests.size };
}

export function useRenderableMediaUrl(url: string | undefined): string | undefined {
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const sessionScope = activeSessionId ?? getCurrentMediaSessionScope();
  const renderableUrl = normalizeRenderableMediaUrl(url);
  const objectUrlCacheKey =
    renderableUrl && !renderableUrl.startsWith('blob:')
      ? getObjectUrlCacheKey(sessionScope, renderableUrl)
      : undefined;
  const [usesControlledServiceWorker, setUsesControlledServiceWorker] = useState(() =>
    hasControllingServiceWorker()
  );
  const needsBlob = !usesControlledServiceWorker;
  const usesExistingObjectUrl = renderableUrl?.startsWith('blob:') ?? false;
  const [resolvedState, setResolvedState] = useState<ResolvedMediaUrlState>(() => ({
    cacheKey: objectUrlCacheKey,
    url: needsBlob && !usesExistingObjectUrl ? undefined : renderableUrl,
  }));

  useEffect(() => {
    if (!hasServiceWorker()) {
      setUsesControlledServiceWorker(false);
      return undefined;
    }

    const { serviceWorker } = navigator;
    if (!serviceWorker) {
      setUsesControlledServiceWorker(false);
      return undefined;
    }

    const updateControlState = () => {
      setUsesControlledServiceWorker(hasControllingServiceWorker());
    };

    updateControlState();
    serviceWorker.addEventListener('controllerchange', updateControlState);
    serviceWorker.ready.then(updateControlState).catch(() => undefined);

    return () => {
      serviceWorker.removeEventListener('controllerchange', updateControlState);
    };
  }, []);

  useEffect(() => {
    if (!renderableUrl) {
      setResolvedState({ cacheKey: undefined, url: undefined });
      return undefined;
    }

    if (!needsBlob) {
      setResolvedState({ cacheKey: undefined, url: renderableUrl });
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
      releaseObjectUrlEntry(objectUrlCacheKey);
    };
  }, [needsBlob, objectUrlCacheKey, renderableUrl, usesExistingObjectUrl]);

  if (!needsBlob || usesExistingObjectUrl) {
    return renderableUrl;
  }

  if (resolvedState.cacheKey !== objectUrlCacheKey) {
    return undefined;
  }

  return resolvedState.url;
}
