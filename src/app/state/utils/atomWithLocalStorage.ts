import { atom } from 'jotai';
import { NOTIFICATION_CACHE_KEY_PREFIX } from '$client/localNotificationCache';
import { SIDEBAR_CACHE_KEY_PREFIX } from '$client/slidingSyncSidebarCache';

const EVICTABLE_KEY_PREFIXES = [NOTIFICATION_CACHE_KEY_PREFIX, SIDEBAR_CACHE_KEY_PREFIX];

export const getLocalStorageItem = <T>(key: string, defaultValue: T): T => {
  const item = localStorage.getItem(key);
  if (item === null) return defaultValue;
  if (item === 'undefined') return undefined as T;
  try {
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
};

export const setLocalStorageItem = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Losing a rotated token leaves an already-invalidated one on disk, which logs
// the user out on next start. Evict non-essential caches and retry instead.
export const setEssentialLocalStorageItem = (key: string, value: unknown) => {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(key, serialized);
    return;
  } catch {
    for (const candidate of Object.keys(localStorage)) {
      if (candidate !== key && EVICTABLE_KEY_PREFIXES.some((p) => candidate.startsWith(p))) {
        localStorage.removeItem(candidate);
      }
    }
  }
  localStorage.setItem(key, serialized);
};

export type GetLocalStorageItem<T> = (key: string) => T;
export type SetLocalStorageItem<T> = (key: string, value: T) => void;

export const atomWithLocalStorage = <T>(
  key: string,
  getItem: GetLocalStorageItem<T>,
  setItem: SetLocalStorageItem<T>
) => {
  const value = getItem(key);

  const baseAtom = atom(value);

  baseAtom.onMount = (setAtom) => {
    const handleChange = (evt: StorageEvent) => {
      if (evt.key !== key) return;
      setAtom(getItem(key));
    };

    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener('storage', handleChange);
    };
  };

  const localStorageAtom = atom<T, [T | ((prev: T) => T)], undefined>(
    (get) => get(baseAtom),
    (get, set, newValue) => {
      const resolved =
        typeof newValue === 'function' ? (newValue as (prev: T) => T)(get(baseAtom)) : newValue;
      set(baseAtom, resolved);
      setItem(key, resolved);
    }
  );

  return localStorageAtom;
};
