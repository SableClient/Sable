import { addPluginListener, invoke, type PluginListener } from '@tauri-apps/api/core';

export enum Importance {
  Default = 'Default',
}

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

export type NotificationPluginListener = PluginListener;

export type UnifiedPushEndpoint = {
  endpoint: string;
  instance: string;
  pubKeySet?: {
    pubKey: string;
    auth: string;
  };
};

export type NotificationChannel = {
  id: string;
  name: string;
  description?: string;
  importance?: string;
  vibration?: boolean;
};

export async function isPermissionGranted(): Promise<boolean> {
  return invoke('plugin:notifications|is_permission_granted');
}

export async function requestPermission(): Promise<NotificationPermission> {
  return invoke('plugin:notifications|request_permission');
}

export async function registerForPushNotifications(): Promise<string> {
  return invoke('plugin:notifications|register_for_push_notifications');
}

export async function unregisterForPushNotifications(): Promise<void> {
  await invoke('plugin:notifications|unregister_for_push_notifications');
}

export async function registerForUnifiedPush(): Promise<UnifiedPushEndpoint> {
  return invoke('plugin:notifications|register_for_unified_push');
}

export async function unregisterFromUnifiedPush(): Promise<void> {
  await invoke('plugin:notifications|unregister_from_unified_push');
}

export async function getUnifiedPushDistributors(): Promise<{ distributors: string[] }> {
  return invoke('plugin:notifications|get_unified_push_distributors');
}

export async function getUnifiedPushDistributor(): Promise<{ distributor: string }> {
  return invoke('plugin:notifications|get_unified_push_distributor');
}

export async function saveUnifiedPushDistributor(distributor: string): Promise<void> {
  await invoke('plugin:notifications|save_unified_push_distributor', { distributor });
}

export async function createChannel(channel: NotificationChannel): Promise<void> {
  await invoke('plugin:notifications|create_channel', { channel });
}

export async function sendNotification(payload: Record<string, unknown>): Promise<void> {
  await invoke('plugin:notifications|notify', { options: payload });
}

export async function removeActive(
  notifications: Array<{ id: number; tag?: string }>
): Promise<void> {
  await invoke('plugin:notifications|remove_active', { notifications });
}

export async function onUnifiedPushMessage(
  listener: (payload: Record<string, unknown>) => void
): Promise<NotificationPluginListener> {
  return addPluginListener('notifications', 'unifiedpush-message', listener);
}

export async function onUnifiedPushEndpoint(
  listener: (payload: { endpoint: string; instance: string }) => void
): Promise<NotificationPluginListener> {
  return addPluginListener('notifications', 'unifiedpush-endpoint', listener);
}
