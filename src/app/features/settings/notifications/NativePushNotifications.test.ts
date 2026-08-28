import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as WebPushSupportModule from './webPushSupport';
import {
  disableNativePush,
  enableNativePush,
  ensureNativePushRegistered,
  isNativePushPermissionGranted,
  requestNativePushPermission,
} from './NativePushNotifications';
import * as NativePushNotifications from './NativePushNotifications';

const nativePushApi = vi.hoisted(() => ({
  isPermissionGranted: vi.fn<() => Promise<boolean>>(),
  requestPermission: vi.fn<() => Promise<string>>(),
  registerForPushNotifications:
    vi.fn<(vapid?: string) => Promise<{ deviceToken: string; p256dh?: string; auth?: string }>>(),
  unregisterForPushNotifications: vi.fn<() => Promise<void>>(),
}));

const getNativePushNotificationsApi = vi.hoisted(() =>
  vi.fn<() => Promise<typeof nativePushApi>>().mockResolvedValue(nativePushApi)
);

const getWebPushServerSupport = vi.hoisted(() =>
  vi.fn<() => Promise<WebPushSupportModule.WebPushServerSupport>>()
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
  getSafeUserId: vi.fn<() => string>(() => '@user:example.com'),
}));

const nativePushClientConfig = {
  pushNotificationDetails: {
    nativePushAppID: 'moe.sable.mobile',
    pushNotifyUrl: 'https://sygnal.example/_matrix/push/v1/notify',
  },
} as const;

vi.mock('./NativePushNotificationsApiClient', () => ({
  getNativePushNotificationsApi,
}));

vi.mock('./webPushSupport', async (importOriginal) => {
  const actual = await importOriginal<typeof WebPushSupportModule>();
  return { ...actual, getWebPushServerSupport };
});

beforeEach(() => {
  getWebPushServerSupport.mockResolvedValue({ supported: false });
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('native push permission flow', () => {
  it('does not expose the test-only api seam', () => {
    expect('setNativePushNotificationsApiForTesting' in NativePushNotifications).toBe(false);
  });

  it('reports false when native permission is not yet granted', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(false);

    await expect(isNativePushPermissionGranted()).resolves.toBe(false);
  });

  it('forwards a permission request explicitly', async () => {
    nativePushApi.requestPermission.mockResolvedValue('granted');

    await expect(requestNativePushPermission()).resolves.toBe('granted');
  });
});

describe('ensureNativePushRegistered', () => {
  it('registers immediately when permission is already granted', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: 'native-token' });

    await expect(ensureNativePushRegistered()).resolves.toEqual({
      permission: 'granted',
      token: 'native-token',
    });
    expect(nativePushApi.requestPermission).not.toHaveBeenCalled();
    expect(nativePushApi.registerForPushNotifications).toHaveBeenCalledOnce();
  });

  it('requests permission before registering and returns a token on grant', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(false);
    nativePushApi.requestPermission.mockResolvedValue('granted');
    nativePushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: 'native-token' });

    await expect(ensureNativePushRegistered()).resolves.toEqual({
      permission: 'granted',
      token: 'native-token',
    });
    expect(nativePushApi.requestPermission).toHaveBeenCalledOnce();
    expect(nativePushApi.registerForPushNotifications).toHaveBeenCalledOnce();
  });

  it('returns denied without registering when permission is denied', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(false);
    nativePushApi.requestPermission.mockResolvedValue('denied');

    await expect(ensureNativePushRegistered()).resolves.toEqual({
      permission: 'denied',
      token: null,
    });
    expect(nativePushApi.registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('preserves a default permission result from the permission request', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(false);
    nativePushApi.requestPermission.mockResolvedValue('default');

    await expect(ensureNativePushRegistered()).resolves.toEqual({
      permission: 'default',
      token: null,
    });
    expect(nativePushApi.registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('reports a clear error when the build has no Firebase configuration', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockRejectedValue(
      new Error(
        'Default FirebaseApp is not initialized in this process moe.sable.client. Make sure to call FirebaseApp.initializeApp(Context) first.'
      )
    );

    await expect(ensureNativePushRegistered()).rejects.toThrow('google-services.json');
  });

  it('surfaces the underlying reason for other registration failures', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockRejectedValue(
      new Error('SERVICE_NOT_AVAILABLE')
    );

    await expect(ensureNativePushRegistered()).rejects.toThrow(
      'Native push registration failed: SERVICE_NOT_AVAILABLE'
    );
  });
});

describe('native push pusher registration', () => {
  it('registers a Matrix pusher with the native device token', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: 'native-token' });

    await expect(
      enableNativePush(matrixClient as never, nativePushClientConfig)
    ).resolves.toMatchObject({ pushkey: 'native-token' });
    expect(localStorage.getItem('nativePushToken')).toBe('native-token');
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'moe.sable.mobile',
        pushkey: 'native-token',
        data: expect.objectContaining({
          url: 'https://sygnal.example/_matrix/push/v1/notify',
          format: 'event_id_only',
        }),
      })
    );
  });

  it('rejects native push enablement when the app id is missing', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: 'native-token' });

    await expect(
      enableNativePush(matrixClient as never, {
        pushNotificationDetails: {
          pushNotifyUrl: 'https://sygnal.example/_matrix/push/v1/notify',
        },
      })
    ).rejects.toThrow('nativePushAppID');
  });

  it('registers a Sygnal WebPush pusher when the distributor returns keys', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({
      deviceToken: 'https://fcm.googleapis.com/fcm/send/endpoint',
      p256dh: 'p256-key',
      auth: 'auth-secret',
    });

    const webPushConfig = {
      pushNotificationDetails: {
        webPushAppID: 'moe.sable.app.sygnal',
        nativePushAppID: 'moe.sable.mobile',
        pushNotifyUrl: 'https://sygnal.example/_matrix/push/v1/notify',
        vapidPublicKey: 'vapid-pub',
      },
    } as const;

    await expect(enableNativePush(matrixClient as never, webPushConfig)).resolves.toMatchObject({
      pushkey: 'p256-key',
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint',
    });
    expect(nativePushApi.registerForPushNotifications).toHaveBeenCalledWith('vapid-pub', {
      userId: '@user:example.com',
      deviceId: 'DEVICE',
    });
    expect(localStorage.getItem('nativePushAppId')).toBe('moe.sable.app.sygnal');
    expect(localStorage.getItem('nativePushToken')).toBe('p256-key');
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        app_id: 'moe.sable.app.sygnal',
        pushkey: 'p256-key',
        data: expect.objectContaining({
          url: 'https://sygnal.example/_matrix/push/v1/notify',
          format: 'event_id_only',
          endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint',
          p256dh: 'p256-key',
          auth: 'auth-secret',
        }),
      })
    );
  });

  it('registers an MSC4174 webpush pusher with the homeserver VAPID key when supported', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: 'hs-vapid' });
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({
      deviceToken: 'https://fcm.googleapis.com/fcm/send/endpoint',
      p256dh: 'p256-key',
      auth: 'auth-secret',
    });

    const webPushConfig = {
      pushNotificationDetails: {
        webPushAppID: 'moe.sable.app.sygnal',
        nativePushAppID: 'moe.sable.mobile',
        pushNotifyUrl: 'https://sygnal.example/_matrix/push/v1/notify',
        vapidPublicKey: 'vapid-pub',
      },
    } as const;

    await expect(enableNativePush(matrixClient as never, webPushConfig)).resolves.toMatchObject({
      pushkey: 'p256-key',
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint',
    });
    expect(nativePushApi.registerForPushNotifications).toHaveBeenCalledWith('hs-vapid', {
      userId: '@user:example.com',
      deviceId: 'DEVICE',
    });
    expect(localStorage.getItem('nativePushAppId')).toBe('moe.sable.app.sygnal');
    expect(localStorage.getItem('nativePushToken')).toBe('p256-key');
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'org.matrix.msc4174.webpush',
        app_id: 'moe.sable.app.sygnal',
        pushkey: 'p256-key',
        data: expect.objectContaining({
          url: 'https://fcm.googleapis.com/fcm/send/endpoint',
          auth: 'auth-secret',
          format: 'event_id_only',
          default_payload: { user_id: '@user:example.com' },
        }),
      })
    );
  });

  it('removes stale http gateway pushers when registering an MSC4174 webpush pusher', async () => {
    getWebPushServerSupport.mockResolvedValue({ supported: true, vapidPublicKey: 'hs-vapid' });
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({
      deviceToken: 'https://fcm.googleapis.com/fcm/send/endpoint',
      p256dh: 'p256-key',
      auth: 'auth-secret',
    });
    matrixClient.getPushers.mockResolvedValue({
      pushers: [
        {
          app_id: 'moe.sable.app.sygnal',
          pushkey: 'old-p256-key',
          device_display_name: 'Pixel',
          kind: 'http',
        },
        {
          app_id: 'moe.sable.app.sygnal',
          pushkey: 'other-device-key',
          device_display_name: 'Other Phone',
          kind: 'http',
        },
      ],
    });

    const webPushConfig = {
      pushNotificationDetails: {
        webPushAppID: 'moe.sable.app.sygnal',
        nativePushAppID: 'moe.sable.mobile',
        vapidPublicKey: 'vapid-pub',
      },
    } as const;

    await expect(enableNativePush(matrixClient as never, webPushConfig)).resolves.toMatchObject({
      pushkey: 'p256-key',
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint',
    });
    // One webpush registration + one stale http pusher removal.
    expect(matrixClient.setPusher).toHaveBeenCalledTimes(2);
    expect(matrixClient.setPusher).toHaveBeenCalledWith({
      kind: null,
      app_id: 'moe.sable.app.sygnal',
      pushkey: 'old-p256-key',
    });
  });

  it('honors the gateway URL override for plain-token native push', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue({ deviceToken: 'native-token' });

    await expect(
      enableNativePush(
        matrixClient as never,
        nativePushClientConfig,
        'https://other-gateway.example/_matrix/push/v1/notify'
      )
    ).resolves.toMatchObject({ pushkey: 'native-token' });
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'http',
        pushkey: 'native-token',
        data: expect.objectContaining({
          url: 'https://other-gateway.example/_matrix/push/v1/notify',
        }),
      })
    );
  });

  it('removes the stored pusher and unregisters the platform token', async () => {
    localStorage.setItem('nativePushAppId', 'moe.sable.mobile');
    localStorage.setItem('nativePushToken', 'native-token');

    await expect(
      disableNativePush(matrixClient as never, nativePushClientConfig)
    ).resolves.toBeUndefined();

    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'moe.sable.mobile',
        pushkey: 'native-token',
      })
    );
    expect(nativePushApi.unregisterForPushNotifications).toHaveBeenCalledOnce();
    expect(localStorage.getItem('nativePushToken')).toBeNull();
    expect(localStorage.getItem('nativePushAppId')).toBeNull();
  });

  it('falls back to removing current-device pushers when the token cannot be recovered', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(false);
    matrixClient.getPushers.mockResolvedValue({
      pushers: [
        {
          app_id: 'moe.sable.mobile',
          pushkey: 'stale-native-token',
          device_display_name: 'Pixel',
          kind: 'http',
        },
        {
          app_id: 'moe.sable.mobile',
          pushkey: 'other-device-token',
          device_display_name: 'Other Phone',
          kind: 'http',
        },
      ],
    });

    await expect(
      disableNativePush(matrixClient as never, nativePushClientConfig)
    ).resolves.toBeUndefined();

    expect(matrixClient.setPusher).toHaveBeenCalledTimes(1);
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'moe.sable.mobile',
        pushkey: 'stale-native-token',
      })
    );
  });
});
