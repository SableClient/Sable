import * as notificationsApi from './TauriNotificationsPluginApi';

export type NativePushNotificationsApi = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
  registerForPushNotifications: () => Promise<string>;
  unregisterForPushNotifications: () => Promise<void>;
};

export async function getNativePushNotificationsApi(): Promise<NativePushNotificationsApi> {
  return notificationsApi;
}
