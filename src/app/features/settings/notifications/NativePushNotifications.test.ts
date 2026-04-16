import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  disableNativePush,
  enableNativePush,
  ensureNativePushRegistered,
  isNativePushPermissionGranted,
  requestNativePushPermission,
} from './NativePushNotifications';
import * as NativePushNotifications from './NativePushNotifications';

const nativePushApi = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  registerForPushNotifications: vi.fn(),
  unregisterForPushNotifications: vi.fn(),
}));

const getNativePushNotificationsApi = vi.hoisted(() => vi.fn().mockResolvedValue(nativePushApi));

const matrixClient = vi.hoisted(() => ({
  setPusher: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn(() => 'DEVICE'),
  getDevice: vi.fn().mockResolvedValue({ display_name: 'Pixel' }),
  getPushers: vi.fn().mockResolvedValue({ pushers: [] }),
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
    nativePushApi.registerForPushNotifications.mockResolvedValue('native-token');

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
    nativePushApi.registerForPushNotifications.mockResolvedValue('native-token');

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
});

describe('native push pusher registration', () => {
  it('registers a Matrix pusher with the native device token', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue('native-token');

    await expect(enableNativePush(matrixClient as never, nativePushClientConfig)).resolves.toBe(
      'native-token'
    );
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
    nativePushApi.registerForPushNotifications.mockResolvedValue('native-token');

    await expect(
      enableNativePush(matrixClient as never, {
        pushNotificationDetails: {
          pushNotifyUrl: 'https://sygnal.example/_matrix/push/v1/notify',
        },
      })
    ).rejects.toThrow('nativePushAppID');
  });

  it('removes native pushers and unregisters the platform token', async () => {
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
  });

  it('recovers the current token before removing the Matrix pusher when local storage is empty', async () => {
    nativePushApi.isPermissionGranted.mockResolvedValue(true);
    nativePushApi.registerForPushNotifications.mockResolvedValue('native-token');

    await expect(
      disableNativePush(matrixClient as never, nativePushClientConfig)
    ).resolves.toBeUndefined();

    expect(nativePushApi.registerForPushNotifications).toHaveBeenCalledOnce();
    expect(matrixClient.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: null,
        app_id: 'moe.sable.mobile',
        pushkey: 'native-token',
      })
    );
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
