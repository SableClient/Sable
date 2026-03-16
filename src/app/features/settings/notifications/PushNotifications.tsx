import { MatrixClient } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';
import { ClientConfig } from '../../../hooks/useClientConfig';

const debugLog = createDebugLogger('PushNotifications');

type PushSubscriptionState = [
  PushSubscriptionJSON | null,
  (subscription: PushSubscription | null) => void,
];

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
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    debugLog.error(
      'notification',
      'Push messaging not supported - missing serviceWorker or PushManager'
    );
    throw new Error('Push messaging is not supported in this browser.');
  }
  debugLog.info('notification', 'Enabling push notifications');
  const [pushSubAtom, setPushSubscription] = pushSubscriptionAtom;
  const registration = await navigator.serviceWorker.ready;
  const currentBrowserSub = await registration.pushManager.getSubscription();

  /* Self-Healing Check. Effectively checks if the browser has invalidated our subscription and recreates it
     only when necessary. This prevents us from needing an external call to get back the web push info.
  */
  if (currentBrowserSub && pushSubAtom && currentBrowserSub.endpoint === pushSubAtom.endpoint) {
    debugLog.info('notification', 'Push subscription already exists and is valid - reusing', {
      endpoint: pushSubAtom.endpoint,
    });
    const { keys } = pushSubAtom;
    if (!keys?.p256dh || !keys.auth) return;
    const pusherData = {
      kind: 'http' as const,
      app_id: clientConfig.pushNotificationDetails?.webPushAppID,
      pushkey: keys.p256dh,
      app_display_name: 'Cinny',
      device_display_name: 'This Browser',
      lang: navigator.language || 'en',
      data: {
        url: clientConfig.pushNotificationDetails?.pushNotifyUrl,
        format: 'event_id_only' as const,
        endpoint: pushSubAtom.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      append: false,
    };
    navigator.serviceWorker.controller?.postMessage({
      url: mx.baseUrl,
      type: 'togglePush',
      pusherData,
      token: mx.getAccessToken(),
    });
    return;
  }

  if (currentBrowserSub) {
    debugLog.info('notification', 'Unsubscribing old push subscription');
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
  const { keys } = subJson;
  if (!keys?.p256dh || !keys.auth) {
    debugLog.error('notification', 'Push subscription missing required keys');
    throw new Error('Push subscription keys missing.');
  }
  const pusherData = {
    kind: 'http' as const,
    app_id: clientConfig.pushNotificationDetails?.webPushAppID,
    pushkey: keys.p256dh,
    app_display_name: 'Cinny',
    device_display_name:
      (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Unknown Device',
    lang: navigator.language || 'en',
    data: {
      url: clientConfig.pushNotificationDetails?.pushNotifyUrl,
      format: 'event_id_only' as const,
      endpoint: newSubscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    append: false,
  };

  navigator.serviceWorker.controller?.postMessage({
    url: mx.baseUrl,
    type: 'togglePush',
    pusherData,
    token: mx.getAccessToken(),
  });
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
  debugLog.info('notification', 'Disabling push notifications');
  const [pushSubAtom] = pushSubscriptionAtom;

  const pusherData = {
    kind: null,
    app_id: clientConfig.pushNotificationDetails?.webPushAppID,
    pushkey: pushSubAtom?.keys?.p256dh,
  };

  navigator.serviceWorker.controller?.postMessage({
    url: mx.baseUrl,
    type: 'togglePush',
    pusherData,
    token: mx.getAccessToken(),
  });
}

export async function deRegisterAllPushers(mx: MatrixClient): Promise<void> {
  const response = await mx.getPushers();
  const pushers = response.pushers || [];
  if (pushers.length === 0) return;

  const deletionPromises = pushers.map((pusher) => {
    const pusherToDelete = {
      kind: null,
      app_id: pusher.app_id,
      pushkey: pusher.pushkey,
    };
    return mx.setPusher(pusherToDelete as any);
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
  if (usePushNotifications) {
    if (visible && !keepEnabledWhenVisible) {
      await disablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
    } else {
      await enablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
    }
  }
}
