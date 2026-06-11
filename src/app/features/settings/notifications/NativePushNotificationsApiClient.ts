export type NativePushNotificationsApi = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
  registerForPushNotifications: () => Promise<string>;
  unregisterForPushNotifications: () => Promise<void>;
};

let nativePushNotificationsApiPromise: Promise<NativePushNotificationsApi> | null = null;

export async function getNativePushNotificationsApi(): Promise<NativePushNotificationsApi> {
  if (!nativePushNotificationsApiPromise) {
    nativePushNotificationsApiPromise =
      import('@sableclient/tauri-plugin-notifications-api') as Promise<NativePushNotificationsApi>;
  }

  return nativePushNotificationsApiPromise;
}
