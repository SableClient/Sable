import type { MatrixClient } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';
import { isTauri } from '@tauri-apps/api/core';
import { MATRIX_UNSTABLE_MSC4174_WEBPUSH_PUSHER_KIND } from '$unstable/prefixes';
import type { ClientConfig } from '../../../hooks/useClientConfig';
import { resolvePushNotifyUrl } from './PushPusherConfig';
import { getWebPushServerSupport, removeStaleHttpPushers } from './webPushSupport';

const debugLog = createDebugLogger('PushNotifications');

const BROWSER_DEVICE_NAME = 'This Browser';

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

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * True when the browser subscription was created with the given VAPID key.
 * A different key (gateway vs homeserver) requires a fresh subscription.
 */
function applicationServerKeyMatches(
  subscriptionKey: ArrayBuffer | null,
  vapidPublicKey: string | undefined
): boolean {
  if (!vapidPublicKey) return subscriptionKey === null;
  if (!subscriptionKey) return false;
  const expected = base64UrlToBytes(vapidPublicKey);
  const actual = new Uint8Array(subscriptionKey);
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
}

/** Gateway URL for the legacy `http` pusher; validates the user override. */
function resolveHttpGatewayUrl(
  clientConfig: ClientConfig,
  pushNotifyUrlOverride?: string
): string | undefined {
  const configuredUrl = clientConfig.pushNotificationDetails?.pushNotifyUrl;
  if (!configuredUrl?.trim() && !pushNotifyUrlOverride?.trim()) return configuredUrl;
  return resolvePushNotifyUrl(configuredUrl, pushNotifyUrlOverride);
}

type WebPusherOptions = {
  endpoint: string;
  pushkey: string;
  auth: string;
  deviceDisplayName: string;
  pushNotifyUrlOverride?: string;
};

function buildWebPusherData(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  useServerWebPush: boolean,
  options: WebPusherOptions
): Record<string, unknown> {
  const { endpoint, pushkey, auth, deviceDisplayName, pushNotifyUrlOverride } = options;

  if (useServerWebPush) {
    // MSC4174: data.url is the push subscription endpoint, not a gateway.
    return {
      kind: MATRIX_UNSTABLE_MSC4174_WEBPUSH_PUSHER_KIND,
      app_id: clientConfig.pushNotificationDetails?.webPushAppID,
      pushkey,
      app_display_name: 'Sable (Web Push)',
      device_display_name: deviceDisplayName,
      lang: navigator.language || 'en',
      data: {
        url: endpoint,
        auth,
        format: 'event_id_only',
        default_payload: { user_id: mx.getSafeUserId() },
      },
      append: false,
    };
  }

  return {
    kind: 'http' as const,
    app_id: clientConfig.pushNotificationDetails?.webPushAppID,
    pushkey,
    app_display_name: 'Cinny',
    device_display_name: deviceDisplayName,
    lang: navigator.language || 'en',
    data: {
      url: resolveHttpGatewayUrl(clientConfig, pushNotifyUrlOverride),
      format: 'event_id_only' as const,
      endpoint,
      p256dh: pushkey,
      auth,
    },
    append: false,
  };
}

function postPusherToServiceWorker(mx: MatrixClient, pusherData: Record<string, unknown>): void {
  navigator.serviceWorker.controller?.postMessage({
    url: mx.baseUrl,
    type: 'togglePush',
    pusherData,
    token: mx.getAccessToken(),
  });
}

export async function enablePushNotifications(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  pushSubscriptionAtom: PushSubscriptionState,
  pushNotifyUrlOverride?: string
): Promise<void> {
  if (isTauri()) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    debugLog.error(
      'notification',
      'Push messaging not supported - missing serviceWorker or PushManager'
    );
    throw new Error('Push messaging is not supported in this browser.');
  }
  debugLog.info('notification', 'Enabling push notifications');

  const webPushSupport = await getWebPushServerSupport(mx);
  const useServerWebPush = webPushSupport.supported;
  const applicationServerKey = useServerWebPush
    ? webPushSupport.vapidPublicKey
    : clientConfig.pushNotificationDetails?.vapidPublicKey;
  const deviceDisplayName =
    (await mx.getDevice(mx.getDeviceId() ?? ''))?.display_name ?? 'Unknown Device';

  const [pushSubAtom, setPushSubscription] = pushSubscriptionAtom;
  const registration = await navigator.serviceWorker.ready;
  const currentBrowserSub = await registration.pushManager.getSubscription();

  /* Self-Healing Check. Effectively checks if the browser has invalidated our subscription and recreates it
     only when necessary. This prevents us from needing an external call to get back the web push info.
     Also requires the VAPID key to match the active transport. */
  if (
    currentBrowserSub &&
    pushSubAtom &&
    currentBrowserSub.endpoint === pushSubAtom.endpoint &&
    applicationServerKeyMatches(
      currentBrowserSub.options.applicationServerKey,
      applicationServerKey
    )
  ) {
    debugLog.info('notification', 'Push subscription already exists and is valid - reusing', {
      endpoint: pushSubAtom.endpoint,
    });
    const { keys } = pushSubAtom;
    if (!keys?.p256dh || !keys.auth) return;
    postPusherToServiceWorker(
      mx,
      buildWebPusherData(mx, clientConfig, useServerWebPush, {
        endpoint: pushSubAtom.endpoint,
        pushkey: keys.p256dh,
        auth: keys.auth,
        deviceDisplayName: BROWSER_DEVICE_NAME,
        pushNotifyUrlOverride,
      })
    );
    if (useServerWebPush) {
      await removeStaleHttpPushers(mx, clientConfig.pushNotificationDetails?.webPushAppID, [
        deviceDisplayName,
        BROWSER_DEVICE_NAME,
      ]);
    }
    return;
  }

  if (currentBrowserSub) {
    debugLog.info('notification', 'Unsubscribing old push subscription');
    await currentBrowserSub.unsubscribe();
  }

  debugLog.info('notification', 'Creating new push subscription');
  const newSubscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
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

  postPusherToServiceWorker(
    mx,
    buildWebPusherData(mx, clientConfig, useServerWebPush, {
      endpoint: newSubscription.endpoint,
      pushkey: keys.p256dh,
      auth: keys.auth,
      deviceDisplayName,
      pushNotifyUrlOverride,
    })
  );
  if (useServerWebPush) {
    await removeStaleHttpPushers(mx, clientConfig.pushNotificationDetails?.webPushAppID, [
      deviceDisplayName,
      BROWSER_DEVICE_NAME,
    ]);
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
  keepEnabledWhenVisible = false,
  pushNotifyUrlOverride?: string
): Promise<void> {
  if (usePushNotifications) {
    if (visible && !keepEnabledWhenVisible) {
      await disablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
    } else {
      await enablePushNotifications(mx, clientConfig, pushSubscriptionAtom, pushNotifyUrlOverride);
    }
  }
}
