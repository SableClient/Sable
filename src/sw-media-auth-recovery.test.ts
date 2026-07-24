/* oxlint-disable vitest/require-mock-type-parameters */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { swTestHooks as swTestHooksHelper } from './sw';

vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  precacheAndRoute: vi.fn(),
}));

type SwTestHooks = typeof swTestHooksHelper;

describe('service worker media auth recovery', () => {
  let swTestHooks: SwTestHooks;
  let clients: Map<string, Client>;

  beforeEach(async () => {
    vi.resetModules();
    clients = new Map();
    vi.stubGlobal('self', {
      __WB_MANIFEST: [],
      addEventListener: vi.fn(),
      caches: {
        open: vi.fn(async () => ({
          delete: vi.fn(async () => true),
          match: vi.fn(async () => undefined),
          put: vi.fn(async () => undefined),
        })),
      },
      clients: {
        claim: vi.fn(),
        get: vi.fn(async (id: string) => clients.get(id)),
        matchAll: vi.fn(async () => Array.from(clients.values())),
      },
      registration: {},
    });
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>());
    swTestHooks = (await import('./sw')).swTestHooks;
  });

  it('shares recovery and preserves each Range header on retry', async () => {
    const client = {
      id: 'client-a',
      postMessage: vi.fn(),
    } as unknown as Client;
    clients.set(client.id, client);

    const initialSession = { accessToken: 'old-token', baseUrl: 'https://matrix.example.org' };
    const ranges: Array<{ authorization: string | null; range: string | null }> = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      ranges.push({ authorization: headers.get('authorization'), range: headers.get('range') });
      return new Response('', {
        status: headers.get('authorization') === 'Bearer old-token' ? 401 : 206,
      });
    });

    const first = new Request(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/media-id',
      { headers: { Range: 'bytes=0-99' } }
    );
    const second = new Request(first.url, { headers: { Range: 'bytes=100-199' } });
    const firstRecovery = swTestHooks.respondWithMediaAuthRecovery(
      first,
      initialSession,
      'follow',
      client.id
    );
    const secondRecovery = swTestHooks.respondWithMediaAuthRecovery(
      second,
      initialSession,
      'follow',
      client.id
    );

    await vi.waitFor(() => expect(client.postMessage).toHaveBeenCalledTimes(1));
    swTestHooks.setSession(client.id, 'new-token', initialSession.baseUrl);

    await expect(firstRecovery).resolves.toHaveProperty('status', 206);
    await expect(secondRecovery).resolves.toHaveProperty('status', 206);
    expect(ranges).toEqual([
      { authorization: 'Bearer old-token', range: 'bytes=0-99' },
      { authorization: 'Bearer old-token', range: 'bytes=100-199' },
      { authorization: 'Bearer new-token', range: 'bytes=0-99' },
      { authorization: 'Bearer new-token', range: 'bytes=100-199' },
    ]);
  });

  it('posts a new session request after a previous request times out', async () => {
    const client = {
      id: 'client-timeout',
      postMessage: vi.fn(),
    } as unknown as Client;
    clients.set(client.id, client);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(swTestHooks.requestSessionWithTimeout(client.id, 1)).resolves.toBeUndefined();
    const nextRequest = swTestHooks.requestSessionWithTimeout(client.id, 1000);
    await vi.waitFor(() => expect(client.postMessage).toHaveBeenCalledTimes(2));
    swTestHooks.setSession(client.id, 'new-token', 'https://matrix.example.org');
    await expect(nextRequest).resolves.toMatchObject({ accessToken: 'new-token' });
  });
});
