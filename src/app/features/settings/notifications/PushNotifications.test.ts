import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';

import type { ClientConfig } from '../../../hooks/useClientConfig';
import {
  disablePushNotifications,
  enablePushNotifications,
  isWebPushSupported,
  reconcilePushNotifications,
  togglePusher,
} from './PushNotifications';

const clientConfig: ClientConfig = {
  pushNotificationDetails: {
    webPushAppID: 'moe.sable.web',
    pushNotifyUrl: 'https://push.example.com/_matrix/push/v1/notify',
    vapidPublicKey: 'vapid-key',
  },
};

function makeMatrixClient(): MatrixClient {
  return {
    baseUrl: 'https://matrix.example.com',
    getAccessToken: vi.fn<() => string>().mockReturnValue('access-token'),
    getDevice: vi
      .fn<() => Promise<{ display_name?: string }>>()
      .mockResolvedValue({ display_name: 'Phone' }),
    getDeviceId: vi.fn<() => string>().mockReturnValue('DEVICEID'),
    getPushers: vi
      .fn<() => Promise<{ pushers: { app_id: string; pushkey: string }[] }>>()
      .mockResolvedValue({ pushers: [] }),
    setPusher: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

function installWebPush(subscription: PushSubscription | null): {
  controllerPostMessage: ReturnType<typeof vi.fn>;
  activePostMessage: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
} {
  const controllerPostMessage = vi.fn<() => void>();
  const activePostMessage = vi.fn<() => void>();
  const subscribe = vi.fn<() => Promise<PushSubscription>>().mockResolvedValue(makeSubscription());
  const registration = {
    active: {
      postMessage: activePostMessage,
    },
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
        postMessage: controllerPostMessage,
      },
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', vi.fn());

  return { controllerPostMessage, activePostMessage, subscribe };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('web push notifications', () => {
  it('reuses an existing browser subscription through the service worker toggle path', async () => {
    const subscription = makeSubscription();
    const { controllerPostMessage, activePostMessage, subscribe } = installWebPush(subscription);
    const mx = makeMatrixClient();
    const setSubscription = vi.fn<() => void>();

    await enablePushNotifications(mx, clientConfig, [subscription.toJSON(), setSubscription]);

    expect(subscribe).not.toHaveBeenCalled();
    expect(setSubscription).not.toHaveBeenCalled();
    expect(controllerPostMessage).toHaveBeenCalledWith({
      url: 'https://matrix.example.com',
      type: 'togglePush',
      token: 'access-token',
      pusherData: expect.objectContaining({
        kind: 'http',
        app_id: 'moe.sable.web',
        pushkey: 'p256dh-key',
        data: expect.objectContaining({
          endpoint: 'https://push.example.com/sub',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        }),
      }),
    });
    expect(activePostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'togglePush',
      })
    );
  });

  it('creates a new subscription and posts the pusher to the service worker', async () => {
    const { controllerPostMessage, activePostMessage, subscribe } = installWebPush(null);
    const mx = makeMatrixClient();
    const setSubscription = vi.fn<() => void>();

    await enablePushNotifications(mx, clientConfig, [null, setSubscription]);

    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: 'vapid-key',
    });
    expect(setSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://push.example.com/sub',
      })
    );
    expect(controllerPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'togglePush',
        token: 'access-token',
      })
    );
    expect(activePostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'togglePush',
      })
    );
  });

  it('posts a null pusher to disable web push', async () => {
    installWebPush(null);
    const mx = makeMatrixClient();
    const controllerPostMessage = vi.mocked(navigator.serviceWorker.controller!.postMessage);

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

    expect(controllerPostMessage).toHaveBeenCalledWith({
      url: 'https://matrix.example.com',
      type: 'togglePush',
      token: 'access-token',
      pusherData: {
        kind: null,
        app_id: 'moe.sable.web',
        pushkey: 'p256dh-key',
      },
    });
  });

  it('disables push when visible and enables it when hidden', async () => {
    installWebPush(null);
    const mx = makeMatrixClient();
    const pushState: [
      PushSubscriptionJSON | null,
      (subscription: PushSubscription | null) => void,
    ] = [null, vi.fn<() => void>()];
    const enableSpy = vi.spyOn(navigator.serviceWorker.controller!, 'postMessage');

    await togglePusher(mx, clientConfig, true, true, pushState);
    await togglePusher(mx, clientConfig, false, true, pushState);

    expect(enableSpy).toHaveBeenNthCalledWith(1, {
      url: 'https://matrix.example.com',
      type: 'togglePush',
      token: 'access-token',
      pusherData: {
        kind: null,
        app_id: 'moe.sable.web',
        pushkey: undefined,
      },
    });
    expect(enableSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'togglePush',
        token: 'access-token',
      })
    );
  });

  it('reconciles startup push state for a visible mobile session', async () => {
    const { controllerPostMessage } = installWebPush(null);
    const mx = makeMatrixClient();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    await reconcilePushNotifications(mx, clientConfig, true, [null, vi.fn<() => void>()], true);

    expect(controllerPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'togglePush',
        token: 'access-token',
        pusherData: expect.objectContaining({
          kind: 'http',
        }),
      })
    );
  });

  it('posts through the active worker when no controller exists', async () => {
    const { activePostMessage } = installWebPush(null);
    const ready = navigator.serviceWorker.ready;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: undefined,
        ready,
      },
    });
    const mx = makeMatrixClient();

    await enablePushNotifications(mx, clientConfig, [null, vi.fn<() => void>()]);

    expect(activePostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'togglePush',
        token: 'access-token',
      })
    );
  });

  it('reports unsupported when PushManager is unavailable', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();

    expect(isWebPushSupported()).toBe(false);
  });

  it('skips passive startup reconciliation on unsupported browsers', async () => {
    const mx = makeMatrixClient();

    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();

    await expect(
      reconcilePushNotifications(mx, clientConfig, true, [null, vi.fn<() => void>()], true)
    ).resolves.toBeUndefined();
  });

  it('skips passive visibility reconciliation on unsupported browsers', async () => {
    const mx = makeMatrixClient();

    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();

    await expect(
      togglePusher(mx, clientConfig, true, true, [null, vi.fn<() => void>()], false)
    ).resolves.toBeUndefined();
  });
});
