import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { isDMRoom } from '$utils/room/unread';
import type { Room } from '$types/matrix-sdk';
import type { RoomToUnread } from '$types/matrix/room';

export const countInboxNotifications = (
  rooms: readonly Room[],
  roomToUnread: RoomToUnread,
  mDirects: Set<string>
): number =>
  rooms.reduce((count, room) => {
    if (room.isSpaceRoom()) return count;
    const unread = roomToUnread.get(room.roomId);
    if (!unread) return count;
    return count + (isDMRoom(room, mDirects) ? unread.total : unread.highlight);
  }, 0);

export const useInboxNotificationCount = (): number => {
  const mx = useMatrixClient();
  const roomIds = useAtomValue(allRoomsAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const rooms = roomIds.flatMap((roomId) => mx.getRoom(roomId) ?? []);
  return countInboxNotifications(rooms, roomToUnread, mDirects);
};
