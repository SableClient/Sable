import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { lastFocusedRoomsAtom, setLastFocusedRoomAtom } from '$state/lastFocusedRooms';

export type LastFocusedContext = 'home' | 'direct' | { spaceId: string };

export const useLastFocusedRoom = (context: LastFocusedContext): string | undefined => {
  const lastFocusedRooms = useAtomValue(lastFocusedRoomsAtom);
  if (context === 'home') return lastFocusedRooms.home;
  if (context === 'direct') return lastFocusedRooms.direct;
  return lastFocusedRooms.spaces[context.spaceId];
};

export const useSetLastFocusedRoom = () => {
  const setLastFocusedRoom = useSetAtom(setLastFocusedRoomAtom);

  return useCallback(
    (context: LastFocusedContext, roomId: string | undefined) => {
      setLastFocusedRoom(context, roomId);
    },
    [setLastFocusedRoom]
  );
};
