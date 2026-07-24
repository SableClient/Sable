import type { IPusherRequest, MatrixClient } from '$types/matrix-sdk';
import type { ClientConfig } from '$hooks/useClientConfig';
import { getNativePushNotificationsApi } from './NativePushNotificationsApiClient';

const NATIVE_PUSH_PUSHKEY_STORAGE_KEY = 'nativePushToken';
const NATIVE_PUSH_APP_ID_STORAGE_KEY = 'nativePushAppId';

export type NativePushRegistrationResult =
  | {
      permission: 'granted';
      token: string;
      p256dh?: string;
      auth?: string;
    }
  | {
      permission: 'default' | 'denied';
      token: null;
    };

export type { NativePushNotificationsApi } from './NativePushNotificationsApiClient';

const FIREBASE_UNCONFIGURED_PATTERN = /firebaseapp is not initialized|default firebaseapp/i;

function describeNativePushRegistrationError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (FIREBASE_UNCONFIGURED_PATTERN.test(detail)) {
    return 'Native push (FCM) is unavailable: this build has no Firebase configuration (google-services.json).';
  }
  return `Native push registration failed: ${detail}`;
}

function storeNativePushRegistration(appId: string, pushkey: string): void {
  localStorage.setItem(NATIVE_PUSH_APP_ID_STORAGE_KEY, appId);
  localStorage.setItem(NATIVE_PUSH_PUSHKEY_STORAGE_KEY, pushkey);
}

function getStoredNativePushRegistration(): { appId: string; pushkey: string } | null {
  const appId = localStorage.getItem(NATIVE_PUSH_APP_ID_STORAGE_KEY);
  const pushkey = localStorage.getItem(NATIVE_PUSH_PUSHKEY_STORAGE_KEY);
  return appId && pushkey ? { appId, pushkey } : null;
}

function clearStoredNativePushRegistration(): void {
  localStorage.removeItem(NATIVE_PUSH_APP_ID_STORAGE_KEY);
  localStorage.removeItem(NATIVE_PUSH_PUSHKEY_STORAGE_KEY);
}

function getNativePushAppId(clientConfig: ClientConfig): string {
  const appId = clientConfig.pushNotificationDetails?.nativePushAppID;
  if (!appId) {
    throw new Error('Native push requires pushNotificationDetails.nativePushAppID in config.json.');
  }
  return appId;
}

function getWebPushAppId(clientConfig: ClientConfig): string {
  const appId = clientConfig.pushNotificationDetails?.webPushAppID;
  if (!appId) {
    throw new Error('WebPush push requires pushNotificationDetails.webPushAppID in config.json.');
  }
  return appId;
}

function getPushGatewayUrl(clientConfig: ClientConfig): string {
  const pushGatewayUrl = clientConfig.pushNotificationDetails?.pushNotifyUrl;
  if (!pushGatewayUrl) {
    throw new Error('Native push requires pushNotificationDetails.pushNotifyUrl in config.json.');
  }
  return pushGatewayUrl;
}

export async function isNativePushPermissionGranted(): Promise<boolean | null> {
  const api = await getNativePushNotificationsApi();
  return api.isPermissionGranted();
}

export async function requestNativePushPermission(): Promise<NotificationPermission> {
  const api = await getNativePushNotificationsApi();
  return api.requestPermission();
}

export async function ensureNativePushRegistered(
  vapid?: string
): Promise<NativePushRegistrationResult> {
  const permission = (await isNativePushPermissionGranted())
    ? 'granted'
    : await requestNativePushPermission();

  if (permission !== 'granted') {
    return {
      permission,
      token: null,
    };
  }

  const api = await getNativePushNotificationsApi();
  let registration;
  try {
    registration = await api.registerForPushNotifications(vapid);
  } catch (error) {
    throw new Error(describeNativePushRegistrationError(error), { cause: error });
  }

  if (!registration?.deviceToken) {
    throw new Error('Native push registration returned no device token.');
  }

  return {
    permission: 'granted',
    token: registration.deviceToken,
    p256dh: registration.p256dh,
    auth: registration.auth,
  };
}

export async function ensureNativePushUnregistered(): Promise<void> {
  const api = await getNativePushNotificationsApi();
  await api.unregisterForPushNotifications();
}

async function removeNativePushersForCurrentDevice(mx: MatrixClient, appId: string): Promise<void> {
  const deviceId = mx.getDeviceId() ?? '';
  if (!deviceId) {
    return;
  }

  const currentDevice = await mx.getDevice(deviceId);
  const deviceDisplayName = currentDevice?.display_name;
  if (!deviceDisplayName) {
    return;
  }

  const response = await mx.getPushers();
  const pushers = response.pushers ?? [];
  const currentDevicePushers = pushers.filter(
    (pusher) =>
      pusher.app_id === appId &&
      pusher.device_display_name === deviceDisplayName &&
      pusher.kind === 'http'
  );

  if (currentDevicePushers.length === 0) {
    return;
  }

  await Promise.allSettled(
    currentDevicePushers.map((pusher) =>
      mx.setPusher({
        kind: null,
        app_id: pusher.app_id,
        pushkey: pusher.pushkey,
      } as unknown as IPusherRequest)
    )
  );
}

export async function enableNativePush(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<string> {
  const vapid = clientConfig.pushNotificationDetails?.vapidPublicKey;
  const registration = await ensureNativePushRegistered(vapid);

  if (registration.permission !== 'granted' || !registration.token) {
    throw new Error(
      registration.permission === 'denied'
        ? 'Native push permission denied'
        : 'Native push permission dismissed'
    );
  }

  const pushGatewayUrl = getPushGatewayUrl(clientConfig);
  const deviceDisplayName =
    (await mx.getDevice(mx.getDeviceId() ?? ''))?.display_name ?? 'Mobile Device';

  if (registration.p256dh && registration.auth) {
    const appId = getWebPushAppId(clientConfig);
    await mx.setPusher({
      kind: 'http',
      app_id: appId,
      pushkey: registration.p256dh,
      app_display_name: 'Sable (Native Push)',
      device_display_name: deviceDisplayName,
      lang: navigator.language || 'en',
      data: {
        url: pushGatewayUrl,
        format: 'event_id_only',
        endpoint: registration.token,
        p256dh: registration.p256dh,
        auth: registration.auth,
      },
      append: false,
    } as unknown as IPusherRequest);

    storeNativePushRegistration(appId, registration.p256dh);
    return registration.p256dh;
  }

  const appId = getNativePushAppId(clientConfig);
  await mx.setPusher({
    kind: 'http',
    app_id: appId,
    pushkey: registration.token,
    app_display_name: 'Sable (Native Push)',
    device_display_name: deviceDisplayName,
    lang: navigator.language || 'en',
    data: {
      url: pushGatewayUrl,
      format: 'event_id_only',
    },
    append: false,
  } as unknown as IPusherRequest);

  storeNativePushRegistration(appId, registration.token);
  return registration.token;
}

export async function disableNativePush(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<void> {
  const stored = getStoredNativePushRegistration();
  if (stored) {
    await mx.setPusher({
      kind: null,
      app_id: stored.appId,
      pushkey: stored.pushkey,
    } as unknown as IPusherRequest);
  } else {
    const appIds = [
      clientConfig.pushNotificationDetails?.webPushAppID,
      clientConfig.pushNotificationDetails?.nativePushAppID,
    ].filter((appId): appId is string => Boolean(appId));
    await Promise.all(appIds.map((appId) => removeNativePushersForCurrentDevice(mx, appId)));
  }

  await ensureNativePushUnregistered();
  clearStoredNativePushRegistration();
}
