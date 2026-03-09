/**
 * Local bindings for the tauri-plugin-notifications Tauri plugin.
 *
 * Vendored from the guest-js of
 * https://github.com/TastelessVoid/tauri-plugin-notifications (unified-push-support branch)
 * because the npm package ships without built dist-js artifacts.
 *
 * Only the subset of APIs used by Sable is included.
 */

import { invoke, type PluginListener, addPluginListener } from '@tauri-apps/api/core';

export interface UnifiedPushEndpoint {
  endpoint: string;
  instance: string;
}

interface NotificationOptions {
  id?: number;
  channelId?: string;
  title: string;
  body?: string;
  largeBody?: string;
  summary?: string;
  group?: string;
  groupSummary?: boolean;
  sound?: string;
  icon?: string;
  largeIcon?: string;
  silent?: boolean;
  ongoing?: boolean;
  autoCancel?: boolean;
  extra?: Record<string, unknown>;
  number?: number;
}

export async function sendNotification(options: NotificationOptions | string): Promise<void> {
  await invoke('plugin:notifications|notify', {
    options: typeof options === 'string' ? { title: options } : options,
  });
}

export async function registerForUnifiedPush(): Promise<UnifiedPushEndpoint> {
  return invoke('plugin:notifications|register_for_unified_push');
}

export async function unregisterFromUnifiedPush(): Promise<void> {
  return invoke('plugin:notifications|unregister_from_unified_push');
}

export async function getUnifiedPushDistributors(): Promise<{ distributors: string[] }> {
  return invoke('plugin:notifications|get_unified_push_distributors');
}

export async function saveUnifiedPushDistributor(distributor: string): Promise<void> {
  return invoke('plugin:notifications|save_unified_push_distributor', { distributor });
}

export async function getUnifiedPushDistributor(): Promise<{ distributor: string }> {
  return invoke('plugin:notifications|get_unified_push_distributor');
}

export async function onUnifiedPushEndpoint(
  cb: (data: UnifiedPushEndpoint) => void
): Promise<PluginListener> {
  return addPluginListener('notifications', 'unifiedpush-endpoint', cb);
}

export async function onUnifiedPushMessage(
  cb: (data: Record<string, unknown>) => void
): Promise<PluginListener> {
  return addPluginListener('notifications', 'unifiedpush-message', cb);
}

export async function onUnifiedPushUnregistered(
  cb: (data: { instance: string }) => void
): Promise<PluginListener> {
  return addPluginListener('notifications', 'unifiedpush-unregistered', cb);
}

export async function onUnifiedPushError(
  cb: (data: { message: string; instance?: string }) => void
): Promise<PluginListener> {
  return addPluginListener('notifications', 'unifiedpush-error', cb);
}
