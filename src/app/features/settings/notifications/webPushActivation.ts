import type { MatrixClient } from '$types/matrix-sdk';
import { MATRIX_UNSTABLE_MSC4174_WEBPUSH_PUSHER_KIND } from '$unstable/prefixes';

/**
 * MSC4174 pushers start dormant: the homeserver sends one validation push carrying an
 * `ack_token` and delivers nothing else until the client acks it. The ack is handled in
 * the webview, so a validation push arriving while the app is closed is simply lost — and
 * the server never resends, leaving the pusher dormant for good.
 *
 * `activated` is how the server reports that state, so it is worth reading rather than
 * assuming registration succeeded.
 */
export type WebPushPusherState = 'activated' | 'dormant' | 'absent';

type PusherWithActivation = { kind?: string; app_id?: string; activated?: boolean };

export async function getWebPushPusherState(
  mx: MatrixClient,
  appId: string
): Promise<WebPushPusherState> {
  const response = await mx.getPushers();
  const pusher = (response.pushers ?? []).find(
    (candidate) =>
      (candidate as PusherWithActivation).kind === MATRIX_UNSTABLE_MSC4174_WEBPUSH_PUSHER_KIND &&
      candidate.app_id === appId
  ) as PusherWithActivation | undefined;

  if (!pusher) return 'absent';
  // Absent `activated` means a server that predates the field; treat it as working
  // rather than re-registering on every start.
  return pusher.activated === false ? 'dormant' : 'activated';
}

/**
 * Re-registers a dormant pusher so the homeserver issues a fresh validation push while
 * the app is demonstrably running to ack it. Returns whether it re-registered.
 */
export async function healDormantWebPushPusher(
  mx: MatrixClient,
  appId: string,
  reRegister: () => Promise<unknown>
): Promise<boolean> {
  if ((await getWebPushPusherState(mx, appId)) !== 'dormant') return false;

  await reRegister();
  return true;
}
