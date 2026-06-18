const DB_NAME = 'sable-theme-cache';
const DB_VERSION = 1;
const STORE = 'themes';
const APPLIED_THEME_STORAGE_KEY = 'sable_applied_remote_theme_css';
const APPLIED_TWEAKS_STORAGE_KEY = 'sable_applied_remote_tweaks_css';

export type CachedThemeEntry = {
  url: string;
  cssText: string;
  cachedAt: number;
};

type AppliedThemeSnapshot = {
  url: string;
  cssText: string;
  cachedAt: number;
};

type AppliedTweakSnapshot = {
  urls: string[];
  cssText: string;
  cachedAt: number;
};

function normalizeUrl(url: string): string {
  return url.trim();
}

function normalizeUrls(urls: string[]): string[] {
  return urls.map(normalizeUrl).filter((url) => url.length > 0);
}

function readLocalStorageJson(key: string): unknown {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeLocalStorageJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* local cache is best-effort */
  }
}

function removeLocalStorageKey(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* local cache is best-effort */
  }
}

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

export function getStoredAppliedThemeCss(url: string): string | undefined {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return undefined;
  const snapshot = readLocalStorageJson(APPLIED_THEME_STORAGE_KEY) as
    | AppliedThemeSnapshot
    | undefined;
  if (!snapshot) return undefined;
  if (normalizeUrl(snapshot.url) !== normalizedUrl) return undefined;
  return typeof snapshot.cssText === 'string' && snapshot.cssText.length > 0
    ? snapshot.cssText
    : undefined;
}

export function putStoredAppliedThemeCss(url: string, cssText: string): void {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl || !cssText) {
    removeLocalStorageKey(APPLIED_THEME_STORAGE_KEY);
    return;
  }
  writeLocalStorageJson(APPLIED_THEME_STORAGE_KEY, {
    url: normalizedUrl,
    cssText,
    cachedAt: Date.now(),
  } satisfies AppliedThemeSnapshot);
}

export function clearStoredAppliedThemeCss(): void {
  removeLocalStorageKey(APPLIED_THEME_STORAGE_KEY);
}

export function getStoredAppliedTweakCss(urls: string[]): string | undefined {
  const normalizedUrls = normalizeUrls(urls);
  if (normalizedUrls.length === 0) return undefined;
  const snapshot = readLocalStorageJson(APPLIED_TWEAKS_STORAGE_KEY) as
    | AppliedTweakSnapshot
    | undefined;
  if (!snapshot) return undefined;
  const snapshotUrls = normalizeUrls(snapshot.urls ?? []);
  if (snapshotUrls.length !== normalizedUrls.length) return undefined;
  if (snapshotUrls.some((url, index) => url !== normalizedUrls[index])) return undefined;
  return typeof snapshot.cssText === 'string' && snapshot.cssText.length > 0
    ? snapshot.cssText
    : undefined;
}

export function putStoredAppliedTweakCss(urls: string[], cssText: string): void {
  const normalizedUrls = normalizeUrls(urls);
  if (normalizedUrls.length === 0 || !cssText) {
    removeLocalStorageKey(APPLIED_TWEAKS_STORAGE_KEY);
    return;
  }
  writeLocalStorageJson(APPLIED_TWEAKS_STORAGE_KEY, {
    urls: normalizedUrls,
    cssText,
    cachedAt: Date.now(),
  } satisfies AppliedTweakSnapshot);
}

export function clearStoredAppliedTweakCss(): void {
  removeLocalStorageKey(APPLIED_TWEAKS_STORAGE_KEY);
}
