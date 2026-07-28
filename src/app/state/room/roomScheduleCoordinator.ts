import { createKeyedQueue } from '$utils/keyedQueue';

/** Serializes delayed-event mutations for each room without blocking other rooms. */
export const roomScheduleCoordinator = { run: createKeyedQueue() };
