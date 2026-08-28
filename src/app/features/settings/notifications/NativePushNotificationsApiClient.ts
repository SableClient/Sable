import { invoke } from '@tauri-apps/api/core';
import { isAndroidTauri } from './TauriNotificationsApiClient';
import type { PushAccount } from './pushAccount';

export type NativePushRegistration = {
  deviceToken: string;
  p256dh?: string;
  auth?: string;
};

export type NativePushNotificationsApi = {
  isPermissionGranted: () => Promise<boolean | null>;
  requestPermission: () => Promise<NotificationPermission>;
  registerForPushNotifications: (
    vapid?: string,
    account?: PushAccount
  ) => Promise<NativePushRegistration>;
  unregisterForPushNotifications: () => Promise<void>;
};

let nativePushNotificationsApiPromise: Promise<NativePushNotificationsApi> | null = null;

export async function getNativePushNotificationsApi(): Promise<NativePushNotificationsApi> {
  if (!nativePushNotificationsApiPromise) {
    nativePushNotificationsApiPromise = import('@sableclient/tauri-plugin-notifications-api').then(
      (notificationsApi) => ({
        isPermissionGranted: notificationsApi.isPermissionGranted,
        requestPermission: notificationsApi.requestPermission,
        registerForPushNotifications: (vapid?: string, account?: PushAccount) =>
          invoke<NativePushRegistration>('plugin:notifications|register_for_push_notifications', {
            vapid,
            userId: account?.userId,
            deviceId: account?.deviceId,
            ...(isAndroidTauri() ? { provider: 'fcm' } : {}),
          }),
        unregisterForPushNotifications: notificationsApi.unregisterForPushNotifications,
      })
    );
  }

  return nativePushNotificationsApiPromise;
}
