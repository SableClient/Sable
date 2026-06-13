import type { MatrixClient } from '$types/matrix-sdk';
import * as Sentry from '@sentry/react';
import { createDebugLogger } from '$utils/debugLogger';
import { isTauri } from '@tauri-apps/api/core';
import type { ClientConfig } from '../../../hooks/useClientConfig';

const debugLog = createDebugLogger('PushNotifications');

type PushSubscriptionState = [
  PushSubscriptionJSON | null,
  (subscription: PushSubscription | null) => void,
];

type WebPushPusherData = Parameters<MatrixClient['setPusher']>[0];

const LEGACY_WEB_PUSH_APP_IDS = new Set(['moe.sable.app.sygnal']);

const getCurrentWebPushAppIds = (clientConfig: ClientConfig): string[] =>
  [clientConfig.pushNotificationDetails?.webPushAppID].filter((appId): appId is string => !!appId);

type WebPushPusherDeleteRequest = {
  app_id: string;
  pushkey: string;
};

const deleteWebPushPushers = async (
  mx: MatrixClient,
  pushers: WebPushPusherDeleteRequest[]
): Promise<void> => {
  if (pushers.length === 0) return;

  await Promise.allSettled(
    pushers.map((pusher) =>
      mx.setPusher({
        kind: null,
        app_id: pusher.app_id,
        pushkey: pusher.pushkey,
      } as unknown as Parameters<typeof mx.setPusher>[0])
    )
  );
};

const deleteWebPushPushersByPushkey = async (
  mx: MatrixClient,
  appIds: string[],
  pushkey?: string
): Promise<void> => {
  if (!pushkey) return;

  await deleteWebPushPushers(
    mx,
    appIds.map((appId) => ({ app_id: appId, pushkey }))
  );
};

const deleteLegacyWebPushPushers = async (mx: MatrixClient): Promise<void> => {
  try {
    const response = await mx.getPushers();
    const legacyPushers = (response.pushers ?? [])
      .filter((pusher) => LEGACY_WEB_PUSH_APP_IDS.has(pusher.app_id) && !!pusher.pushkey)
      .map((pusher) => ({ app_id: pusher.app_id, pushkey: pusher.pushkey }));

    await deleteWebPushPushers(mx, legacyPushers);
  } catch (error) {
    debugLog.warn('notification', 'Failed to inspect legacy web pushers for cleanup', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

async function buildWebPushPusherData(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  subscription: PushSubscriptionJSON,
  deviceDisplayName: string
): Promise<WebPushPusherData> {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('Push subscription keys missing.');
  }
  const appId = clientConfig.pushNotificationDetails?.webPushAppID;
  const pushNotifyUrl = clientConfig.pushNotificationDetails?.pushNotifyUrl;
  if (!appId || !pushNotifyUrl) {
    throw new Error('Push notification config is incomplete.');
  }

  const declarativeWebPushFallback =
    clientConfig.pushNotificationDetails?.declarativeWebPushFallback === true;

  return {
    kind: 'http' as const,
    app_id: appId,
    pushkey: keys.p256dh,
    app_display_name: 'Charm',
    device_display_name: deviceDisplayName,
    lang: navigator.language || 'en',
    data: {
      url: pushNotifyUrl,
      format: 'event_id_only' as const,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      ...(declarativeWebPushFallback ? { declarative_web_push: true } : {}),
    },
    append: false,
  } as unknown as WebPushPusherData;
}

async function getDeviceDisplayName(mx: MatrixClient): Promise<string> {
  try {
    return (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Unknown Device';
  } catch {
    return 'Unknown Device';
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    debugLog.warn('notification', 'Notification API not available in this browser');
    return 'denied';
  }
  try {
    debugLog.info('notification', 'Requesting browser notification permission');
    const permission: NotificationPermission = await Notification.requestPermission();
    debugLog.info('notification', 'Notification permission result', { permission });
    return permission;
  } catch (error) {
    debugLog.error('notification', 'Failed to request notification permission', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'denied';
  }
}

export async function enablePushNotifications(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  pushSubscriptionAtom: PushSubscriptionState
): Promise<void> {
  if (isTauri()) {
    throw new Error('Push notifications are disabled in Tauri runtime.');
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    debugLog.error(
      'notification',
      'Push messaging not supported - missing serviceWorker or PushManager'
    );
    throw new Error('Push messaging is not supported in this browser.');
  }

  const span = Sentry.startInactiveSpan({
    name: 'push.register',
    op: 'notification',
    attributes: {
      'push.transport': 'webpush',
      'push.has_service_worker': !!navigator.serviceWorker.controller,
      'push.sw_state': navigator.serviceWorker.controller?.state ?? 'none',
      'push.has_application_server_key': !!clientConfig.pushNotificationDetails?.vapidPublicKey,
    },
  });

  debugLog.info('notification', 'Enabling push notifications');
  const [pushSubAtom, setPushSubscription] = pushSubscriptionAtom;
  const registration = await navigator.serviceWorker.ready;

  const currentBrowserSub = await registration.pushManager.getSubscription();

  Sentry.addBreadcrumb({
    category: 'push',
    message: 'Push registration attempt',
    data: {
      existingSubscription: !!currentBrowserSub,
      permissionState: 'Notification' in window ? window.Notification.permission : 'unsupported',
      swControllerState: navigator.serviceWorker.controller?.state ?? 'none',
    },
    level: 'info',
  });

  try {
    /* Self-Healing Check. Effectively checks if the browser has invalidated our subscription and recreates it
     only when necessary. This prevents us from needing an external call to get back the web push info.
  */
    if (currentBrowserSub && pushSubAtom && currentBrowserSub.endpoint === pushSubAtom.endpoint) {
      debugLog.info('notification', 'Push subscription already exists and is valid - reusing', {
        endpoint: pushSubAtom.endpoint,
      });
      setPushSubscription(currentBrowserSub);
      const pusherData = await buildWebPushPusherData(
        mx,
        clientConfig,
        currentBrowserSub.toJSON(),
        await getDeviceDisplayName(mx)
      );
      await mx.setPusher(pusherData);
      await deleteLegacyWebPushPushers(mx);

      span.setAttribute('push.endpoint', pushSubAtom.endpoint);
      span.setAttribute('push.success', true);
      span.setAttribute('push.reused_subscription', true);
      span.end();
      Sentry.metrics.count('sable.push.registration', 1, {
        attributes: { outcome: 'reused', has_vapid: true },
      });
      return;
    }

    if (currentBrowserSub) {
      debugLog.info('notification', 'Unsubscribing old push subscription');
      await deleteWebPushPushersByPushkey(
        mx,
        getCurrentWebPushAppIds(clientConfig),
        currentBrowserSub.toJSON().keys?.p256dh
      );
      await deleteLegacyWebPushPushers(mx);
      await currentBrowserSub.unsubscribe();
    }

    debugLog.info('notification', 'Creating new push subscription');
    const newSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: clientConfig.pushNotificationDetails?.vapidPublicKey,
    });

    debugLog.info('notification', 'Push subscription created successfully', {
      endpoint: newSubscription.endpoint,
    });
    setPushSubscription(newSubscription);

    const subJson = newSubscription.toJSON();
    const pusherData = await buildWebPushPusherData(
      mx,
      clientConfig,
      subJson,
      await getDeviceDisplayName(mx)
    );
    await mx.setPusher(pusherData);

    span.setAttribute('push.endpoint', newSubscription.endpoint);
    span.setAttribute('push.success', true);
    span.end();
    Sentry.metrics.count('sable.push.registration', 1, {
      attributes: { outcome: 'created', has_vapid: true },
    });
  } catch (err) {
    span.setAttribute('push.success', false);
    span.setAttribute('push.error', err instanceof Error ? err.message : String(err));
    span.end();
    Sentry.metrics.count('sable.push.registration', 1, {
      attributes: {
        outcome: 'failed',
        error_type: err instanceof Error ? err.name : 'unknown',
      },
    });
    Sentry.addBreadcrumb({
      category: 'push',
      message: 'Push registration failed',
      data: { error: err instanceof Error ? err.message : String(err) },
      level: 'error',
    });
    throw err;
  }
}

/**
 * Disables push notifications by telling the homeserver to delete the pusher,
 * but keeps the browser subscription locally for a fast re-enable.
 */
export async function disablePushNotifications(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  pushSubscriptionAtom: PushSubscriptionState
): Promise<void> {
  if (isTauri()) return;

  debugLog.info('notification', 'Disabling push notifications');
  const [pushSubAtom] = pushSubscriptionAtom;
  const pushkey = pushSubAtom?.keys?.p256dh;
  const appIds = getCurrentWebPushAppIds(clientConfig);

  await deleteWebPushPushersByPushkey(mx, appIds, pushkey);
  await deleteLegacyWebPushPushers(mx);
}

export async function deRegisterAllPushers(mx: MatrixClient): Promise<void> {
  const response = await mx.getPushers();
  const pushers = response.pushers || [];
  if (pushers.length === 0) return;

  const deletionPromises = pushers.map((pusher) => {
    const pusherToDelete: { kind: null; app_id: string; pushkey: string } = {
      kind: null,
      app_id: pusher.app_id,
      pushkey: pusher.pushkey,
    };
    return mx.setPusher(pusherToDelete as unknown as Parameters<typeof mx.setPusher>[0]);
  });

  await Promise.allSettled(deletionPromises);
}

export async function togglePusher(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  visible: boolean,
  usePushNotifications: boolean,
  pushSubscriptionAtom: PushSubscriptionState,
  keepEnabledWhenVisible = false
): Promise<void> {
  if (!usePushNotifications) return;

  if (visible && !keepEnabledWhenVisible) {
    await disablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
    return;
  }

  await enablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
}
