import type { MatrixClient } from '$types/matrix-sdk';
import type { RoomToUnread } from '$types/matrix/room';
import { isDMRoom } from './room';

export type SortFunc<T> = (a: T, b: T) => number;

export const factoryRoomIdByActivity =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) => {
    const room1 = mx.getRoom(a);
    const room2 = mx.getRoom(b);

    return (
      (room2?.getLastActiveTimestamp() ?? Number.MIN_SAFE_INTEGER) -
      (room1?.getLastActiveTimestamp() ?? Number.MIN_SAFE_INTEGER)
    );
  };

export const factoryRoomIdByAtoZ =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) => {
    let aName = mx.getRoom(a)?.name ?? '';
    let bName = mx.getRoom(b)?.name ?? '';

    // remove "#" from the room name
    // To ignore it in sorting
    aName = aName.replace(/#/g, '');
    bName = bName.replace(/#/g, '');

    if (aName.toLowerCase() < bName.toLowerCase()) {
      return -1;
    }
    if (aName.toLowerCase() > bName.toLowerCase()) {
      return 1;
    }
    return 0;
  };

export const factoryRoomIdByUnreadCount =
  (getUnreadCount: (roomId: string) => number): SortFunc<string> =>
  (a, b) => {
    const aT = getUnreadCount(a) ?? 0;
    const bT = getUnreadCount(b) ?? 0;
    return bT - aT;
  };

export const byTsOldToNew: SortFunc<number> = (a, b) => a - b;

export const byOrderKey: SortFunc<string | undefined> = (a, b) => {
  if (!a && !b) {
    return 0;
  }

  if (!b) return -1;
  if (!a) return 1;

  if (a < b) {
    return -1;
  }
  return 1;
};

/**
 * Sort rooms by priority: mentions/highlights > unreads > DMs > activity.
 * This provides a smarter prioritization for the room list sidebar.
 *
 * Priority tiers (highest to lowest):
 * 1. Rooms with mentions/highlights (highlight count > 0)
 * 2. Rooms with unreads but no highlights (total > 0, highlight = 0)
 * 3. Direct messages (from remaining rooms)
 * 4. All other rooms
 *
 * Within each tier, rooms are sorted by activity (most recent first).
 */
export const factoryRoomIdByPriority =
  (mx: MatrixClient, roomToUnread: RoomToUnread, mDirects?: Set<string>): SortFunc<string> =>
  (a, b) => {
    const room1 = mx.getRoom(a);
    const room2 = mx.getRoom(b);

    const unread1 = roomToUnread.get(a);
    const unread2 = roomToUnread.get(b);

    const highlight1 = unread1?.highlight ?? 0;
    const highlight2 = unread2?.highlight ?? 0;
    const total1 = unread1?.total ?? 0;
    const total2 = unread2?.total ?? 0;

    const isDM1 = room1 ? isDMRoom(room1, mDirects) : false;
    const isDM2 = room2 ? isDMRoom(room2, mDirects) : false;

    // Priority tier calculation:
    // 4 = has highlights (mentions)
    // 3 = has unreads but no highlights
    // 2 = is DM
    // 1 = everything else
    const getPriorityTier = (highlight: number, total: number, isDM: boolean): number => {
      if (highlight > 0) return 4;
      if (total > 0) return 3;
      if (isDM) return 2;
      return 1;
    };

    const tier1 = getPriorityTier(highlight1, total1, isDM1);
    const tier2 = getPriorityTier(highlight2, total2, isDM2);

    // Sort by tier first (higher tier = higher priority = comes first)
    if (tier1 !== tier2) {
      return tier2 - tier1;
    }

    // Within same tier, sort by activity (most recent first)
    return (
      (room2?.getLastActiveTimestamp() ?? Number.MIN_SAFE_INTEGER) -
      (room1?.getLastActiveTimestamp() ?? Number.MIN_SAFE_INTEGER)
    );
  };
