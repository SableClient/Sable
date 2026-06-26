import type { Room } from '$types/matrix-sdk';
import { ConcurrencyQueue } from './concurrencyQueue';

// Background preloads (e.g. room-list avatars) share this queue to cap concurrent /members requests.
const memberQueue = new ConcurrencyQueue(3);
const loadedRoomIds = new Set<string>();
const inflightPromises = new Map<string, Promise<void>>();
// Rooms whose inflight promise was created by a foreground call (direct, not queued).
const foregroundInflight = new Set<string>();

/**
 * Load room members at most once per room.
 *
 * Pass `{ foreground: true }` for user-visible loads (active room, member panel,
 * mention autocomplete) — these bypass the concurrency queue so a large backlog
 * of background avatar preloads cannot delay them.
 *
 * Safe to call from multiple hooks simultaneously: duplicate calls for the same
 * room share a single in-flight promise, and completed rooms are never re-fetched.
 */
export async function loadRoomMembersOnce(
  room: Room,
  options?: { foreground?: boolean }
): Promise<void> {
  const { roomId } = room;
  if (loadedRoomIds.has(roomId)) return;

  if (options?.foreground) {
    // Reuse an existing foreground promise to deduplicate concurrent foreground callers.
    // If the cached promise is a background one (not in foregroundInflight), replace it
    // with a direct call so it doesn't block behind the queue.
    // The displaced background callback becomes a no-op when it eventually runs.
    if (!inflightPromises.has(roomId) || !foregroundInflight.has(roomId)) {
      const p: Promise<void> = room
        .loadMembersIfNeeded()
        .then(() => {
          loadedRoomIds.add(roomId);
        })
        .finally(() => {
          foregroundInflight.delete(roomId);
          if (inflightPromises.get(roomId) === p) inflightPromises.delete(roomId);
        });
      inflightPromises.set(roomId, p);
      foregroundInflight.add(roomId);
    }
    await inflightPromises.get(roomId)!;
    return;
  }

  // Background path: only enqueue if nothing is already inflight for this room.
  if (!inflightPromises.has(roomId)) {
    const p: Promise<void> = memberQueue
      .add(() => room.loadMembersIfNeeded())
      .then(() => {
        loadedRoomIds.add(roomId);
      })
      .finally(() => {
        if (inflightPromises.get(roomId) === p) inflightPromises.delete(roomId);
      });
    inflightPromises.set(roomId, p);
  }
  await inflightPromises.get(roomId)!;
}

export function isRoomMembersLoaded(roomId: string): boolean {
  return loadedRoomIds.has(roomId);
}

export function markRoomMembersLoaded(roomId: string): void {
  loadedRoomIds.add(roomId);
}
