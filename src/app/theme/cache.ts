const DB_NAME = 'sable-theme-cache';
import { fetch } from '$utils/fetch';
const DB_VERSION = 1;
const STORE = 'themes';
const UPDATE_CHANNEL = 'sable-theme-cache-updates';

type CachedThemeEntry = {
  url: string;
  cssText: string;
  cachedAt: number;
  checkedAt?: number;
  contentHash?: string;
  etag?: string;
  lastModified?: string;
};

export type ThemeCacheRevalidationResult =
  | { status: 'updated'; url: string; previousHash?: string; contentHash: string }
  | { status: 'unchanged'; url: string; contentHash: string }
  | { status: 'skipped'; url: string; contentHash?: string }
  | { status: 'failed'; url: string; error: string };

export type ThemeCacheUpdate = {
  url: string;
  contentHash: string;
};

const updateListeners = new Set<(update: ThemeCacheUpdate) => void>();
let updateChannel: BroadcastChannel | undefined;

function isThemeCacheUpdate(value: unknown): value is ThemeCacheUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Record<string, unknown>;
  return typeof update.url === 'string' && typeof update.contentHash === 'string';
}

function getUpdateChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  if (!updateChannel) {
    updateChannel = new BroadcastChannel(UPDATE_CHANNEL);
    updateChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
      const update = event.data;
      if (!isThemeCacheUpdate(update)) return;
      updateListeners.forEach((listener) => listener(update));
    });
  }
  return updateChannel;
}

function notifyThemeCacheUpdated(update: ThemeCacheUpdate): void {
  updateListeners.forEach((listener) => listener(update));
  getUpdateChannel()?.postMessage(update);
}

export function subscribeThemeCacheUpdates(
  listener: (update: ThemeCacheUpdate) => void
): () => void {
  updateListeners.add(listener);
  getUpdateChannel();
  return () => updateListeners.delete(listener);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.addEventListener('error', () => reject(req.error));
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('upgradeneeded', () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'url' });
      }
    });
  });
}

let dbPromise: Promise<IDBDatabase> | undefined;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = openDb()
    .then((db) => {
      const forget = () => {
        if (dbPromise === pending) dbPromise = undefined;
      };
      db.addEventListener('close', forget);
      db.addEventListener('versionchange', () => {
        forget();
        db.close();
      });
      return db;
    })
    .catch((error) => {
      if (dbPromise === pending) dbPromise = undefined;
      throw error;
    });
  dbPromise = pending;
  return pending;
}

async function hashThemeCss(cssText: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(cssText);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    );
  } catch {
    let hash = 0x811c9dc5;
    for (let i = 0; i < cssText.length; i += 1) {
      hash = Math.imul(hash ^ cssText.charCodeAt(i), 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }
}

async function getCachedThemeEntry(url: string): Promise<CachedThemeEntry | undefined> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(url);
    req.addEventListener('error', () => reject(req.error));
    req.addEventListener('success', () => resolve(req.result as CachedThemeEntry | undefined));
  });
}

async function writeCachedThemeEntry(entry: CachedThemeEntry): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error));
  });
}

export async function getCachedThemeCss(url: string): Promise<string | undefined> {
  return (await getCachedThemeEntry(url))?.cssText;
}

export async function putCachedThemeCss(url: string, cssText: string): Promise<void> {
  const [existing, contentHash] = await Promise.all([
    getCachedThemeEntry(url),
    hashThemeCss(cssText),
  ]);
  const now = Date.now();
  await writeCachedThemeEntry({
    ...existing,
    url,
    cssText,
    cachedAt: now,
    checkedAt: now,
    contentHash,
    etag: undefined,
    lastModified: undefined,
  });
  if (existing && existing.contentHash !== contentHash) {
    notifyThemeCacheUpdated({ url, contentHash });
  }
}

export async function revalidateCachedThemeCss(
  url: string,
  maxAgeMs = 0
): Promise<ThemeCacheRevalidationResult> {
  try {
    const existing = await getCachedThemeEntry(url);
    const lastCheck = existing?.checkedAt ?? existing?.cachedAt ?? 0;
    if (maxAgeMs > 0 && Date.now() - lastCheck < maxAgeMs) {
      return { status: 'skipped', url, contentHash: existing?.contentHash };
    }

    const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (!response.ok) {
      return { status: 'failed', url, error: `Theme update check failed (${response.status}).` };
    }
    const cssText = await response.text();
    const contentHash = await hashThemeCss(cssText);
    const previousHash =
      existing?.contentHash ?? (existing ? await hashThemeCss(existing.cssText) : undefined);
    const now = Date.now();

    if (existing && previousHash === contentHash) {
      await writeCachedThemeEntry({
        ...existing,
        checkedAt: now,
        contentHash,
        etag: response.headers.get('etag') ?? existing.etag,
        lastModified: response.headers.get('last-modified') ?? existing.lastModified,
      });
      return { status: 'unchanged', url, contentHash };
    }

    await writeCachedThemeEntry({
      url,
      cssText,
      cachedAt: now,
      checkedAt: now,
      contentHash,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    });
    notifyThemeCacheUpdated({ url, contentHash });
    return { status: 'updated', url, previousHash, contentHash };
  } catch (error) {
    return {
      status: 'failed',
      url,
      error: error instanceof Error ? error.message : 'Theme update check failed.',
    };
  }
}
