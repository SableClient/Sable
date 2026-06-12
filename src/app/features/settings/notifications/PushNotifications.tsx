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

function postToServiceWorker(data: unknown): void {
  if (!('serviceWorker' in navigator)) return;

  const posted = new Set<ServiceWorker>();
  const postToWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker || posted.has(worker)) return;
    posted.add(worker);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(data);
  };

  postToWorker(navigator.serviceWorker.controller);
  navigator.serviceWorker.ready
    .then((registration) => {
      postToWorker(registration.active);
      postToWorker(registration.waiting);
      postToWorker(registration.installing);
    })
    .catch(() => undefined);
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
    const declarativeWebPushFallback =
      clientConfig.pushNotificationDetails?.declarativeWebPushFallback === true;

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
        app_display_name: 'Sable',
        device_display_name: 'This Browser',
        lang: navigator.language || 'en',
        data: {
          url: clientConfig.pushNotificationDetails?.pushNotifyUrl,
          format: 'event_id_only' as const,
          endpoint: pushSubAtom.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          ...(declarativeWebPushFallback ? { declarative_web_push: true } : {}),
        },
        append: false,
      };
      postToServiceWorker({
        url: mx.baseUrl,
        type: 'togglePush',
        pusherData,
        token: mx.getAccessToken(),
      });

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
      app_display_name: 'Sable',
      device_display_name:
        (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Unknown Device',
      lang: navigator.language || 'en',
      data: {
        url: clientConfig.pushNotificationDetails?.pushNotifyUrl,
        format: 'event_id_only' as const,
        endpoint: newSubscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        ...(declarativeWebPushFallback ? { declarative_web_push: true } : {}),
      },
      append: false,
    };

    postToServiceWorker({
      url: mx.baseUrl,
      type: 'togglePush',
      pusherData,
      token: mx.getAccessToken(),
    });

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

  const pusherData = {
    kind: null,
    app_id: clientConfig.pushNotificationDetails?.webPushAppID,
    pushkey: pushSubAtom?.keys?.p256dh,
  };

  postToServiceWorker({
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
  keepEnabledWhenVisible = false
): Promise<void> {
  if (usePushNotifications) {
    const [pushSubAtom] = pushSubscriptionAtom;
    // Only enable/disable pushes if a subscription already exists. If there's no
    // subscription yet, that means the user hasn't explicitly enabled push (no user
    // gesture), so attempting to call pushManager.subscribe() will throw NotAllowedError.
    // The user must explicitly enable push via the settings UI button before we can
    // manage the pusher lifecycle during visibility changes.
    if (!pushSubAtom) {
      debugLog.info('notification', 'togglePusher: no subscription exists yet, skipping', {
        visible,
        usePushNotifications,
        keepEnabledWhenVisible,
      });
      return;
    }

    if (visible && !keepEnabledWhenVisible) {
      debugLog.info('notification', 'togglePusher: disabling (app visible)', {
        visible,
        keepEnabledWhenVisible,
      });
      Sentry.addBreadcrumb({
        category: 'push',
        message: 'Pusher disabled - app visible',
        level: 'info',
        data: { visible, keepEnabledWhenVisible },
      });
      Sentry.metrics.count('sable.push.disabled', 1, {
        attributes: { reason: 'app_visible' },
      });
      await disablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
    } else {
      const reason = keepEnabledWhenVisible
        ? 'kept_active_when_visible'
        : visible
          ? 'kept_active_visible'
          : 'enabled_backgrounded';
      debugLog.info('notification', `togglePusher: enabling/keeping active (${reason})`, {
        visible,
        keepEnabledWhenVisible,
      });
      Sentry.addBreadcrumb({
        category: 'push',
        message: `Pusher ${keepEnabledWhenVisible ? 'kept active' : 'enabled'}`,
        level: 'info',
        data: { visible, keepEnabledWhenVisible, reason },
      });
      Sentry.metrics.count('sable.push.enabled', 1, {
        attributes: { reason },
      });
      await enablePushNotifications(mx, clientConfig, pushSubscriptionAtom);
    }
  }
}
