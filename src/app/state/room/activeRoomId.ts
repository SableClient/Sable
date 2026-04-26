import { useEffect } from 'react';
import { atom, useSetAtom } from 'jotai';

/**
 * Tracks the currently-selected room ID on the active session.
 * Synced from each RoomProvider via {@link useActiveRoomIdSync} so that
 * components outside the router tree (e.g. BackgroundNotifications) can
 * read the active room without depending on route hooks.
 */
export const activeRoomIdAtom = atom<string | undefined>(undefined);

/** Keep {@link activeRoomIdAtom} in sync with the current route's room. */
export function useActiveRoomIdSync(roomId: string | undefined): void {
  const setActiveRoomId = useSetAtom(activeRoomIdAtom);
  useEffect(() => {
    setActiveRoomId(roomId);
    return () => setActiveRoomId(undefined);
  }, [roomId, setActiveRoomId]);
}
