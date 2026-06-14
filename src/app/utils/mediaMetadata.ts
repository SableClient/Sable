export type MediaMetadataKind = 'image' | 'video';

export type CachedMediaMetadata = {
  width?: number;
  height?: number;
  duration?: number;
  mimeType?: string;
  byteSize?: number;
  kind?: MediaMetadataKind;
  cachedAt: number;
};

const METADATA_CACHE_NAME = 'sable-media-metadata-v1';
const METADATA_CACHE_REQUEST_PREFIX = 'https://sable.local/media-metadata/';
const MAX_METADATA_ENTRIES = 1000;
const VIDEO_METADATA_TIMEOUT_MS = 10_000;

const memoryMetadata = new Map<string, CachedMediaMetadata>();
const metadataListeners = new Map<
  string,
  Set<(metadata: CachedMediaMetadata | undefined) => void>
>();

const positiveFinite = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

async function openMetadataCache(): Promise<Cache | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    return await caches.open(METADATA_CACHE_NAME);
  } catch {
    return undefined;
  }
}

function notifyMetadataListeners(
  cacheKey: string,
  metadata: CachedMediaMetadata | undefined
): void {
  metadataListeners.get(cacheKey)?.forEach((listener) => listener(metadata));
}

async function evictMetadataIfNeeded(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    const overflow = keys.length - MAX_METADATA_ENTRIES;
    if (overflow <= 0) return;
    await Promise.all(keys.slice(0, overflow).map((req) => cache.delete(req)));
  } catch {
    // Best-effort eviction.
  }
}

function getMetadataCacheRequest(cacheKey: string): Request {
  return new Request(`${METADATA_CACHE_REQUEST_PREFIX}${encodeURIComponent(cacheKey)}`);
}

function normalizeMediaMetadata(metadata: unknown): CachedMediaMetadata | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = metadata as Partial<CachedMediaMetadata>;
  const width = positiveFinite(raw.width) ? Math.round(raw.width) : undefined;
  const height = positiveFinite(raw.height) ? Math.round(raw.height) : undefined;
  const duration = positiveFinite(raw.duration) ? Math.round(raw.duration) : undefined;
  const byteSize = positiveFinite(raw.byteSize) ? Math.round(raw.byteSize) : undefined;
  const cachedAt = positiveFinite(raw.cachedAt) ? Math.round(raw.cachedAt) : Date.now();
  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType : undefined;
  const kind = raw.kind === 'image' || raw.kind === 'video' ? raw.kind : undefined;

  if (!width && !height && !duration && !byteSize && !mimeType && !kind) return undefined;

  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(duration ? { duration } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(byteSize ? { byteSize } : {}),
    ...(kind ? { kind } : {}),
    cachedAt,
  };
}

async function putMediaMetadata(cacheKey: string, metadata: CachedMediaMetadata): Promise<void> {
  memoryMetadata.set(cacheKey, metadata);
  notifyMetadataListeners(cacheKey, metadata);

  const cache = await openMetadataCache();
  if (!cache) return;
  try {
    await cache.put(
      getMetadataCacheRequest(cacheKey),
      new Response(JSON.stringify(metadata), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cached-At': metadata.cachedAt.toString(),
        },
      })
    );
    await evictMetadataIfNeeded(cache);
  } catch {
    // Storage full or unavailable — keep the in-memory copy only.
  }
}

export async function getMediaMetadata(
  cacheKey: string | undefined
): Promise<CachedMediaMetadata | undefined> {
  if (!cacheKey) return undefined;

  const mem = memoryMetadata.get(cacheKey);
  if (mem) return mem;

  const cache = await openMetadataCache();
  if (!cache) return undefined;

  try {
    const response = await cache.match(getMetadataCacheRequest(cacheKey));
    if (!response) return undefined;

    const metadata = normalizeMediaMetadata(await response.json());
    if (!metadata) return undefined;

    memoryMetadata.set(cacheKey, metadata);
    return metadata;
  } catch {
    return undefined;
  }
}

export function getMediaMetadataSnapshot(
  cacheKey: string | undefined
): CachedMediaMetadata | undefined {
  return cacheKey ? memoryMetadata.get(cacheKey) : undefined;
}

export function subscribeMediaMetadata(
  cacheKey: string | undefined,
  listener: (metadata: CachedMediaMetadata | undefined) => void
): () => void {
  if (!cacheKey) return () => undefined;

  let listeners = metadataListeners.get(cacheKey);
  if (!listeners) {
    listeners = new Set();
    metadataListeners.set(cacheKey, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      metadataListeners.delete(cacheKey);
    }
  };
}

async function measureImageBlob(blob: Blob): Promise<Partial<CachedMediaMetadata>> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const metadata = { height: bitmap.height, width: bitmap.width };
      bitmap.close();
      return metadata;
    } catch {
      // Fall through to HTMLImageElement below.
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') return {};

  return await new Promise<Partial<CachedMediaMetadata>>((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    const cleanup = () => {
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
      URL.revokeObjectURL(objectUrl);
    };
    const handleLoad = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      cleanup();
      resolve({
        ...(positiveFinite(width) ? { width } : {}),
        ...(positiveFinite(height) ? { height } : {}),
      });
    };
    const handleError = () => {
      cleanup();
      resolve({});
    };
    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    image.src = objectUrl;
  });
}

async function measureVideoBlob(blob: Blob): Promise<Partial<CachedMediaMetadata>> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return {};

  return await new Promise<Partial<CachedMediaMetadata>>((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve({});
    }, VIDEO_METADATA_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    video.preload = 'metadata';
    const handleLoadedMetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      cleanup();
      resolve({
        ...(positiveFinite(width) ? { width } : {}),
        ...(positiveFinite(height) ? { height } : {}),
        ...(positiveFinite(duration) ? { duration } : {}),
      });
    };
    const handleError = () => {
      cleanup();
      resolve({});
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.src = objectUrl;
  });
}

export async function storeMediaMetadataForBlob(
  cacheKey: string | undefined,
  blob: Blob,
  kind?: MediaMetadataKind
): Promise<CachedMediaMetadata | undefined> {
  if (!cacheKey) return undefined;

  const mimeType = blob.type || undefined;
  const resolvedKind =
    kind ??
    (mimeType?.startsWith('image/')
      ? 'image'
      : mimeType?.startsWith('video/')
        ? 'video'
        : undefined);

  const measured =
    resolvedKind === 'image'
      ? await measureImageBlob(blob)
      : resolvedKind === 'video'
        ? await measureVideoBlob(blob)
        : {};

  const metadata = normalizeMediaMetadata({
    ...measured,
    ...(mimeType ? { mimeType } : {}),
    byteSize: blob.size,
    ...(resolvedKind ? { kind: resolvedKind } : {}),
    cachedAt: Date.now(),
  });
  if (!metadata) return undefined;

  await putMediaMetadata(cacheKey, metadata);
  return metadata;
}

export async function clearMediaMetadataCache(): Promise<void> {
  memoryMetadata.clear();
  metadataListeners.forEach((listeners, cacheKey) => {
    listeners.forEach((listener) => listener(undefined));
    metadataListeners.delete(cacheKey);
  });
  const cache = await openMetadataCache();
  if (cache) {
    await caches.delete(METADATA_CACHE_NAME);
  }
}
