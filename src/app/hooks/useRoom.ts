import type { Room } from '$types/matrix-sdk';
import { createContext, useContext } from 'react';

const RoomContext = createContext<Room | null>(null);

export const RoomProvider = RoomContext.Provider;

export function useRoom(): Room {
  const room = useContext(RoomContext);
  if (!room) throw new Error('Room not provided!');
  return room;
}

const IsDirectRoomContext = createContext(false);

export const IsDirectRoomProvider = IsDirectRoomContext.Provider;

export const useIsDirectRoom = () => {
  const direct = useContext(IsDirectRoomContext);

  return direct;
};
