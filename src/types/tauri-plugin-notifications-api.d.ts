declare module '@sableclient/tauri-plugin-notifications-api' {
  export type { PermissionState } from '@tauri-apps/api/core';

  export const Importance: {
    readonly None: 0;
    readonly Min: 1;
    readonly Low: 2;
    readonly Default: 3;
    readonly High: 4;
  };

  export type NotificationMessage = {
    body: string;
    timestamp: number;
    senderName?: string;
    senderKey?: string;
  };

  export type NotificationOptions = {
    id?: number;
    channelId?: string;
    title: string;
    body?: string;
    schedule?: unknown;
    largeBody?: string;
    summary?: string;
    actionTypeId?: string;
    group?: string;
    groupSummary?: boolean;
    sound?: string;
    inboxLines?: string[];
    messages?: NotificationMessage[];
    groupConversation?: boolean;
    icon?: string;
    largeIcon?: string;
    iconColor?: string;
    attachments?: unknown[];
    extra?: Record<string, unknown>;
    ongoing?: boolean;
    autoCancel?: boolean;
    silent?: boolean;
    source?: string;
  };

  export type Channel = {
    id: string;
    name: string;
    description?: string;
    sound?: string;
    lights?: boolean;
    lightColor?: string;
    vibration?: boolean;
    importance?: (typeof Importance)[keyof typeof Importance];
    visibility?: number;
  };

  export type ActiveNotification = {
    id: number;
    tag?: string;
    title?: string;
    body?: string;
    extra?: Record<string, unknown>;
  };

  export type NotificationClickedData = {
    id: number;
    data?: Record<string, string>;
  };

  export type PluginListener = {
    unregister: () => Promise<void> | void;
  };

  export function isPermissionGranted(): Promise<boolean | null>;
  export function requestPermission(): Promise<NotificationPermission>;
  export function sendNotification(options: NotificationOptions | string): Promise<void>;
  export function registerForPushNotifications(): Promise<string>;
  export function unregisterForPushNotifications(): Promise<void>;
  export function listDistributors(): Promise<string[]>;
  export function setDistributor(name: string): Promise<void>;
  export function setToken(token: string): Promise<void>;
  export function createChannel(channel: Channel): Promise<void>;
  export function removeChannel(id: string): Promise<void>;
  export function channels(): Promise<Channel[]>;
  export function active(): Promise<ActiveNotification[]>;
  export function removeActive(notifications: Array<{ id: number }>): Promise<void>;
  export function removeAllActive(): Promise<void>;
  export function pending(): Promise<unknown[]>;
  export function cancel(notifications: number[]): Promise<void>;
  export function cancelAll(): Promise<void>;
  export function onNotificationReceived(
    cb: (notification: NotificationOptions) => void
  ): Promise<PluginListener>;
  export function onAction(
    cb: (notification: NotificationOptions) => void
  ): Promise<PluginListener>;
  export function onNotificationClicked(
    cb: (data: NotificationClickedData) => void
  ): Promise<PluginListener>;
}
