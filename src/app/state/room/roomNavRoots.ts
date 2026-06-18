import { getLocalStorageItem, setLocalStorageItem } from '$state/utils/atomWithLocalStorage';

const ROOM_NAV_ROOTS_KEY = 'roomNavRoots';

const getStoreKey = (userId: string): string => `${ROOM_NAV_ROOTS_KEY}${userId}`;

type RoomNavRootsRecord = Record<string, string>;

export const getRoomNavRoots = (userId: string): RoomNavRootsRecord =>
  getLocalStorageItem<RoomNavRootsRecord>(getStoreKey(userId), {});

export const getStoredRoomNavRoot = (userId: string, roomId: string): string | undefined =>
  getRoomNavRoots(userId)[roomId];

export const setStoredRoomNavRoot = (userId: string, roomId: string, rootSpaceId: string): void => {
  const existing = getRoomNavRoots(userId);
  setLocalStorageItem(getStoreKey(userId), {
    ...existing,
    [roomId]: rootSpaceId,
  });
};
