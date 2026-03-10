const CACHE_NAME = 'sable-media-v1';
const MAX_ENTRIES = 500;

async function openCache(): Promise<Cache | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

export async function getFromMediaCache(url: string): Promise<Blob | undefined> {
  const cache = await openCache();
  if (!cache) return undefined;
  try {
    const response = await cache.match(url);
    if (!response) return undefined;
    return await response.blob();
  } catch {
    return undefined;
  }
}

async function evictIfNeeded(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    const overflow = keys.length - MAX_ENTRIES;
    if (overflow <= 0) return;
    // Delete oldest entries (keys() returns insertion order).
    await Promise.all(keys.slice(0, overflow).map((req) => cache.delete(req)));
  } catch {
    // Best-effort eviction.
  }
}

export async function putInMediaCache(url: string, blob: Blob): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(
      url,
      new Response(blob, {
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      })
    );
    await evictIfNeeded(cache);
  } catch {
    // Storage full or unavailable — silently degrade to in-memory only.
  }
}
