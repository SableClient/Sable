import type { Room } from '$types/matrix-sdk';
import { ConcurrencyQueue } from './concurrencyQueue';

/**
 * Shared concurrency-limited room member loader.
 * Caps concurrent /_matrix/client/v3/rooms/{roomId}/members requests to avoid
 * the N+1 API Call performance issue (CHARM-1C) where every rendered room item
 * fires its own /members request simultaneously on page load.
 */

const memberQueue = new ConcurrencyQueue(3);
const loadedRoomIds = new Set<string>();
const inflightPromises = new Map<string, Promise<void>>();

/**
 * Load room members at most once per room, with concurrency limiting.
 * Safe to call from multiple hooks/components simultaneously — duplicate
 * calls for the same room share a single in-flight promise, and completed
 * rooms are never re-fetched.
 */
export async function loadRoomMembersOnce(room: Room): Promise<void> {
  const { roomId } = room;
  if (loadedRoomIds.has(roomId)) return;

  let promise = inflightPromises.get(roomId);
  if (!promise) {
    promise = memberQueue
      .add(() => room.loadMembersIfNeeded())
      .then(() => {
        loadedRoomIds.add(roomId);
      })
      .finally(() => {
        inflightPromises.delete(roomId);
      });
    inflightPromises.set(roomId, promise);
  }

  await promise;
}

/**
 * Check whether members for a room have already been loaded.
 */
export function isRoomMembersLoaded(roomId: string): boolean {
  return loadedRoomIds.has(roomId);
}

/**
 * Mark a room's members as loaded (e.g. after a direct loadMembersIfNeeded call).
 */
export function markRoomMembersLoaded(roomId: string): void {
  loadedRoomIds.add(roomId);
}
