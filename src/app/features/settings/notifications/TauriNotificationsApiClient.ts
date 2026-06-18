import * as notificationsApi from './TauriNotificationsPluginApi';

export type NotificationPluginListener = {
  unregister: () => Promise<void> | void;
};

export type TauriNotificationsApi = {
  Importance: {
    readonly Default: number;
  };
  createChannel: (channel: {
    id: string;
    name: string;
    description?: string;
    importance?: number;
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

export async function getTauriNotificationsApi(): Promise<TauriNotificationsApi> {
  return notificationsApi;
}
