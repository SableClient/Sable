import { describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() =>
  vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>()
);

const isAndroidTauri = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('./TauriNotificationsApiClient', () => ({ isAndroidTauri }));

import { getNativePushNotificationsApi } from './NativePushNotificationsApiClient';

describe('NativePushNotificationsApiClient', () => {
  it('registers with provider: "fcm" on Android so the plugin bypasses a saved UnifiedPush distributor', async () => {
    isAndroidTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce({
      deviceToken: 'fcm-token',
      p256dh: 'p256dh',
      auth: 'auth',
    });

    const api = await getNativePushNotificationsApi();
    await api.registerForPushNotifications('vapid-pub');

    expect(invoke).toHaveBeenCalledWith('plugin:notifications|register_for_push_notifications', {
      vapid: 'vapid-pub',
      provider: 'fcm',
    });
  });

  it('omits the provider arg on iOS (APNs ignores it)', async () => {
    isAndroidTauri.mockReturnValue(false);
    invoke.mockResolvedValueOnce({
      deviceToken: 'apns-token',
    });

    const api = await getNativePushNotificationsApi();
    await api.registerForPushNotifications('vapid-pub');

    expect(invoke).toHaveBeenCalledWith('plugin:notifications|register_for_push_notifications', {
      vapid: 'vapid-pub',
    });
  });
});
