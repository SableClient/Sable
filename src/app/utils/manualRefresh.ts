import type { MatrixClient } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';

export type ManualRefreshResult = {
  classicRetried: boolean;
  usedSlidingSyncReset: boolean;
};

export function triggerManualRefresh(mx: MatrixClient): ManualRefreshResult {
  const classicRetried = mx.retryImmediately();
  const slidingSyncManager = getSlidingSyncManager(mx);
  slidingSyncManager?.scheduleForceReset();

  return {
    classicRetried,
    usedSlidingSyncReset: !!slidingSyncManager,
  };
}
