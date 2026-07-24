import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UNIFIED_PUSH_APP_ID,
  disableUnifiedPush,
  tryEnableUnifiedPush,
} from './UnifiedPushNotifications';

const notificationsApi = vi.hoisted(() => ({
  sendNotification: vi.fn<() => void>(),
  removeActive: vi.fn<() => void>(),
  createChannel: vi.fn<() => void>(),
  Importance: {
    Default: 3,
  },
}));

const unifiedPushTransport = vi.hoisted(() => ({
  getUnifiedPushDistributor: vi.fn<() => void>(),
  getUnifiedPushDistributors: vi.fn<() => void>(),
  registerUnifiedPushTransport: vi.fn<() => Promise<unknown>>(),
  saveUnifiedPushDistributor: vi.fn<() => void>(),
  unregisterUnifiedPushTransport: vi.fn<() => Promise<void>>(),
}));

const getTauriNotificationsApi = vi.hoisted(() =>
  vi.fn<() => Promise<typeof notificationsApi>>().mockResolvedValue(notificationsApi)
);

const matrixClient = vi.hoisted(() => ({
  setPusher: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getDeviceId: vi.fn<() => string>(() => 'DEVICE'),
  getDevice: vi
    .fn<() => Promise<{ display_name: string }>>()
    .mockResolvedValue({ display_name: 'Pixel' }),
  getPushers: vi
    .fn<() => Promise<{ pushers: Array<unknown> }>>()
    .mockResolvedValue({ pushers: [] }),
}));

vi.mock('./UnifiedPushTransport', () => unifiedPushTransport);

vi.mock('./TauriNotificationsApiClient', () => ({
  getTauriNotificationsApi,
}));

vi.mock('$utils/fetch', () => ({
  fetch: (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args),
}));

describe('UnifiedPushNotifications', () => {
  beforeEach(() => {
    notificationsApi.createChannel.mockResolvedValue(undefined);
    getTauriNotificationsApi.mockResolvedValue(notificationsApi);
    unifiedPushTransport.registerUnifiedPushTransport.mockResolvedValue({
      status: 'registered',
      permissionState: 'granted',
      endpoint: 'https://up.example/device',
      distributor: 'org.unifiedpush.distributor.ntfy',
    });
    unifiedPushTransport.unregisterUnifiedPushTransport.mockResolvedValue(undefined);
    matrixClient.setPusher.mockClear();
    matrixClient.getPushers.mockResolvedValue({ pushers: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('gateway probe failed'))
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers the Matrix pusher with the resolved UnifiedPush overrides', async () => {
    await expect(
      tryEnableUnifiedPush(matrixClient as never, {
        unifiedPushAppID: 'com.example.up',
        unifiedPushGatewayUrl: ' https://gateway.example/_matrix/push/v1/notify ',
      })
    ).resolves.toMatchObject({
      status: 'registered',
      endpoint: 'https://up.example/device',
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

  it('clears the UnifiedPush registration timeout after successful registration', async () => {
    vi.useFakeTimers();

    try {
      await expect(tryEnableUnifiedPush(matrixClient as never)).resolves.toMatchObject({
        status: 'registered',
      });

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the default UnifiedPush app id when no override is provided', async () => {
    await tryEnableUnifiedPush(matrixClient as never);

    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: DEFAULT_UNIFIED_PUSH_APP_ID,
      })
    );
  });

  it('removes current-device UnifiedPush pushers when the cached endpoint is unavailable', async () => {
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
