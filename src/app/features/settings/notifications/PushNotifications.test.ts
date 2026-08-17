import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type * as WebPushSupportModule from './webPushSupport';

const isTauri = vi.hoisted(() => vi.fn<() => boolean>());
const getWebPushServerSupport = vi.hoisted(() =>
  vi.fn<() => Promise<WebPushSupportModule.WebPushServerSupport>>()
);

vi.mock('@tauri-apps/api/core', () => ({ isTauri }));
vi.mock('./webPushSupport', async (importOriginal) => {
  const actual = await importOriginal<typeof WebPushSupportModule>();
  return { ...actual, getWebPushServerSupport };
});

import {
  enablePushNotifications,
  disablePushNotifications,
  togglePusher,
} from './PushNotifications';

const MSC4174_KIND = 'org.matrix.msc4174.webpush';
const VAPID =
  'BCnS4SbHjeOaqVFW4wjt5xDt_pYIL62qMzKePfYF9fl9PQU14RieIaObh7nLR_9dQf4sykZa-CTrcjkgMIE1mcg';
const SERVER_VAPID =
  'BNbXV88MfMI0fSxB7cDngopoviZRTbxIS0qSS-O7BZCtG04khMOn-PP2uez_X7Aeci42n02kJ0-JJJ0uQ4ELRTs';
const ENDPOINT = 'https://push.example.org/wpush/v2/subscription';
const P256DH =
  'BLn9b-VR0ca83knDNZ32dCHGyjJp0000000000000000000000000000000000000000000000000000000000000000';
const AUTH = '_ordMnz7uTCmrpBTeUV4Bw';

const setPushSubscription = vi.fn<(subscription: PushSubscription | null) => void>();

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

type MockSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  unsubscribe: Mock<() => Promise<void>>;
  toJSON: () => PushSubscriptionJSON;
};

function makeSubscription(applicationServerKey: string | null): MockSubscription {
  return {
    endpoint: ENDPOINT,
    options: {
      applicationServerKey: applicationServerKey
        ? base64UrlToArrayBuffer(applicationServerKey)
        : null,
    },
    unsubscribe: vi.fn<() => Promise<void>>(async () => {}),
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }),
  };
}

const postMessage = vi.fn<(message: unknown) => void>();
const getSubscription = vi.fn<() => Promise<MockSubscription | null>>();
const subscribe = vi.fn<(options: unknown) => Promise<MockSubscription>>();

function createMatrixClient() {
  return {
    baseUrl: 'https://matrix.example.org',
    getAccessToken: vi.fn<() => string>(() => 'token'),
    getDeviceId: vi.fn<() => string>(() => 'DEVICE'),
    getDevice: vi.fn<() => Promise<{ display_name: string }>>(async () => ({
      display_name: 'Test Device',
    })),
    getSafeUserId: vi.fn<() => string>(() => '@alice:example.org'),
    getPushers: vi.fn<() => Promise<{ pushers: Array<Record<string, unknown>> }>>(async () => ({
      pushers: [],
    })),
    setPusher: vi.fn<() => Promise<Record<string, never>>>(async () => ({})),
  };
}

const clientConfig = {
  pushNotificationDetails: {
    pushNotifyUrl: 'https://sygnal.example.org/_matrix/push/v1/notify',
    vapidPublicKey: VAPID,
    webPushAppID: 'moe.sable.app.sygnal',
  },
} as never;

type TogglePushMessage = {
  url: string;
  type: string;
  token: string;
  pusherData: Record<string, unknown> & { kind?: unknown; data: Record<string, unknown> };
};

function lastTogglePushMessage(): TogglePushMessage {
  return postMessage.mock.calls.at(-1)?.[0] as unknown as TogglePushMessage;
}

beforeEach(() => {
  isTauri.mockReturnValue(false);
  getWebPushServerSupport.mockResolvedValue({ supported: false });
  getSubscription.mockResolvedValue(null);
  subscribe.mockImplementation(async () => makeSubscription(VAPID));
  vi.stubGlobal('PushManager', {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }),
      controller: { postMessage },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('enablePushNotifications', () => {
  it('no-ops in the Tauri runtime instead of throwing', async () => {
    isTauri.mockReturnValue(true);

    await expect(
      enablePushNotifications({} as never, clientConfig, [null, setPushSubscription])
    ).resolves.toBeUndefined();
  });

  it('registers an MSC4174 webpush pusher when the server supports it', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: SERVER_VAPID });
    const mx = createMatrixClient();

    await enablePushNotifications(mx as never, clientConfig, [null, setPushSubscription]);

    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: SERVER_VAPID,
    });
    expect(postMessage).toHaveBeenCalledTimes(1);
    const message = lastTogglePushMessage();
    expect(message.type).toBe('togglePush');
    expect(message.url).toBe('https://matrix.example.org');
    expect(message.token).toBe('token');
    expect(message.pusherData.kind).toBe(MSC4174_KIND);
    expect(message.pusherData.pushkey).toBe(P256DH);
    expect(message.pusherData.app_id).toBe('moe.sable.app.sygnal');
    expect(message.pusherData.data).toMatchObject({
      url: ENDPOINT,
      auth: AUTH,
      format: 'event_id_only',
    });
    expect(message.pusherData.data).not.toHaveProperty('endpoint');
    expect(message.pusherData.data).not.toHaveProperty('p256dh');
  });

  it('removes stale http gateway pushers for this device when switching to MSC4174', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: SERVER_VAPID });
    const mx = createMatrixClient();
    mx.getPushers.mockResolvedValue({
      pushers: [
        {
          app_id: 'moe.sable.app.sygnal',
          kind: 'http',
          pushkey: 'old-p256dh',
          device_display_name: 'Test Device',
        },
        {
          app_id: 'moe.sable.app.sygnal',
          kind: 'http',
          pushkey: 'other-device-p256dh',
          device_display_name: 'Some Other Device',
        },
        { app_id: 'm.email', kind: 'email', pushkey: 'a@b.c', device_display_name: 'a@b.c' },
      ],
    });

    await enablePushNotifications(mx as never, clientConfig, [null, setPushSubscription]);

    expect(mx.setPusher).toHaveBeenCalledTimes(1);
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-p256dh',
    });
  });

  it('registers an http gateway pusher when the server does not support MSC4174', async () => {
    const mx = createMatrixClient();

    await enablePushNotifications(mx as never, clientConfig, [null, setPushSubscription]);

    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: VAPID,
    });
    const message = lastTogglePushMessage();
    expect(message.pusherData.kind).toBe('http');
    expect(message.pusherData.data).toMatchObject({
      url: 'https://sygnal.example.org/_matrix/push/v1/notify',
      format: 'event_id_only',
      endpoint: ENDPOINT,
      p256dh: P256DH,
      auth: AUTH,
    });
    expect(mx.setPusher).not.toHaveBeenCalled();
  });

  it('honors the gateway URL override for the http fallback', async () => {
    const mx = createMatrixClient();
    const override = 'https://other-gateway.example.org/_matrix/push/v1/notify';

    await enablePushNotifications(mx as never, clientConfig, [null, setPushSubscription], override);

    const message = lastTogglePushMessage();
    expect(message.pusherData.kind).toBe('http');
    expect(message.pusherData.data.url).toBe(override);
  });

  it('rejects an invalid gateway URL override', async () => {
    const mx = createMatrixClient();

    await expect(
      enablePushNotifications(
        mx as never,
        clientConfig,
        [null, setPushSubscription],
        'not-a-gateway-url'
      )
    ).rejects.toThrow(/Push gateway URL/);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('reuses the existing subscription when endpoint and VAPID key match', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: SERVER_VAPID });
    getSubscription.mockResolvedValue(makeSubscription(SERVER_VAPID));
    const mx = createMatrixClient();

    await enablePushNotifications(mx as never, clientConfig, [
      { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } },
      setPushSubscription,
    ]);

    expect(subscribe).not.toHaveBeenCalled();
    const message = lastTogglePushMessage();
    expect(message.pusherData.kind).toBe(MSC4174_KIND);
  });

  it('re-subscribes when the stored subscription used a different VAPID key', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: SERVER_VAPID });
    const oldSubscription = makeSubscription(VAPID);
    getSubscription.mockResolvedValue(oldSubscription);
    subscribe.mockImplementation(async () => makeSubscription(SERVER_VAPID));
    const mx = createMatrixClient();

    await enablePushNotifications(mx as never, clientConfig, [
      { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } },
      setPushSubscription,
    ]);

    expect(oldSubscription.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: SERVER_VAPID,
    });
  });
});

describe('disablePushNotifications', () => {
  it('no-ops in the Tauri runtime', async () => {
    isTauri.mockReturnValue(true);

    await expect(
      disablePushNotifications({} as never, clientConfig, [null, setPushSubscription])
    ).resolves.toBeUndefined();
  });
});

describe('togglePusher', () => {
  it('does not throw in the Tauri runtime when push is enabled', async () => {
    isTauri.mockReturnValue(true);

    await expect(
      togglePusher({} as never, clientConfig, true, true, [null, setPushSubscription])
    ).resolves.toBeUndefined();
  });
});
