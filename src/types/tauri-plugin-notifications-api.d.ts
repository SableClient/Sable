declare module '@sableclient/tauri-plugin-notifications-api' {
  export const Importance: {
    readonly Default: string;
  };

  export type MessagingStylePerson = {
    name: string;
    key?: string;
    iconUrl?: string;
  };

  export type MessagingStyleMessage = {
    text: string;
    timestamp: number;
    sender?: MessagingStylePerson;
  };

  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<NotificationPermission>;
  export function registerForPushNotifications(): Promise<string>;
  export function unregisterForPushNotifications(): Promise<void>;

  export function registerForUnifiedPush(): Promise<{
    endpoint: string;
    instance: string;
    pubKeySet?: {
      pubKey: string;
      auth: string;
    };
  }>;
  export function unregisterFromUnifiedPush(): Promise<void>;
  export function getUnifiedPushDistributors(): Promise<{ distributors: string[] }>;
  export function getUnifiedPushDistributor(): Promise<{ distributor: string }>;
  export function saveUnifiedPushDistributor(distributor: string): Promise<void>;

  export function createChannel(channel: {
    id: string;
    name: string;
    description?: string;
    importance?: string;
    vibration?: boolean;
  }): Promise<void>;

  export function sendNotification(payload: Record<string, unknown>): Promise<void>;
  export function removeActive(payload: Array<{ id: number }>): Promise<void>;

  export function onUnifiedPushMessage(listener: (payload: Record<string, unknown>) => void): {
    unregister: () => Promise<void> | void;
  };

  export function onUnifiedPushEndpoint(
    listener: (payload: { endpoint: string; instance: string }) => void
  ): {
    unregister: () => Promise<void> | void;
  };
}
