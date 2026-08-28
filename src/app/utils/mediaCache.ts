const CACHE_NAME = 'sable-media-v2';
const LEGACY_CACHE_NAMES = ['sable-media-v1'];
const MAX_ENTRIES = 500;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const EVICT_EVERY_WRITES = 25;

const pendingBlobs = new Map<string, Blob>();
let writesSinceEviction = 0;
let evictionScheduled = false;
let legacyCachesCleaned = false;

export async function clearMediaCache(): Promise<void> {
  pendingBlobs.clear();
  writesSinceEviction = 0;
  if (typeof caches === 'undefined') return;
  try {
    await Promise.all([CACHE_NAME, ...LEGACY_CACHE_NAMES].map((name) => caches.delete(name)));
  } catch {
    // ignore
  }
}

async function openCache(): Promise<Cache | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    if (!legacyCachesCleaned) {
      legacyCachesCleaned = true;
      void Promise.all(LEGACY_CACHE_NAMES.map((name) => caches.delete(name))).catch(
        () => undefined
      );
    }
    return await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

function getCacheRequest(url: string): Request {
  const isAbsoluteHttpUrl = /^https?:\/\//i.test(url);
  if (!isAbsoluteHttpUrl) {
    return new Request(`https://sable-media-cache.invalid/${encodeURIComponent(url)}`);
  }

  try {
    return new Request(url);
  } catch {
    return new Request(`https://sable-media-cache.invalid/${encodeURIComponent(url)}`);
  }
}

export async function getFromMediaCache(url: string): Promise<Blob | undefined> {
  const pendingBlob = pendingBlobs.get(url);
  if (pendingBlob) return pendingBlob;

  const cache = await openCache();
  if (!cache) return undefined;
  try {
    const response = await cache.match(getCacheRequest(url));
    if (!response) return undefined;
    return await response.blob();
  } catch {
    return undefined;
  }
}

async function evictIfNeeded(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    const responses = await Promise.all(keys.map((request) => cache.match(request)));
    const sizes = responses.map((response) => {
      const value = Number(response?.headers.get('Content-Length'));
      return Number.isFinite(value) && value > 0 ? value : 0;
    });
    let totalBytes = sizes.reduce((total, size) => total + size, 0);
    let remainingEntries = keys.length;
    const deletions: Promise<boolean>[] = [];

    // keys() is insertion ordered, so remove the oldest entries until both budgets fit.
    for (let index = 0; index < keys.length; index += 1) {
      if (remainingEntries <= MAX_ENTRIES && totalBytes <= MAX_CACHE_BYTES) break;
      const request = keys[index];
      if (!request) continue;
      deletions.push(cache.delete(request));
      remainingEntries -= 1;
      totalBytes -= sizes[index] ?? 0;
    }
    await Promise.all(deletions);
  } catch {
    // Best-effort eviction.
  }
}

function scheduleEviction(cache: Cache, force = false): void {
  writesSinceEviction += 1;
  if ((!force && writesSinceEviction < EVICT_EVERY_WRITES) || evictionScheduled) return;

  writesSinceEviction = 0;
  evictionScheduled = true;
  globalThis.setTimeout(() => {
    void evictIfNeeded(cache).finally(() => {
      evictionScheduled = false;
    });
  }, 0);
}

// Cache contract:
// - keyed by the final media URL
// - stores successful responses only
// - persists blobs, never error responses or intermediate auth state
export async function putInMediaCache(url: string, blob: Blob): Promise<void> {
  pendingBlobs.set(url, blob);
  const cache = await openCache();
  if (!cache) {
    pendingBlobs.delete(url);
    return;
  }
  try {
    await cache.put(
      getCacheRequest(url),
      new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
          'Content-Length': String(blob.size),
        },
      })
    );
    scheduleEviction(cache, blob.size > MAX_CACHE_BYTES);
  } catch {
    // Storage full or unavailable — silently degrade to in-memory only.
  } finally {
    if (pendingBlobs.get(url) === blob) pendingBlobs.delete(url);
  }
}
