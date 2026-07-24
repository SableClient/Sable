import type { Room } from '$types/matrix-sdk';
import { createContext, useContext } from 'react';

const RoomContext = createContext<Room | null>(null);

export const RoomProvider = RoomContext.Provider;

export function useRoom(): Room {
  const room = useContext(RoomContext);
  if (!room) throw new Error('Room not provided!');
  return room;
}

export function useRoomOptionally(): Room | null {
  return useContext(RoomContext);
}

const IsDirectRoomContext = createContext(false);

export const IsDirectRoomProvider = IsDirectRoomContext.Provider;

export const useIsDirectRoom = () => {
  const direct = useContext(IsDirectRoomContext);

  return direct;
};

const DisplayedEventIdContext = createContext<string | undefined>(undefined);

export const DisplayedEventIdProvider = DisplayedEventIdContext.Provider;

export const useDisplayedEventId = () => useContext(DisplayedEventIdContext);

const IsInactivePanelContext = createContext(false);

export const IsInactivePanelProvider = IsInactivePanelContext.Provider;

/** True when the room is mounted behind the list panel. Gates auto-mark-as-read and read receipts. */
export const useIsInactivePanel = () => useContext(IsInactivePanelContext);
