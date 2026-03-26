import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notificationsApi = vi.hoisted(() => ({
  onUnifiedPushMessage: vi.fn(),
  onUnifiedPushEndpoint: vi.fn(),
  sendNotification: vi.fn(),
  removeActive: vi.fn(),
  createChannel: vi.fn(),
  Importance: {
    Default: 'default',
  },
}));

const unifiedPushTransport = vi.hoisted(() => ({
  getUnifiedPushDistributor: vi.fn(),
  getUnifiedPushDistributors: vi.fn(),
  registerUnifiedPushTransport: vi.fn(),
  saveUnifiedPushDistributor: vi.fn(),
  unregisterUnifiedPushTransport: vi.fn(),
}));

const getTauriNotificationsApi = vi.hoisted(() => vi.fn().mockResolvedValue(notificationsApi));

const matrixClient = vi.hoisted(() => ({
  setPusher: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn(() => 'DEVICE'),
  getDevice: vi.fn().mockResolvedValue({ display_name: 'Pixel' }),
  getPushers: vi.fn().mockResolvedValue({ pushers: [] }),
}));

vi.mock('./UnifiedPushTransport', () => unifiedPushTransport);

vi.mock('./TauriNotificationsApiClient', () => ({
  getTauriNotificationsApi,
}));

async function loadUnifiedPushNotificationsModule() {
  return import('./UnifiedPushNotifications');
}

describe('UnifiedPushNotifications', () => {
  beforeEach(() => {
    notificationsApi.createChannel.mockResolvedValue(undefined);
    getTauriNotificationsApi.mockResolvedValue(notificationsApi);
    unifiedPushTransport.registerUnifiedPushTransport.mockResolvedValue({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://up.example/device',
      instance: 'instance-1',
      distributor: 'org.unifiedpush.distributor.ntfy',
    });
    unifiedPushTransport.unregisterUnifiedPushTransport.mockResolvedValue(undefined);
    matrixClient.setPusher.mockClear();
    matrixClient.getPushers.mockResolvedValue({ pushers: [] });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('gateway probe failed')));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers the Matrix pusher with the resolved UnifiedPush overrides', async () => {
    const { tryEnableUnifiedPush } = await loadUnifiedPushNotificationsModule();

    await expect(
      tryEnableUnifiedPush(matrixClient as never, {
        unifiedPushAppID: 'com.example.up',
        unifiedPushGatewayUrl: ' https://gateway.example/_matrix/push/v1/notify ',
      })
    ).resolves.toMatchObject({
      status: 'registered',
      endpoint: 'https://up.example/device',
      instance: 'instance-1',
    });

    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'com.example.up',
        pushkey: 'https://up.example/device',
        data: expect.objectContaining({
          url: 'https://gateway.example/_matrix/push/v1/notify',
        }),
      })
    );
  }, 15_000);

  it('falls back to the default UnifiedPush app id when no override is provided', async () => {
    const { DEFAULT_UNIFIED_PUSH_APP_ID, tryEnableUnifiedPush } =
      await loadUnifiedPushNotificationsModule();

    await tryEnableUnifiedPush(matrixClient as never);

    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: DEFAULT_UNIFIED_PUSH_APP_ID,
      })
    );
  });

  it('removes current-device UnifiedPush pushers when the cached endpoint is unavailable', async () => {
    const { disableUnifiedPush } = await loadUnifiedPushNotificationsModule();

    matrixClient.getPushers.mockResolvedValue({
      pushers: [
        {
          app_id: 'com.example.up',
          pushkey: 'stale-endpoint-1',
          device_display_name: 'Pixel',
          kind: 'http',
        },
        {
          app_id: 'com.example.up',
          pushkey: 'stale-endpoint-2',
          device_display_name: 'Pixel',
          kind: 'http',
        },
        {
          app_id: 'com.example.up',
          pushkey: 'other-device-endpoint',
          device_display_name: 'Other Phone',
          kind: 'http',
        },
      ],
    });

    await disableUnifiedPush(matrixClient as never, {
      config: {
        unifiedPushAppID: 'com.example.up',
      },
    });

    expect(matrixClient.setPusher).toHaveBeenCalledTimes(2);
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'com.example.up',
        pushkey: 'stale-endpoint-1',
      })
    );
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'com.example.up',
        pushkey: 'stale-endpoint-2',
      })
    );
    expect(unifiedPushTransport.unregisterUnifiedPushTransport).toHaveBeenCalledOnce();
  });
});
