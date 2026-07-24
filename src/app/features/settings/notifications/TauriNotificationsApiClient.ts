import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

export type NotificationPluginListener = {
  unregister: () => Promise<void> | void;
};

export type TauriNotificationsApi = {
  Importance: {
    readonly None: 0;
    readonly Min: 1;
    readonly Low: 2;
    readonly Default: 3;
    readonly High: 4;
  };
  createChannel: (channel: {
    id: string;
    name: string;
    description?: string;
    importance?: number;
    vibration?: boolean;
  }) => Promise<void>;
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
  sendNotification: (payload: Record<string, unknown>) => Promise<void>;
  removeActive: (payload: Array<{ id: number; tag?: string }>) => Promise<void>;
  onNotificationReceived: (
    listener: (notification: Record<string, unknown>) => void
  ) => Promise<NotificationPluginListener>;
  onNotificationClicked: (
    listener: (data: { id: number; data?: Record<string, string> }) => void
  ) => Promise<NotificationPluginListener>;
};

let notificationsApiPromise: Promise<TauriNotificationsApi> | null = null;

export async function getTauriNotificationsApi(): Promise<TauriNotificationsApi> {
  if (!notificationsApiPromise) {
    notificationsApiPromise =
      import('@choochmeque/tauri-plugin-notifications-api') as unknown as Promise<TauriNotificationsApi>;
  }

  return notificationsApiPromise;
}

let permissionPromise: Promise<boolean> | null = null;

export async function ensureTauriNotificationPermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      const api = await getTauriNotificationsApi();
      if (await api.isPermissionGranted()) return true;
      return (await api.requestPermission()) === 'granted';
    })();
    permissionPromise.then(
      (granted) => {
        if (!granted) permissionPromise = null;
      },
      () => {
        permissionPromise = null;
      }
    );
  }

  return permissionPromise;
}

// Desktop webviews can't show web notifications (WKWebView lacks the API; the
// Linux CEF runtime never grants it), so desktop routes through the native plugin.
const DESKTOP_TAURI_OS = new Set(['linux', 'macos', 'windows']);
export const isDesktopTauri = (): boolean => isTauri() && DESKTOP_TAURI_OS.has(osType());
export const isIosTauri = (): boolean => isTauri() && osType() === 'ios';
// Platforms where OS notifications go through the native plugin instead of web APIs.
export const isNativeNotificationTauri = (): boolean => isDesktopTauri() || isIosTauri();

let nativeNotificationSeq = 1;
const nextNativeNotificationId = (): number => {
  const id = nativeNotificationSeq;
  nativeNotificationSeq = nativeNotificationSeq >= 2_000_000_000 ? 1 : nativeNotificationSeq + 1;
  return id;
};

export type NativeTauriNotification = {
  title: string;
  body?: string;
  silent?: boolean;
  /** Attached to the notification and handed back by onNotificationClicked. */
  extra?: Record<string, string>;
};

export async function sendNativeTauriNotification({
  title,
  body,
  silent,
  extra,
}: NativeTauriNotification): Promise<void> {
  if (!(await ensureTauriNotificationPermission())) return;
  const api = await getTauriNotificationsApi();
  await api.sendNotification({
    id: nextNativeNotificationId(),
    title,
    body,
    silent: silent ?? false,
    extra,
  });
}
