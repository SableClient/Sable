import type { MatrixClient } from '$types/matrix-sdk';
import { EventType, MatrixEvent } from '$types/matrix-sdk';

const inFlight = new WeakMap<MatrixClient, Map<string, Promise<void>>>();

// Members whose state event could not be fetched (e.g. defunct bridge ghosts)
// are skipped for a while so virtualized-timeline remounts don't refetch them.
const FAILURE_TTL_MS = 5 * 60_000;
const MAX_CONCURRENT_REQUESTS = 4;
const failedAt = new WeakMap<MatrixClient, Map<string, number>>();
const activeRequests = new WeakMap<MatrixClient, number>();
const requestQueues = new WeakMap<MatrixClient, Array<() => void>>();

const scheduleRequest = <T>(mx: MatrixClient, task: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequests.set(mx, (activeRequests.get(mx) ?? 0) + 1);
      void task()
        .then(resolve, reject)
        .finally(() => {
          const active = Math.max(0, (activeRequests.get(mx) ?? 1) - 1);
          activeRequests.set(mx, active);
          const queue = requestQueues.get(mx);
          if (active < MAX_CONCURRENT_REQUESTS) queue?.shift()?.();
        });
    };

    if ((activeRequests.get(mx) ?? 0) < MAX_CONCURRENT_REQUESTS) {
      run();
      return;
    }

    const queue = requestQueues.get(mx) ?? [];
    requestQueues.set(mx, queue);
    queue.push(run);
  });

export const hydrateRoomMember = (
  mx: MatrixClient,
  roomId: string,
  userId: string
): Promise<void> => {
  const room = mx.getRoom(roomId);
  if (!room || room.getMember(userId)) return Promise.resolve();

  const key = `${roomId}\u0000${userId}`;
  const failedTs = failedAt.get(mx)?.get(key);
  if (failedTs !== undefined && Date.now() - failedTs < FAILURE_TTL_MS) return Promise.resolve();

  const pending = inFlight.get(mx) ?? new Map<string, Promise<void>>();
  inFlight.set(mx, pending);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = scheduleRequest(mx, async () => {
    // A request may have waited in the queue while another event supplied the
    // member state. Avoid issuing a redundant network request in that case.
    const requestRoom = mx.getRoom(roomId);
    if (!requestRoom || requestRoom.getMember(userId)) return;
    const content = await mx.getStateEvent(roomId, EventType.RoomMember, userId);
    const currentRoom = mx.getRoom(roomId);
    if (!currentRoom || currentRoom.getMember(userId)) return;
    currentRoom.currentState.setStateEvents([
      new MatrixEvent({
        type: EventType.RoomMember,
        state_key: userId,
        room_id: roomId,
        sender: userId,
        content,
      }),
    ]);
  })
    .then(() => {
      failedAt.get(mx)?.delete(key);
    })
    .catch(() => {
      const failures = failedAt.get(mx) ?? new Map<string, number>();
      failedAt.set(mx, failures);
      failures.set(key, Date.now());
    })
    .finally(() => pending.delete(key));

  pending.set(key, request);
  return request;
};

export const hydrateRoomMembers = (
  mx: MatrixClient,
  roomId: string,
  userIds: Iterable<string>
): Promise<void[]> =>
  Promise.all(
    [...new Set(userIds)]
      .filter((userId) => userId.startsWith('@'))
      .map((userId) => hydrateRoomMember(mx, roomId, userId))
  );
