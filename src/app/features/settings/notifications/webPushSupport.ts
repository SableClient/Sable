import type { IPusherRequest, MatrixClient } from '$types/matrix-sdk';
import { Method } from '$types/matrix-sdk';
import {
  MATRIX_STABLE_MSC4174_WEBPUSH_CAPABILITY_NAME,
  MATRIX_UNSTABLE_MSC4174_FEATURE_NAME,
  MATRIX_UNSTABLE_MSC4174_PUSHERS_ACK_PATH,
  MATRIX_UNSTABLE_MSC4174_WEBPUSH_CAPABILITY_NAME,
} from '$unstable/prefixes';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('webPushSupport');

export type WebPushServerSupport =
  | { supported: true; vapidPublicKey: string }
  | { supported: false };

type WebPushCapability = {
  enabled?: unknown;
  vapid?: unknown;
};

/**
 * MSC4174 support: advertised in /versions unstable features, VAPID key taken
 * from the m.webpush capability in /capabilities.
 */
export async function getWebPushServerSupport(mx: MatrixClient): Promise<WebPushServerSupport> {
  let versionsAdvertised = false;
  try {
    versionsAdvertised = await mx.doesServerSupportUnstableFeature(
      MATRIX_UNSTABLE_MSC4174_FEATURE_NAME
    );
  } catch {
    return { supported: false };
  }
  if (!versionsAdvertised) return { supported: false };

  try {
    const capabilities = await mx.getCapabilities();
    const capability = (capabilities?.[MATRIX_STABLE_MSC4174_WEBPUSH_CAPABILITY_NAME] ??
      capabilities?.[MATRIX_UNSTABLE_MSC4174_WEBPUSH_CAPABILITY_NAME]) as
      | WebPushCapability
      | undefined;

    if (
      capability?.enabled === true &&
      typeof capability.vapid === 'string' &&
      capability.vapid.trim()
    ) {
      return { supported: true, vapidPublicKey: capability.vapid };
    }

    debugLog.warn(
      'notification',
      'Server advertises MSC4174 in /versions but no usable m.webpush capability'
    );
  } catch {
    // fall through to unsupported
  }

  return { supported: false };
}

/** MSC4174 validation push: `{ app_id, ack_token }` and nothing else. */
export function isWebPushActivationPayload(
  data: unknown
): data is { app_id: string; ack_token: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.app_id === 'string' &&
    typeof d.ack_token === 'string' &&
    d.room_id === undefined &&
    d.event_id === undefined &&
    d.type === undefined &&
    typeof d.unread !== 'number'
  );
}

/** POSTs the ack_token received by validation push to activate the pusher. */
export async function acknowledgeWebPushPusher(
  mx: MatrixClient,
  appId: string,
  ackToken: string
): Promise<void> {
  await mx.http.authedRequest(
    Method.Post,
    MATRIX_UNSTABLE_MSC4174_PUSHERS_ACK_PATH,
    undefined,
    { app_id: appId, ack_token: ackToken },
    { prefix: '' }
  );
}

/** Removes this device's http gateway pushers to avoid duplicate pushes (MSC4174). */
export async function removeStaleHttpPushers(
  mx: MatrixClient,
  appId: string | undefined,
  deviceDisplayNames: string[]
): Promise<void> {
  if (!appId || deviceDisplayNames.length === 0) return;
  try {
    const response = await mx.getPushers();
    const stalePushers = (response.pushers ?? []).filter(
      (pusher) =>
        pusher.app_id === appId &&
        pusher.kind === 'http' &&
        deviceDisplayNames.includes(pusher.device_display_name)
    );
    await Promise.allSettled(
      stalePushers.map((pusher) =>
        mx.setPusher({
          kind: null,
          app_id: pusher.app_id,
          pushkey: pusher.pushkey,
        } as unknown as IPusherRequest)
      )
    );
  } catch {
    // best effort cleanup
  }
}
