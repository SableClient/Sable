import { atom } from 'jotai';

export type LastFocusedRooms = {
  home?: string;
  direct?: string;
  spaces: Record<string, string>;
};

const STORAGE_KEY = 'sable_last_focused_rooms';

export const readLastFocusedRoomsFromStorage = (): LastFocusedRooms => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { spaces: {} };
    const parsed = JSON.parse(raw) as Partial<LastFocusedRooms>;
    return { home: parsed.home, direct: parsed.direct, spaces: parsed.spaces ?? {} };
  } catch {
    return { spaces: {} };
  }
};

const writeLastFocusedRoomsToStorage = (value: LastFocusedRooms): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage quota exceeded or private browsing — silently ignore
  }
};

export const lastFocusedRoomsAtom = atom<LastFocusedRooms>(readLastFocusedRoomsFromStorage());

export const setLastFocusedRoomAtom = atom<
  null,
  [context: 'home' | 'direct' | { spaceId: string }, roomId: string | undefined],
  void
>(null, (get, set, context, roomId) => {
  const prev = get(lastFocusedRoomsAtom);
  let next: LastFocusedRooms;

  if (context === 'home') {
    next = { ...prev, home: roomId };
  } else if (context === 'direct') {
    next = { ...prev, direct: roomId };
  } else {
    const spaces = { ...prev.spaces };
    if (roomId === undefined) {
      delete spaces[context.spaceId];
    } else {
      spaces[context.spaceId] = roomId;
    }
    next = { ...prev, spaces };
  }

  set(lastFocusedRoomsAtom, next);
  writeLastFocusedRoomsToStorage(next);
});
