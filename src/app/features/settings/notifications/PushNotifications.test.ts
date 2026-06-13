import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';

import type { ClientConfig } from '../../../hooks/useClientConfig';
import { disablePushNotifications, enablePushNotifications } from './PushNotifications';

vi.mock('@sentry/react', () => ({
  metrics: {
    count: vi.fn<() => void>(),
  },
  startInactiveSpan: vi.fn<() => { setAttribute: () => void; end: () => void }>(() => ({
    setAttribute: vi.fn<() => void>(),
    end: vi.fn<() => void>(),
  })),
  addBreadcrumb: vi.fn<() => void>(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}));

const clientConfig: ClientConfig = {
  pushNotificationDetails: {
    webPushAppID: 'moe.sable.web',
    pushNotifyUrl: 'https://push.example.com/_matrix/push/v1/notify',
    vapidPublicKey: 'vapid-key',
  },
};

function makeMatrixClient(): MatrixClient {
  return {
    setPusher: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getPushers: vi
      .fn<() => Promise<{ pushers: { app_id: string; pushkey: string }[] }>>()
      .mockResolvedValue({ pushers: [] }),
    getDevice: vi
      .fn<() => Promise<{ display_name?: string }>>()
      .mockResolvedValue({ display_name: 'Phone' }),
    getDeviceId: vi.fn<() => string>().mockReturnValue('DEVICEID'),
  } as unknown as MatrixClient;
}

function makeSubscription(endpoint = 'https://push.example.com/sub') {
  return {
    endpoint,
    toJSON: vi.fn<() => PushSubscriptionJSON>().mockReturnValue({
      endpoint,
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    }),
    unsubscribe: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function makePusher(appId: string, pushkey: string) {
  return {
    app_display_name: 'Charm',
    app_id: appId,
    data: {},
    device_display_name: 'Phone',
    kind: 'http',
    lang: 'en',
    pushkey,
  };
}

function installWebPush(subscription: PushSubscription | null): {
  controllerPostMessage: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
} {
  const controllerPostMessage = vi.fn<() => void>();
  const subscribe = vi.fn<() => Promise<PushSubscription>>().mockResolvedValue(makeSubscription());
  const registration = {
    active: undefined,
    waiting: undefined,
    installing: undefined,
    pushManager: {
      getSubscription: vi
        .fn<() => Promise<PushSubscription | null>>()
        .mockResolvedValue(subscription),
      subscribe,
    },
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {
        state: 'activated',
        postMessage: controllerPostMessage,
      },
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', vi.fn());

  return { controllerPostMessage, subscribe };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('web push notifications', () => {
  it('updates the Matrix pusher directly and removes the legacy Sable pusher when reusing a browser subscription', async () => {
    const subscription = makeSubscription();
    const { controllerPostMessage } = installWebPush(subscription);
    const mx = makeMatrixClient();
    vi.mocked(mx.getPushers).mockResolvedValue({
      pushers: [
        makePusher('moe.sable.app.sygnal', 'old-sable-p256dh-key'),
        makePusher('moe.sable.web', 'other-device-p256dh-key'),
      ],
    });
    const setSubscription = vi.fn<() => void>();

    await enablePushNotifications(mx, clientConfig, [subscription.toJSON(), setSubscription]);

    expect(mx.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'moe.sable.web',
        pushkey: 'p256dh-key',
        device_display_name: 'Phone',
        data: expect.objectContaining({
          url: 'https://push.example.com/_matrix/push/v1/notify',
          format: 'event_id_only',
          endpoint: 'https://push.example.com/sub',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        }),
      })
    );
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-sable-p256dh-key',
    });
    expect(mx.setPusher).not.toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'p256dh-key',
    });
    expect(controllerPostMessage).not.toHaveBeenCalled();
    expect(setSubscription).toHaveBeenCalledWith(subscription);
  });

  it('deletes current and legacy Matrix pushers directly when disabling web push', async () => {
    installWebPush(null);
    const mx = makeMatrixClient();
    vi.mocked(mx.getPushers).mockResolvedValue({
      pushers: [makePusher('moe.sable.app.sygnal', 'old-sable-p256dh-key')],
    });

    await disablePushNotifications(mx, clientConfig, [
      {
        endpoint: 'https://push.example.com/sub',
        keys: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      },
      vi.fn<() => void>(),
    ]);

    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.web',
      pushkey: 'p256dh-key',
    });
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-sable-p256dh-key',
    });
  });

  it('propagates failures when deleting the current web push pusher', async () => {
    installWebPush(null);
    const mx = makeMatrixClient();
    vi.mocked(mx.setPusher).mockImplementation((pusher) => {
      if (pusher.app_id === 'moe.sable.web') {
        return Promise.reject(new Error('homeserver unavailable'));
      }
      return Promise.resolve({});
    });

    await expect(
      disablePushNotifications(mx, clientConfig, [
        {
          endpoint: 'https://push.example.com/sub',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-key',
          },
        },
        vi.fn<() => void>(),
      ])
    ).rejects.toThrow('homeserver unavailable');

    expect(mx.getPushers).not.toHaveBeenCalled();
  });

  it('keeps legacy web pusher cleanup best-effort when deleting legacy pushers fails', async () => {
    installWebPush(null);
    const mx = makeMatrixClient();
    vi.mocked(mx.getPushers).mockResolvedValue({
      pushers: [makePusher('moe.sable.app.sygnal', 'old-sable-p256dh-key')],
    });
    vi.mocked(mx.setPusher).mockImplementation((pusher) => {
      if (pusher.app_id === 'moe.sable.app.sygnal') {
        return Promise.reject(new Error('legacy pusher already gone'));
      }
      return Promise.resolve({});
    });

    await expect(
      disablePushNotifications(mx, clientConfig, [
        {
          endpoint: 'https://push.example.com/sub',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-key',
          },
        },
        vi.fn<() => void>(),
      ])
    ).resolves.toBeUndefined();

    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.web',
      pushkey: 'p256dh-key',
    });
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-sable-p256dh-key',
    });
  });

  it('removes the legacy pusher before replacing an existing browser subscription', async () => {
    const subscription = makeSubscription();
    const { subscribe } = installWebPush(subscription);
    const mx = makeMatrixClient();
    vi.mocked(mx.getPushers).mockResolvedValue({
      pushers: [makePusher('moe.sable.app.sygnal', 'old-sable-p256dh-key')],
    });

    await enablePushNotifications(mx, clientConfig, [null, vi.fn<() => void>()]);

    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.web',
      pushkey: 'p256dh-key',
    });
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-sable-p256dh-key',
    });
  });

  it('removes the legacy pusher after creating a first browser subscription', async () => {
    const { subscribe } = installWebPush(null);
    const mx = makeMatrixClient();
    vi.mocked(mx.getPushers).mockResolvedValue({
      pushers: [makePusher('moe.sable.app.sygnal', 'old-sable-p256dh-key')],
    });

    await enablePushNotifications(mx, clientConfig, [null, vi.fn<() => void>()]);

    expect(subscribe).toHaveBeenCalled();
    expect(mx.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'moe.sable.web',
        pushkey: 'p256dh-key',
      })
    );
    expect(mx.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-sable-p256dh-key',
    });
  });
});
