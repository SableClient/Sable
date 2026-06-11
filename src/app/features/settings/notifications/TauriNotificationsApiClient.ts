export type NotificationPluginListener = {
  unregister: () => Promise<void> | void;
};

export type TauriNotificationsApi = {
  Importance: {
    readonly Default: string;
  };
  createChannel: (channel: {
    id: string;
    name: string;
    description?: string;
    importance?: string;
    vibration?: boolean;
  }) => Promise<void>;
  sendNotification: (payload: Record<string, unknown>) => Promise<void>;
  removeActive: (payload: Array<{ id: number; tag?: string }>) => Promise<void>;
  onUnifiedPushMessage: (
    listener: (payload: Record<string, unknown>) => void
  ) => Promise<NotificationPluginListener> | NotificationPluginListener;
  onUnifiedPushEndpoint: (
    listener: (payload: { endpoint: string; instance: string }) => void
  ) => Promise<NotificationPluginListener> | NotificationPluginListener;
};

let notificationsApiPromise: Promise<TauriNotificationsApi> | null = null;

export async function getTauriNotificationsApi(): Promise<TauriNotificationsApi> {
  if (!notificationsApiPromise) {
    notificationsApiPromise =
      import('@sableclient/tauri-plugin-notifications-api') as Promise<TauriNotificationsApi>;
  }

  return notificationsApiPromise;
}
