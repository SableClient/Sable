import type { MatrixClient } from '$types/matrix-sdk';

/** Names the crypto store a cold push must open; the native side has no session. */
export type PushAccount = {
  userId: string;
  deviceId: string;
};

export function pushAccount(mx: MatrixClient): PushAccount | undefined {
  const deviceId = mx.getDeviceId();
  if (!deviceId) return undefined;
  return { userId: mx.getSafeUserId(), deviceId };
}
