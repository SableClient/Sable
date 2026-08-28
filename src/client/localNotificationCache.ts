import type { NotificationTab, StoredNotification } from '$utils/localNotifications';

export const NOTIFICATION_CACHE_KEY_PREFIX = 'sable.notificationCache.';

const CACHE_VERSION = 4;
const MAX_ENTRIES = 5_000;

type CacheData = {
  version: number;
  entries: StoredNotification[];
  historyCutoffs?: Partial<Record<NotificationTab, number>>;
};

const storageKeyFor = (userId: string): string =>
  `${NOTIFICATION_CACHE_KEY_PREFIX}v${CACHE_VERSION}.${encodeURIComponent(userId)}`;

const emptyCache = (): CacheData => ({ version: CACHE_VERSION, entries: [] });

const readCache = (key: string): CacheData => {
  try {
    const value = globalThis.localStorage?.getItem(key);
    if (!value) return emptyCache();
    const data = JSON.parse(value) as Partial<CacheData>;
    return data.version === CACHE_VERSION && Array.isArray(data.entries)
      ? {
          version: CACHE_VERSION,
          entries: data.entries,
          historyCutoffs: data.historyCutoffs,
        }
      : emptyCache();
  } catch {
    return emptyCache();
  }
};

export class LocalNotificationCache {
  private data: CacheData;
  private readonly key: string;
  private readonly listeners = new Set<() => void>();

  constructor(readonly userId: string) {
    this.key = storageKeyFor(userId);
    this.data = readCache(this.key);
    globalThis.addEventListener?.('storage', this.onStorage);
  }

  merge(entry: StoredNotification): void {
    this.mergeMany([entry]);
  }

  mergeMany(entries: StoredNotification[]): void {
    if (entries.length === 0) return;
    const merged = new Map(
      [...this.data.entries, ...entries].map((entry) => [entry.event.event_id, entry])
    );
    this.data.entries = [...merged.values()].toSorted((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
    this.write();
    this.notify();
  }

  getEntries(): StoredNotification[] {
    return this.data.entries.map((entry) => ({ ...entry }));
  }

  getHistoryCutoff(tab: NotificationTab): number | undefined {
    return this.data.historyCutoffs?.[tab];
  }

  extendHistoryTo(tab: NotificationTab, timestamp: number): void {
    const current = this.data.historyCutoffs?.[tab];
    if (current !== undefined && timestamp >= current) return;
    this.data.historyCutoffs = { ...this.data.historyCutoffs, [tab]: timestamp };
    this.write();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    globalThis.removeEventListener?.('storage', this.onStorage);
    this.listeners.clear();
  }

  private write(): void {
    let entries = this.data.entries;
    for (;;) {
      try {
        globalThis.localStorage?.setItem(this.key, JSON.stringify({ ...this.data, entries }));
        this.data.entries = entries;
        return;
      } catch {
        if (entries.length === 0) return;
        entries = entries.slice(0, Math.floor(entries.length / 2));
      }
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private onStorage = (event: StorageEvent): void => {
    if (event.key !== this.key) return;
    this.data = readCache(this.key);
    this.notify();
  };
}

const instances = new Map<string, LocalNotificationCache>();

export const getLocalNotificationCache = (userId: string): LocalNotificationCache => {
  const existing = instances.get(userId);
  if (existing) return existing;
  const cache = new LocalNotificationCache(userId);
  instances.set(userId, cache);
  return cache;
};

export const destroyLocalNotificationCache = (userId: string): void => {
  instances.get(userId)?.destroy();
  instances.delete(userId);
};

export const clearLocalNotificationCache = (userId: string): void => {
  destroyLocalNotificationCache(userId);
  try {
    globalThis.localStorage?.removeItem(storageKeyFor(userId));
  } catch {
    // Storage may be disabled; logout should still finish.
  }
};
