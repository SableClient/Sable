import type { MatrixClient } from '$types/matrix-sdk';

export type SortFunc<T> = (a: T, b: T) => number;

const getRoomActivity = (mx: MatrixClient, roomId: string): number => {
  const room = mx.getRoom(roomId);
  if (!room) return Number.MIN_SAFE_INTEGER;
  const timelineTimestamp = room.getLastActiveTimestamp();
  return timelineTimestamp === Number.MIN_SAFE_INTEGER
    ? (room.getBumpStamp() ?? Number.MIN_SAFE_INTEGER)
    : timelineTimestamp;
};

export const factoryRoomIdByActivity =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) => {
    return getRoomActivity(mx, b) - getRoomActivity(mx, a);
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
  if (a > b) {
    return 1;
  }
  return 0;
};
