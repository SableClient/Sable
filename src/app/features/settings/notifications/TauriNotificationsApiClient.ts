import { addPluginListener, invoke, isTauri } from '@tauri-apps/api/core';
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
  registerActionTypes: (types: NotificationActionType[]) => Promise<void>;
  onAction: (
    listener: (event: NotificationActionEvent) => void
  ) => Promise<NotificationPluginListener>;
};

export type NotificationActionType = {
  id: string;
  actions: Array<{ id: string; title: string; input?: boolean }>;
};

export type NotificationActionNotification = Record<string, unknown> & {
  actionTypeId: string;
  extra?: Record<string, unknown>;
};

export type NotificationActionEvent = {
  actionId: string;
  inputValue?: string | null;
  notification: NotificationActionNotification;
};

type ActionListenerDependencies = { addListener: typeof addPluginListener; invoke: typeof invoke };
let actionListenerCount = 0;
let actionListenerTransition: Promise<void> = Promise.resolve();

const transitionActionListener = (invokeFn: typeof invoke, active: boolean): Promise<void> => {
  actionListenerTransition = actionListenerTransition
    .catch(() => {})
    .then(async () => {
      await invokeFn('plugin:notifications|set_action_listener_active', { active });
    });
  return actionListenerTransition;
};

async function subscribeToNativeNotificationActions(
  listener: (event: NotificationActionEvent) => void,
  dependencies: ActionListenerDependencies = { addListener: addPluginListener, invoke }
): Promise<NotificationPluginListener> {
  const pluginListener = await dependencies.addListener(
    'notifications',
    'actionPerformed',
    listener
  );
  try {
    actionListenerCount += 1;
    if (actionListenerCount === 1) await transitionActionListener(dependencies.invoke, true);
  } catch (error) {
    actionListenerCount = Math.max(0, actionListenerCount - 1);
    await pluginListener.unregister();
    throw error;
  }
  return {
    unregister: async () => {
      try {
        actionListenerCount = Math.max(0, actionListenerCount - 1);
        if (actionListenerCount === 0) await transitionActionListener(dependencies.invoke, false);
      } finally {
        await pluginListener.unregister();
      }
    },
  };
}

let notificationsApiPromise: Promise<TauriNotificationsApi> | null = null;

export async function getTauriNotificationsApi(): Promise<TauriNotificationsApi> {
  if (!notificationsApiPromise) {
    notificationsApiPromise = import('@choochmeque/tauri-plugin-notifications-api').then(
      (api) =>
        ({
          ...api,
          onAction: subscribeToNativeNotificationActions,
        }) as unknown as TauriNotificationsApi
    );
    notificationsApiPromise.catch(() => {
      notificationsApiPromise = null;
    });
  }

  return notificationsApiPromise;
}

let permissionPromise: Promise<boolean> | null = null;

async function ensureTauriNotificationPermission(): Promise<boolean> {
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
export const isAndroidTauri = (): boolean => isTauri() && osType() === 'android';
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
  extra?: Record<string, string>;
  actionTypeId?: string;
  group?: string;
  icon?: string;
};

export async function sendNativeTauriNotification({
  title,
  body,
  silent,
  extra,
  actionTypeId,
  group,
  icon,
}: NativeTauriNotification): Promise<void> {
  if (!(await ensureTauriNotificationPermission())) return;
  const api = await getTauriNotificationsApi();
  await api.sendNotification({
    id: nextNativeNotificationId(),
    title,
    body,
    silent: silent ?? false,
    extra,
    ...(actionTypeId ? { actionTypeId } : {}),
    ...(group ? { group } : {}),
    ...(icon ? { icon } : {}),
  });
}
