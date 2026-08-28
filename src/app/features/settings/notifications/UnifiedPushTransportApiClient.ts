import { invoke } from '@tauri-apps/api/core';
import type { PushAccount } from './pushAccount';

export type UnifiedPushRegistration = {
  deviceToken: string;
  p256dh?: string;
  auth?: string;
  /** Set when the in-app websocket distributor answered instead of an installed one. */
  distributor?: string;
};

export type UnifiedPushTransportApi = {
  isPermissionGranted: () => Promise<boolean | null>;
  requestPermission: () => Promise<NotificationPermission>;
  registerForPushNotifications: (
    vapid?: string,
    embeddedGatewayUrl?: string,
    account?: PushAccount
  ) => Promise<UnifiedPushRegistration>;
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
    registerForPushNotifications: (
      vapid?: string,
      embeddedGatewayUrl?: string,
      account?: PushAccount
    ) =>
      invoke<UnifiedPushRegistration>('plugin:notifications|register_for_push_notifications', {
        vapid,
        provider: 'unifiedpush',
        embeddedGatewayUrl,
        userId: account?.userId,
        deviceId: account?.deviceId,
      }),
    unregisterForPushNotifications: notificationsApi.unregisterForPushNotifications,
    listDistributors: notificationsApi.listDistributors,
    setDistributor: notificationsApi.setDistributor,
    setToken: notificationsApi.setToken,
  };
}
