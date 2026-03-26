import { IPusherRequest, MatrixClient } from '$types/matrix-sdk';
import { ClientConfig } from '$hooks/useClientConfig';
import { getNativePushNotificationsApi } from './NativePushNotificationsApiClient';

const NATIVE_PUSH_TOKEN_STORAGE_KEY = 'nativePushToken';

export type NativePushRegistrationResult =
  | {
      permission: 'granted';
      token: string;
    }
  | {
      permission: 'default' | 'denied';
      token: null;
    };

export type { NativePushNotificationsApi } from './NativePushNotificationsApiClient';

function storeNativePushToken(token: string): void {
  localStorage.setItem(NATIVE_PUSH_TOKEN_STORAGE_KEY, token);
}

function getStoredNativePushToken(): string | null {
  return localStorage.getItem(NATIVE_PUSH_TOKEN_STORAGE_KEY);
}

function clearStoredNativePushToken(): void {
  localStorage.removeItem(NATIVE_PUSH_TOKEN_STORAGE_KEY);
}

function getNativePushAppId(clientConfig: ClientConfig): string {
  const appId = clientConfig.pushNotificationDetails?.nativePushAppID;
  if (!appId) {
    throw new Error('Native push requires pushNotificationDetails.nativePushAppID in config.json.');
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

export async function isNativePushPermissionGranted(): Promise<boolean> {
  const api = await getNativePushNotificationsApi();
  return api.isPermissionGranted();
}

export async function requestNativePushPermission(): Promise<NotificationPermission> {
  const api = await getNativePushNotificationsApi();
  return api.requestPermission();
}

export async function ensureNativePushRegistered(): Promise<NativePushRegistrationResult> {
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
  const token = await api.registerForPushNotifications();
  return {
    permission: 'granted',
    token,
  };
}

export async function ensureNativePushUnregistered(): Promise<void> {
  const api = await getNativePushNotificationsApi();
  await api.unregisterForPushNotifications();
}

async function getCurrentNativePushToken(): Promise<string | null> {
  const storedToken = getStoredNativePushToken();
  if (storedToken) {
    return storedToken;
  }

  if (!(await isNativePushPermissionGranted())) {
    return null;
  }

  try {
    const api = await getNativePushNotificationsApi();
    const token = await api.registerForPushNotifications();
    if (!token) {
      return null;
    }

    storeNativePushToken(token);
    return token;
  } catch {
    return null;
  }
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
  const registration = await ensureNativePushRegistered();

  if (registration.permission !== 'granted' || !registration.token) {
    throw new Error(
      registration.permission === 'denied'
        ? 'Native push permission denied'
        : 'Native push permission dismissed'
    );
  }

  const appId = getNativePushAppId(clientConfig);
  const pushGatewayUrl = getPushGatewayUrl(clientConfig);

  await mx.setPusher({
    kind: 'http',
    app_id: appId,
    pushkey: registration.token,
    app_display_name: 'Sable (Native Push)',
    device_display_name:
      (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Mobile Device',
    lang: navigator.language || 'en',
    data: {
      url: pushGatewayUrl,
      format: 'event_id_only',
    },
    append: false,
  } as unknown as IPusherRequest);

  storeNativePushToken(registration.token);
  return registration.token;
}

export async function disableNativePush(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<void> {
  const appId = clientConfig.pushNotificationDetails?.nativePushAppID;
  if (appId) {
    const token = await getCurrentNativePushToken();

    if (token) {
      await mx.setPusher({
        kind: null,
        app_id: appId,
        pushkey: token,
      } as unknown as IPusherRequest);
    } else {
      await removeNativePushersForCurrentDevice(mx, appId);
    }
  }

  await ensureNativePushUnregistered();
  clearStoredNativePushToken();
}
