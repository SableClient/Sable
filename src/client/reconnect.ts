import type { MatrixClient } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';
import { getSlidingSyncManager } from './initMatrix';

const debugLog = createDebugLogger('reconnect');

const NUDGE_THROTTLE_MS = 3000;

const lastNudgeAt = new WeakMap<MatrixClient, number>();

export type NudgeReason = 'online' | 'visible' | 'resumed' | 'stalled' | 'retry';

/**
 * Sliding sync aborts the long-poll and re-requests with no backoff sleep. Classic returns
 * false unless the SDK already entered keepalive backoff, which a hung poll never reaches.
 */
export const nudgeReconnect = (
  mx: MatrixClient,
  reason: NudgeReason,
  opts?: { force?: boolean }
): boolean => {
  if (!mx.clientRunning) return false;

  const now = Date.now();
  const last = lastNudgeAt.get(mx);
  if (!opts?.force && last !== undefined && now - last < NUDGE_THROTTLE_MS) return false;
  lastNudgeAt.set(mx, now);

  const slidingSync = getSlidingSyncManager(mx)?.slidingSync;
  let nudged: boolean;
  if (slidingSync) {
    slidingSync.resend();
    nudged = true;
  } else {
    nudged = mx.retryImmediately();
  }

  debugLog.info('network', `Nudged sync transport (${reason})`, {
    reason,
    transport: slidingSync ? 'sliding' : 'classic',
    nudged,
  });
  return nudged;
};

type ClassicSyncApi = { abortController?: AbortController };

export const abortClassicSyncPoll = (mx: MatrixClient): boolean => {
  const syncApi = (mx as unknown as { syncApi?: ClassicSyncApi }).syncApi;
  if (!syncApi?.abortController) return false;

  syncApi.abortController.abort();
  syncApi.abortController = new AbortController();
  debugLog.warn('network', 'Aborted a wedged classic sync poll');
  return true;
};
