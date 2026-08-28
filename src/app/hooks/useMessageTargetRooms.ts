import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useAllJoinedRoomsSet, useGetRoom } from './useGetRoom';
import { factoryRoomIdByActivity } from '$utils/sort';
import { useMatrixClient } from './useMatrixClient';

/**
 * Returns a sorted list of room IDs that can receive a forwarded/shared message.
 * Excludes space rooms and rooms where the user cannot send messages.
 */
export function useMessageTargetRooms(): string[] {
  const mx = useMatrixClient();
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);

  return useMemo(
    () =>
      allRooms
        .filter((id) => {
          const target = getRoom(id);
          return !!target && !target.isSpaceRoom() && target.maySendMessage();
        })
        .sort(factoryRoomIdByActivity(mx)),
    [allRooms, getRoom, mx]
  );
}
