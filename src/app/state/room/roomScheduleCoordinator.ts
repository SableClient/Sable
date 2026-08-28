import { createKeyedQueue } from '$utils/keyedQueue';
import type { MatrixClient } from '$types/matrix-sdk';

const runQueued = createKeyedQueue();

/** Serializes delayed-event mutations per account and room. */
export const roomScheduleCoordinator = {
  run<T>(
    mx: Pick<MatrixClient, 'getSafeUserId'>,
    roomId: string,
    operation: () => T | PromiseLike<T>
  ): Promise<T> {
    return runQueued(`${mx.getSafeUserId()}\0${roomId}`, operation);
  },
};
