import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import type { RoomToUnread, Unread } from '$types/matrix/room';
import type { roomToUnreadAtom } from '$state/room/roomToUnread';
import { unreadEqual } from '$state/room/roomToUnread';

const compareUnreadEqual = (u1?: Unread, u2?: Unread): boolean => {
  if (!u1 || !u2) return false;
  return unreadEqual(u1, u2);
};

const getRoomsUnread = (rooms: string[], roomToUnread: RoomToUnread): Unread | undefined => {
  return rooms.reduce<Unread | undefined>((u, roomId) => {
    const roomUnread = roomToUnread.get(roomId);
    if (!roomUnread) return u;
    const newUnread: Unread = u ?? {
      total: 0,
      highlight: 0,
      from: new Set(),
    };
    newUnread.total += roomUnread.total;
    newUnread.highlight += roomUnread.highlight;
    newUnread.from?.add(roomId);
    return newUnread;
  }, undefined);
};

export const useRoomsUnread = (
  rooms: string[],
  roomToUnreadAtm: typeof roomToUnreadAtom
): Unread | undefined => {
  // Create a stable dependency key that changes only when room IDs actually change,
  // not when the array reference changes. This prevents stale closures and race conditions.
  const roomsKey = rooms.join('|');

  const selector = useCallback(
    (roomToUnread: RoomToUnread) => getRoomsUnread(rooms, roomToUnread),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomsKey]
  );
  return useAtomValue(selectAtom(roomToUnreadAtm, selector, compareUnreadEqual));
};

export const useRoomUnread = (
  roomId: string,
  roomToUnreadAtm: typeof roomToUnreadAtom
): Unread | undefined => {
  const selector = useCallback((roomToUnread: RoomToUnread) => roomToUnread.get(roomId), [roomId]);
  return useAtomValue(selectAtom(roomToUnreadAtm, selector, compareUnreadEqual));
};
