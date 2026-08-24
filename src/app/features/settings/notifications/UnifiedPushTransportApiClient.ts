import { invoke } from '@tauri-apps/api/core';

export type UnifiedPushRegistration = {
  deviceToken: string;
  p256dh?: string;
  auth?: string;
};

export type UnifiedPushTransportApi = {
  isPermissionGranted: () => Promise<boolean | null>;
  requestPermission: () => Promise<NotificationPermission>;
  registerForPushNotifications: (vapid?: string) => Promise<UnifiedPushRegistration>;
  unregisterForPushNotifications: () => Promise<void>;
  listDistributors: () => Promise<string[]>;
  setDistributor: (name: string) => Promise<void>;
  setToken: (token: string) => Promise<void>;
};

export async function getUnifiedPushTransportApi(): Promise<UnifiedPushTransportApi> {
  const notificationsApi = await import('@sableclient/tauri-plugin-notifications-api');
  return {
    isPermissionGranted: notificationsApi.isPermissionGranted,
    requestPermission: notificationsApi.requestPermission,
    registerForPushNotifications: (vapid?: string) =>
      invoke<UnifiedPushRegistration>('plugin:notifications|register_for_push_notifications', {
        vapid,
        provider: 'unifiedpush',
      }),
    unregisterForPushNotifications: notificationsApi.unregisterForPushNotifications,
    listDistributors: notificationsApi.listDistributors,
    setDistributor: notificationsApi.setDistributor,
    setToken: notificationsApi.setToken,
  };
}
