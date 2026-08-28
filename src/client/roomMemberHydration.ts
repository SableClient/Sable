import type { MatrixClient } from '$types/matrix-sdk';
import { EventType, KnownMembership, MatrixEvent } from '$types/matrix-sdk';

const inFlight = new WeakMap<MatrixClient, Map<string, Promise<void>>>();

// Members whose state event could not be fetched (e.g. defunct bridge ghosts)
// are skipped for a while so virtualized-timeline remounts don't refetch them.
const FAILURE_TTL_MS = 5 * 60_000;
const MAX_CONCURRENT_REQUESTS = 4;
const failedAt = new WeakMap<MatrixClient, Map<string, number>>();
const activeRequests = new WeakMap<MatrixClient, number>();
const requestQueues = new WeakMap<MatrixClient, Array<() => void>>();

const REFRESH_TTL_MS = 10 * 60_000;
const refreshedAt = new WeakMap<MatrixClient, Map<string, number>>();

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
  userId: string,
  force = false
): Promise<void> => {
  const room = mx.getRoom(roomId);
  if (!room) return Promise.resolve();
  if (!force && room.getMember(userId)) return Promise.resolve();

  const key = `${roomId}\u0000${userId}`;

  if (force) {
    const lastRefreshed = refreshedAt.get(mx)?.get(key);
    if (lastRefreshed !== undefined && Date.now() - lastRefreshed < REFRESH_TTL_MS)
      return Promise.resolve();
  }

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
    if (!requestRoom) return;
    if (!force && requestRoom.getMember(userId)) return;
    const content = await mx.getStateEvent(roomId, EventType.RoomMember, userId);
    const currentRoom = mx.getRoom(roomId);
    if (!currentRoom) return;
    if (!force && currentRoom.getMember(userId)) return;
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
      if (force) {
        const refreshMap = refreshedAt.get(mx) ?? new Map<string, number>();
        refreshedAt.set(mx, refreshMap);
        refreshMap.set(key, Date.now());
      }
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

// The SDK only fetches /members when the sync store holds no out-of-band member
// set for the room. Sliding sync sends $LAZY members, so a room whose stored set
// predates most joins keeps a short roster forever. Refill it from the server.
const BULK_TTL_MS = 5 * 60_000;
const bulkInFlight = new WeakMap<MatrixClient, Map<string, Promise<void>>>();
type BulkAttempt = { at: number; joinedCount: number };
const bulkAttempts = new WeakMap<MatrixClient, Map<string, BulkAttempt>>();

export const hydrateAllRoomMembers = (mx: MatrixClient, roomId: string): Promise<void> => {
  const room = mx.getRoom(roomId);
  if (!room) return Promise.resolve();
  const joinedCount = room.getJoinedMemberCount();
  if (room.getJoinedMembers().length >= joinedCount) return Promise.resolve();

  // An attempt made against a smaller joined count must not silence the refill.
  const attempt = bulkAttempts.get(mx)?.get(roomId);
  if (attempt && Date.now() - attempt.at < BULK_TTL_MS && joinedCount <= attempt.joinedCount)
    return Promise.resolve();

  const pending = bulkInFlight.get(mx) ?? new Map<string, Promise<void>>();
  bulkInFlight.set(mx, pending);
  const existing = pending.get(roomId);
  if (existing) return existing;

  const attempts = bulkAttempts.get(mx) ?? new Map<string, BulkAttempt>();
  bulkAttempts.set(mx, attempts);
  attempts.set(roomId, { at: Date.now(), joinedCount });

  const request = mx
    .members(roomId, undefined, KnownMembership.Leave)
    .then(({ chunk }) => {
      const currentRoom = mx.getRoom(roomId);
      if (!currentRoom || !chunk) return;
      // The response is current state, which may be ahead of our sync position,
      // so only fill in members we are missing rather than overwriting known ones.
      const missing = chunk.filter(
        (event) => event.state_key && !currentRoom.getMember(event.state_key)
      );
      if (missing.length === 0) return;
      currentRoom.currentState.setStateEvents(missing.map((event) => new MatrixEvent(event)));
    })
    .catch(() => undefined)
    .finally(() => pending.delete(roomId));

  pending.set(roomId, request);
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
