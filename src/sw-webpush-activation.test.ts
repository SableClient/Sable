import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { swTestHooks as swTestHooksHelper } from './sw';

vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn<() => void>(),
  precacheAndRoute: vi.fn<() => void>(),
}));

type SwTestHooks = typeof swTestHooksHelper;

type SwCacheStub = {
  delete: () => Promise<boolean>;
  match: () => Promise<Response | undefined>;
  put: (key: string, response: Response) => Promise<void>;
};

const ACK_PATH = '/_matrix/client/unstable/org.matrix.msc4174/pushers/ack';

describe('service worker MSC4174 web push activation', () => {
  let swTestHooks: SwTestHooks;
  let clients: Map<string, Client>;
  let addEventListener: Mock<(type: string, handler: (event: PushEvent) => void) => void>;
  let persistedSessions: string | undefined;
  let fetchMock: Mock<typeof globalThis.fetch>;

  beforeEach(async () => {
    vi.resetModules();
    clients = new Map();
    addEventListener = vi.fn<(type: string, handler: (event: PushEvent) => void) => void>();
    persistedSessions = undefined;
    vi.stubGlobal('self', {
      __WB_MANIFEST: [],
      addEventListener,
      caches: {
        open: vi.fn<() => Promise<SwCacheStub>>(async () => ({
          delete: vi.fn<() => Promise<boolean>>(async () => true),
          match: vi.fn<() => Promise<Response | undefined>>(async () =>
            persistedSessions ? new Response(persistedSessions) : undefined
          ),
          put: vi.fn<(key: string, response: Response) => Promise<void>>(
            async (_key: string, response: Response) => {
              persistedSessions = await response.text();
            }
          ),
        })),
      },
      clients: {
        claim: vi.fn<() => void>(),
        get: vi.fn<(id: string) => Promise<Client | undefined>>(async (id: string) =>
          clients.get(id)
        ),
        matchAll: vi.fn<() => Promise<Client[]>>(async () => Array.from(clients.values())),
      },
      registration: {},
    });
    fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetchMock);
    swTestHooks = (await import('./sw')).swTestHooks;
  });

  const dispatchPush = async (payload: unknown): Promise<void> => {
    const pushHandler = addEventListener.mock.calls.find(([type]) => type === 'push')?.[1];
    expect(pushHandler).toBeTypeOf('function');

    let pending: Promise<void> | undefined;
    pushHandler?.({
      data: { json: () => payload },
      waitUntil: (promise: Promise<void>) => {
        pending = promise;
      },
    } as unknown as PushEvent);
    await pending;
  };

  it('classifies activation payloads', () => {
    expect(swTestHooks.isWebPushActivationPayload({ app_id: 'app', ack_token: 'token' })).toBe(
      true
    );
    expect(
      swTestHooks.isWebPushActivationPayload({
        app_id: 'app',
        ack_token: 'token',
        room_id: '!room:example.org',
      })
    ).toBe(false);
    expect(swTestHooks.isWebPushActivationPayload({ app_id: 'app' })).toBe(false);
    expect(swTestHooks.isWebPushActivationPayload({ room_id: '!room', event_id: '$event' })).toBe(
      false
    );
    expect(swTestHooks.isWebPushActivationPayload(undefined)).toBe(false);
  });

  it('acknowledges an activation push with the live session', async () => {
    await swTestHooks.setSession(
      'alice-window',
      'alice-token',
      'https://matrix.example.org',
      '@alice:example.org'
    );
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await dispatchPush({ app_id: 'moe.sable.app', ack_token: '6fc76b70-5fad-4eb7-93ea' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://matrix.example.org${ACK_PATH}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer alice-token');
    expect(JSON.parse(init.body as string)).toEqual({
      app_id: 'moe.sable.app',
      ack_token: '6fc76b70-5fad-4eb7-93ea',
    });
  });

  it('acknowledges even when a visible client is open', async () => {
    clients.set('visible-window', { visibilityState: 'visible' } as unknown as Client);
    await swTestHooks.setSession(
      'alice-window',
      'alice-token',
      'https://matrix.example.org',
      '@alice:example.org'
    );
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await dispatchPush({ app_id: 'moe.sable.app', ack_token: 'token-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(ACK_PATH);
  });

  it('falls back to the persisted session after an SW restart', async () => {
    persistedSessions = JSON.stringify({
      '@bob:example.org': {
        accessToken: 'bob-token',
        baseUrl: 'https://other.example.org',
        userId: '@bob:example.org',
      },
    });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await dispatchPush({ app_id: 'moe.sable.app', ack_token: 'token-2' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://other.example.org${ACK_PATH}`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bob-token');
  });

  it('tries the next account when the homeserver rejects the ack', async () => {
    await swTestHooks.setSession(
      'alice-window',
      'alice-token',
      'https://matrix.example.org',
      '@alice:example.org'
    );
    await swTestHooks.setSession(
      'bob-window',
      'bob-token',
      'https://matrix.example.org',
      '@bob:example.org'
    );
    fetchMock
      .mockResolvedValueOnce(new Response('{"errcode":"M_NOT_FOUND"}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await dispatchPush({ app_id: 'moe.sable.app', ack_token: 'token-3' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const secondInit = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((firstInit[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer alice-token'
    );
    expect((secondInit[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer bob-token'
    );
  });

  it('does not treat regular notifications as activation pushes', async () => {
    clients.set('visible-window', { visibilityState: 'visible' } as unknown as Client);
    await swTestHooks.setSession(
      'alice-window',
      'alice-token',
      'https://matrix.example.org',
      '@alice:example.org'
    );

    // Visible client suppresses the notification before any network access.
    await dispatchPush({ room_id: '!room:example.org', event_id: '$event:example.org' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
