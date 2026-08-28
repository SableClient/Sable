import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearMediaCache, getFromMediaCache, putInMediaCache } from './mediaCache';

class FakeCache {
  private store = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }

  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map((url) => new Request(url));
  }

  async delete(request: Request): Promise<boolean> {
    return this.store.delete(request.url);
  }
}

class FakeCacheStorage {
  private caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    const existing = this.caches.get(name);
    if (existing) return existing;
    const created = new FakeCache();
    this.caches.set(name, created);
    return created;
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

const setCaches = (value: unknown) => {
  (globalThis as { caches?: unknown }).caches = value;
};

beforeEach(() => {
  setCaches(new FakeCacheStorage());
});

afterEach(() => {
  setCaches(undefined);
});

describe('mediaCache', () => {
  it('stores then retrieves an entry, and misses unknown urls', async () => {
    await putInMediaCache('https://media.example/x', new Blob(['hello'], { type: 'text/plain' }));
    expect(await getFromMediaCache('https://media.example/x')).toBeInstanceOf(Blob);
    expect(await getFromMediaCache('https://media.example/other')).toBeUndefined();
  });

  it('clearMediaCache empties the cache', async () => {
    await putInMediaCache('https://media.example/x', new Blob(['hi']));
    await clearMediaCache();
    expect(await getFromMediaCache('https://media.example/x')).toBeUndefined();
  });

  it('degrades safely when caches is unavailable', async () => {
    setCaches(undefined);
    await expect(clearMediaCache()).resolves.toBeUndefined();
    await expect(getFromMediaCache('https://media.example/x')).resolves.toBeUndefined();
  });
});
