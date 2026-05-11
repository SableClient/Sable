import type { Room } from '$types/matrix-sdk';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useMatrixClient } from './useMatrixClient';

export const useAllJoinedRoomsSet = () => {
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);

  return allJoinedRooms;
};

export type GetRoomCallback = (roomId: string) => Room | undefined;
export const useGetRoom = (rooms: Set<string>): GetRoomCallback => {
  const mx = useMatrixClient();

  const getRoom: GetRoomCallback = useCallback(
    (rId: string) => {
      if (rooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, rooms]
  );

  return getRoom;
};
