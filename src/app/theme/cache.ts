const DB_NAME = 'sable-theme-cache';
const DB_VERSION = 1;
const STORE = 'themes';

export type CachedThemeEntry = {
  url: string;
  cssText: string;
  cachedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.addEventListener('error', () => reject(req.error));
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('upgradeneeded', () => {
      req.result.createObjectStore(STORE, { keyPath: 'url' });
    });
  });
}

export async function getCachedThemeCss(url: string): Promise<string | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(url);
    req.addEventListener('error', () => reject(req.error));
    req.addEventListener('success', () => {
      const row = req.result as CachedThemeEntry | undefined;
      resolve(row?.cssText);
    });
  });
}

export async function putCachedThemeCss(url: string, cssText: string): Promise<void> {
  const db = await openDb();
  const entry: CachedThemeEntry = { url, cssText, cachedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error));
  });
}

export async function clearThemeCache(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error));
  });
}
