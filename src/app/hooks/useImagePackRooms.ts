import type { Room } from '$types/matrix-sdk';
import { useMemo } from 'react';
import { getAllParents } from '$utils/room';
import { useMatrixClient } from './useMatrixClient';

export const useImagePackRooms = (
  roomId: string,
  roomToParents: Map<string, Set<string>>
): Room[] => {
  const mx = useMatrixClient();

  const imagePackRooms: Room[] = useMemo(() => {
    const allParentSpaces = [roomId].concat(Array.from(getAllParents(roomToParents, roomId)));
    return allParentSpaces.reduce<Room[]>((list, rId) => {
      const r = mx.getRoom(rId);
      if (r) list.push(r);
      return list;
    }, []);
  }, [mx, roomId, roomToParents]);

  return imagePackRooms;
};
