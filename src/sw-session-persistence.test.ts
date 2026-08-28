/* oxlint-disable vitest/require-mock-type-parameters */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPersistedSession } from './sw-session-persistence';

vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  precacheAndRoute: vi.fn(),
}));

describe('readPersistedSession', () => {
  it('keeps older persisted sessions instead of expiring them after one minute', () => {
    const persistedAt = Date.now() - 1000 * 60 * 60 * 6;

    expect(
      readPersistedSession({
        accessToken: 'token',
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        persistedAt,
      })
    ).toEqual({
      accessToken: 'token',
      baseUrl: 'https://matrix.example.org',
      userId: '@alice:example.org',
      persistedAt,
    });
  });
});

describe('service worker session persistence', () => {
  let addEventListener: ReturnType<typeof vi.fn>;
  let cachePut: ReturnType<typeof vi.fn>;
  let resolveCachePut: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    addEventListener = vi.fn();
    cachePut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCachePut = resolve;
        })
    );

    vi.stubGlobal('self', {
      __WB_MANIFEST: [],
      addEventListener,
      caches: {
        open: vi.fn(async () => ({
          delete: vi.fn(async () => true),
          match: vi.fn(async () => undefined),
          put: cachePut,
        })),
      },
      clients: {
        claim: vi.fn(),
        get: vi.fn(),
        matchAll: vi.fn(async () => []),
      },
      registration: {},
    });
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>());
    await import('./sw');
  });

  it('keeps setSession persistence alive through waitUntil', async () => {
    const messageHandler = addEventListener.mock.calls.find(([type]) => type === 'message')?.[1] as
      | ((event: ExtendableMessageEvent) => void)
      | undefined;
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

    messageHandler?.({
      source: { id: 'client-a' },
      data: {
        type: 'setSession',
        accessToken: 'token',
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
      },
      waitUntil,
    } as unknown as ExtendableMessageEvent);

    expect(messageHandler).toBeTypeOf('function');
    expect(waitUntil).toHaveBeenCalledOnce();

    let settled = false;
    const lifetime = waitUntil.mock.calls[0]?.[0];
    void lifetime?.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(resolveCachePut).toBeTypeOf('function'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    resolveCachePut?.();
    await expect(lifetime).resolves.toBeUndefined();
  });

  it('settles the worker lifetime when session persistence fails', async () => {
    cachePut.mockRejectedValueOnce(new Error('cache unavailable'));
    const messageHandler = addEventListener.mock.calls.find(([type]) => type === 'message')?.[1] as
      | ((event: ExtendableMessageEvent) => void)
      | undefined;
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

    messageHandler?.({
      source: { id: 'client-a' },
      data: {
        type: 'setSession',
        accessToken: 'token',
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
      },
      waitUntil,
    } as unknown as ExtendableMessageEvent);

    expect(waitUntil).toHaveBeenCalledOnce();
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });
});
