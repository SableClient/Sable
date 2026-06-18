import type { MatrixClient } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';

export type ManualRefreshResult = {
  classicRetried: boolean;
  usedSlidingSyncReset: boolean;
  completedBy:
    | 'sliding_request_finished'
    | 'sliding_timeout'
    | 'sliding_disposed'
    | 'classic_retry';
};

const MANUAL_REFRESH_SPIN_STYLE_ID = 'sable-manual-refresh-spin-style';
const MANUAL_REFRESH_SPIN_NAME = 'sable-manual-refresh-spin';
const CLASSIC_REFRESH_SETTLE_MS = 1500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

export const ensureManualRefreshSpinStyle = (): void => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MANUAL_REFRESH_SPIN_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = MANUAL_REFRESH_SPIN_STYLE_ID;
  style.textContent = `@keyframes ${MANUAL_REFRESH_SPIN_NAME} { to { transform: rotate(360deg); } }`;
  document.head.append(style);
};

export const getManualRefreshSpinStyle = (isRefreshing: boolean): { animation?: string } =>
  isRefreshing ? { animation: `${MANUAL_REFRESH_SPIN_NAME} 0.7s linear infinite` } : {};

export async function triggerManualRefresh(mx: MatrixClient): Promise<ManualRefreshResult> {
  const classicRetried = mx.retryImmediately();
  const slidingSyncManager = getSlidingSyncManager(mx);
  if (!slidingSyncManager) {
    await sleep(CLASSIC_REFRESH_SETTLE_MS);
    return {
      classicRetried,
      usedSlidingSyncReset: false,
      completedBy: 'classic_retry',
    };
  }

  slidingSyncManager.scheduleForceReset();
  const completion = await slidingSyncManager.waitForPendingForceReset();

  return {
    classicRetried,
    usedSlidingSyncReset: true,
    completedBy:
      completion === 'request_finished'
        ? 'sliding_request_finished'
        : completion === 'timeout'
          ? 'sliding_timeout'
          : 'sliding_disposed',
  };
}
