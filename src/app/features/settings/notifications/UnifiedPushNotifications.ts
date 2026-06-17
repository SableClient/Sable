import type { IPusherRequest, MatrixClient } from '$types/matrix-sdk';
import { fetch } from '$utils/fetch';
import {
  getUnifiedPushDistributor,
  getUnifiedPushDistributors,
  registerUnifiedPushTransport,
  saveUnifiedPushDistributor,
  type UnifiedPushRegistrationResult,
  unregisterUnifiedPushTransport,
} from './UnifiedPushTransport';
import type { PushTransportConfig } from './NotificationTransport';
import { getTauriNotificationsApi } from './TauriNotificationsApiClient';

export { getUnifiedPushDistributors, getUnifiedPushDistributor, saveUnifiedPushDistributor };

const UP_PUBLIC_GATEWAY = 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify';
export const DEFAULT_UNIFIED_PUSH_APP_ID = 'moe.sable.up';

async function probeGatewayCandidate(candidate: string): Promise<string | undefined> {
  try {
    const probeUrl = new URL(candidate);
    probeUrl.pathname = '/_matrix/push/v1/notify';
    probeUrl.search = '';
    const res = await fetch(probeUrl.toString());
    if (!res.ok) return undefined;

    const body = await res.json();
    if (
      body?.gateway === 'matrix' ||
      (body?.unifiedpush && body.unifiedpush.gateway === 'matrix')
    ) {
      return probeUrl.toString();
    }
  } catch {
    // Probe failed (network error, invalid URL, etc)
  }
  return undefined;
}

/**
 * Probes the UP endpoint for a Matrix-compatible push gateway.
 * Falls back to the configured or public UP gateway.
 * Note: pushNotifyUrl (Sygnal) is NOT suitable — only a proper UP gateway works.
 */
async function discoverGateway(
  upEndpoint: string,
  unifiedPushGateway?: string,
  upInstance?: string
): Promise<string> {
  const probeCandidates = [upInstance, upEndpoint].filter(
    (candidate): candidate is string => !!candidate?.trim()
  );

  const probeAtIndex = async (index: number): Promise<string | undefined> => {
    if (index >= probeCandidates.length) return undefined;

    const candidate = probeCandidates[index];
    if (!candidate) return undefined;
    const result = await probeGatewayCandidate(candidate);
    if (result) return result;

    return probeAtIndex(index + 1);
  };

  const discoveredGateway = await probeAtIndex(0);
  return discoveredGateway ?? unifiedPushGateway ?? UP_PUBLIC_GATEWAY;
}

const UP_REGISTER_TIMEOUT_MS = 30_000;

export type UnifiedPushTransportConfigInput = Pick<
  PushTransportConfig,
  'unifiedPushGatewayUrl' | 'unifiedPushAppID'
>;

type UnifiedPushPusherConfig = {
  appId: string;
  gatewayUrl?: string;
};

function trimConfigValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function resolveUnifiedPushPusherConfig(
  config?: UnifiedPushTransportConfigInput
): UnifiedPushPusherConfig {
  return {
    appId: trimConfigValue(config?.unifiedPushAppID) ?? DEFAULT_UNIFIED_PUSH_APP_ID,
    gatewayUrl: trimConfigValue(config?.unifiedPushGatewayUrl),
  };
}

export type EnableUnifiedPushResult =
  | {
      status: 'registered';
      endpoint: string;
      instance: string;
      gatewayUrl: string;
      distributor: string;
      pubKeySet?: {
        pubKey: string;
        auth: string;
      };
    }
  | Exclude<UnifiedPushRegistrationResult, { status: 'registered' }>;

async function registerUnifiedPushWithTimeout(): Promise<UnifiedPushRegistrationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('UnifiedPush registration timed out'));
    }, UP_REGISTER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([registerUnifiedPushTransport(), timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function tryEnableUnifiedPush(
  mx: MatrixClient,
  config?: UnifiedPushTransportConfigInput
): Promise<EnableUnifiedPushResult> {
  const notificationsApi = await getTauriNotificationsApi();

  await notificationsApi.createChannel({
    id: 'messages',
    name: 'Messages',
    description: 'Matrix message and invite notifications',
    importance: notificationsApi.Importance.Default,
    vibration: true,
  });

  const registration = await registerUnifiedPushWithTimeout();

  if (registration.status !== 'registered') {
    return registration;
  }

  const { endpoint, instance, pubKeySet } = registration;
  const resolvedConfig = resolveUnifiedPushPusherConfig(config);
  const gatewayUrl = await discoverGateway(endpoint, resolvedConfig.gatewayUrl, instance);

  const pusherData: Record<string, string> = {
    url: gatewayUrl,
  };

  // VAPID-capable distributors (e.g. NextPush) provide keys for RFC 8291 encryption.
  if (pubKeySet) {
    pusherData.p256dh = pubKeySet.pubKey;
    pusherData.auth = pubKeySet.auth;
  }

  const pusher: Parameters<MatrixClient['setPusher']>[0] = {
    kind: 'http',
    app_id: resolvedConfig.appId,
    pushkey: endpoint,
    app_display_name: 'Charm (UnifiedPush)',
    device_display_name:
      (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Android Device',
    lang: navigator.language || 'en',
    data: pusherData,
    append: false,
  };
  await mx.setPusher(pusher);

  return {
    status: 'registered',
    endpoint,
    instance,
    gatewayUrl,
    distributor: registration.distributor,
    pubKeySet,
  };
}

export async function enableUnifiedPush(
  mx: MatrixClient,
  config?: UnifiedPushTransportConfigInput
): Promise<{ endpoint: string; instance: string; gatewayUrl: string }> {
  const result = await tryEnableUnifiedPush(mx, config);
  if (result.status !== 'registered') {
    throw new Error(result.error ?? 'UnifiedPush registration failed');
  }

  return {
    endpoint: result.endpoint,
    instance: result.instance,
    gatewayUrl: result.gatewayUrl,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getCurrentDeviceUnifiedPushPushkeys(
  mx: MatrixClient,
  appId: string
): Promise<string[]> {
  const deviceId = mx.getDeviceId() ?? '';
  if (!deviceId) {
    return [];
  }

  const currentDevice = await mx.getDevice(deviceId);
  const deviceDisplayName = currentDevice?.display_name;
  if (!deviceDisplayName) {
    return [];
  }

  const response = await mx.getPushers();
  const pushers = response.pushers ?? [];
  return pushers
    .filter(
      (pusher) =>
        pusher.app_id === appId &&
        pusher.device_display_name === deviceDisplayName &&
        pusher.kind === 'http' &&
        isNonEmptyString(pusher.pushkey)
    )
    .map((pusher) => pusher.pushkey);
}

async function getUnifiedPushCleanupPushkeys(
  mx: MatrixClient,
  appId: string,
  pushkey?: string
): Promise<string[]> {
  const pushkeys = new Set<string>();

  if (isNonEmptyString(pushkey)) {
    pushkeys.add(pushkey);
  }

  const currentDevicePushkeys = await getCurrentDeviceUnifiedPushPushkeys(mx, appId);
  currentDevicePushkeys.forEach((candidate) => pushkeys.add(candidate));

  return Array.from(pushkeys);
}

export type DisableUnifiedPushOptions = {
  config?: UnifiedPushTransportConfigInput;
  pushkey?: string;
};

export async function disableUnifiedPush(
  mx: MatrixClient,
  options: DisableUnifiedPushOptions = {}
): Promise<void> {
  const { appId } = resolveUnifiedPushPusherConfig(options.config);
  const pushkeys = await getUnifiedPushCleanupPushkeys(mx, appId, options.pushkey);

  await Promise.allSettled(
    pushkeys.map((pushkey) =>
      mx.setPusher({
        kind: null,
        app_id: appId,
        pushkey,
      } as unknown as IPusherRequest)
    )
  );

  await unregisterUnifiedPushTransport();
}

export function listenForUnifiedPushEndpointChanges(
  onEndpointChanged: (endpoint: string, instance: string) => void
) {
  return getTauriNotificationsApi().then((notificationsApi) =>
    notificationsApi.onUnifiedPushEndpoint(({ endpoint, instance }) => {
      onEndpointChanged(endpoint, instance);
    })
  );
}
