import type { RoomToParents } from '$types/matrix/room';
import { hasRecursiveParent } from '$utils/room';

export const sortRoomsBySelectedSpace = (
  items: string[],
  selectedSpaceId: string | undefined,
  roomToParents: RoomToParents
): string[] => {
  if (!selectedSpaceId) return items;

  const inSelectedSpaceCache = new Map<string, number>();
  const getInSelectedSpaceScore = (roomId: string): number => {
    const cached = inSelectedSpaceCache.get(roomId);
    if (cached !== undefined) return cached;

    const score = hasRecursiveParent(roomToParents, roomId, selectedSpaceId) ? 1 : 0;
    inSelectedSpaceCache.set(roomId, score);
    return score;
  };

  return [...items].toSorted((a, b) => getInSelectedSpaceScore(b) - getInSelectedSpaceScore(a));
};
