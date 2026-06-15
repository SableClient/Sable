import { MatrixEvent, type MatrixClient, type Room } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ImagePack, ImageUsage } from '$plugins/custom-emoji';
import {
  getGlobalImagePacks,
  getRoomImagePack,
  getRoomImagePacks,
  getUserImagePack,
  globalPacksScope,
  readCachedPack,
  readCachedPacks,
  roomPacksScope,
  userPackScope,
  writeCachedPack,
  writeCachedPacks,
} from '$plugins/custom-emoji';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useStateEventCallback } from './useStateEventCallback';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { CustomStateEvent } from '$types/matrix/room';
import { getSlidingSyncManager } from '$client/initMatrix';

const GLOBAL_PACK_ROOM_WAIT_MS = 3000;
const GLOBAL_PACK_ROOM_WAIT_INTERVAL_MS = 250;

const imagePackEqual = (a: ImagePack | undefined, b: ImagePack | undefined): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aImages = Array.from(a.images.collection.entries());
  const bImages = Array.from(b.images.collection.entries());
  if (aImages.length !== bImages.length) return false;
  const sameImages = aImages.every(([shortcode, image], index) => {
    const other = bImages[index];
    if (!other) return false;
    const [otherShortcode, otherImage] = other;
    if (shortcode !== otherShortcode) return false;
    return (
      image.url === otherImage.url &&
      image.body === otherImage.body &&
      JSON.stringify(image.usage) === JSON.stringify(otherImage.usage) &&
      JSON.stringify(image.info) === JSON.stringify(otherImage.info)
    );
  });
  if (!sameImages) return false;
  return (
    a.id === b.id &&
    a.deleted === b.deleted &&
    a.meta.name === b.meta.name &&
    a.meta.avatar === b.meta.avatar &&
    a.meta.attribution === b.meta.attribution &&
    JSON.stringify(a.meta.usage) === JSON.stringify(b.meta.usage)
  );
};

const imagePackListEqual = (a: ImagePack[], b: ImagePack[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((pack, index) => imagePackEqual(pack, b[index]));
};

const waitForRoom = async (mx: MatrixClient, roomId: string): Promise<Room | undefined> => {
  const existing = mx.getRoom(roomId);
  if (existing) return existing;

  return new Promise((resolve) => {
    const interval = window.setInterval(() => {
      const room = mx.getRoom(roomId);
      if (!room) return;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      resolve(room);
    }, GLOBAL_PACK_ROOM_WAIT_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      resolve(undefined);
    }, GLOBAL_PACK_ROOM_WAIT_MS);
  });
};

const loadGlobalImagePackState = async (mx: MatrixClient): Promise<boolean> => {
  const emoteRoomsContent = mx
    .getAccountData(CustomAccountDataEvent.PoniesEmoteRooms)
    ?.getContent();
  if (typeof emoteRoomsContent !== 'object') return false;
  const roomIdToPackInfo = emoteRoomsContent.rooms;
  if (!roomIdToPackInfo || typeof roomIdToPackInfo !== 'object') return false;

  let loaded = false;
  const requests = Object.entries(roomIdToPackInfo).flatMap(([roomId, packStateKeyToUnknown]) => {
    if (!packStateKeyToUnknown || typeof packStateKeyToUnknown !== 'object') return [];
    return Object.keys(packStateKeyToUnknown).map(async (stateKey) => {
      let room: Room | null | undefined = mx.getRoom(roomId);
      if (!room) {
        getSlidingSyncManager(mx)?.subscribeToRoom(roomId);
        room = await waitForRoom(mx, roomId);
      }
      if (!room) return;
      if (getRoomImagePack(room, stateKey)) return;
      const content = await mx.getStateEvent(roomId, CustomStateEvent.PoniesRoomEmotes, stateKey);
      const event = new MatrixEvent({
        content,
        event_id: `$sable-image-pack-${roomId}-${stateKey}`,
        origin_server_ts: Date.now(),
        room_id: roomId,
        sender: mx.getUserId() ?? '',
        state_key: stateKey,
        type: CustomStateEvent.PoniesRoomEmotes,
      });
      room.currentState.setStateEvents([event]);
      loaded = true;
    });
  });

  await Promise.allSettled(requests);
  return loaded;
};

export const useUserImagePack = (): ImagePack | undefined => {
  const mx = useMatrixClient();
  // Seed from cache during initial state when live data is not available yet.
  const [userPack, setUserPack] = useState<ImagePack | undefined>(() => {
    const livePack = getUserImagePack(mx);
    if (livePack) return livePack;
    const userId = mx.getUserId();
    if (!userId) return undefined;
    return readCachedPack(userId, userPackScope()) ?? undefined;
  });

  useEffect(() => {
    const userId = mx.getUserId();
    if (userId) writeCachedPack(userId, userPackScope(), userPack);
  }, [mx, userPack]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === (CustomAccountDataEvent.PoniesUserEmotes as string)) {
          setUserPack((prev) => {
            const next = getUserImagePack(mx);
            return imagePackEqual(prev, next) ? prev : next;
          });
        }
      },
      [mx]
    )
  );

  return userPack;
};

export const useGlobalImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const loadingGlobalPacksRef = useRef(false);
  // Seed from cache during initial state when live data is not available yet.
  const [globalPacks, setGlobalPacks] = useState<ImagePack[]>(() => {
    const livePacks = getGlobalImagePacks(mx);
    if (livePacks.length > 0) return livePacks;
    const userId = mx.getUserId();
    if (!userId) return livePacks;
    const cachedPacks = readCachedPacks(userId, globalPacksScope());
    return cachedPacks.length > 0 ? cachedPacks : livePacks;
  });

  useEffect(() => {
    const userId = mx.getUserId();
    if (userId) writeCachedPacks(userId, globalPacksScope(), globalPacks);
  }, [mx, globalPacks]);

  useEffect(() => {
    if (globalPacks.length > 0 || loadingGlobalPacksRef.current) return undefined;
    loadingGlobalPacksRef.current = true;
    let cancelled = false;
    loadGlobalImagePackState(mx)
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setGlobalPacks((prev) => {
          const next = getGlobalImagePacks(mx);
          return imagePackListEqual(prev, next) ? prev : next;
        });
      })
      .finally(() => {
        loadingGlobalPacksRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [mx, globalPacks.length]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === (CustomAccountDataEvent.PoniesEmoteRooms as string)) {
          setGlobalPacks((prev) => {
            const next = getGlobalImagePacks(mx);
            return imagePackListEqual(prev, next) ? prev : next;
          });
        }
      },
      [mx]
    )
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        const eventType = mEvent.getType();
        const roomId = mEvent.getRoomId();
        const stateKey = mEvent.getStateKey();
        if (
          eventType === (CustomStateEvent.PoniesRoomEmotes as string) &&
          roomId &&
          typeof stateKey === 'string'
        ) {
          setGlobalPacks((prev) => {
            const global = !!prev.find(
              (pack) =>
                pack.address && pack.address.roomId === roomId && pack.address.stateKey === stateKey
            );
            if (!global) return prev;
            const next = getGlobalImagePacks(mx);
            return imagePackListEqual(prev, next) ? prev : next;
          });
        }
      },
      [mx]
    )
  );

  return globalPacks;
};

export const useRoomImagePack = (room: Room, stateKey: string): ImagePack | undefined => {
  const mx = useMatrixClient();
  // Seed from cache during initial state when live data is not available yet.
  const [roomPack, setRoomPack] = useState<ImagePack | undefined>(() => {
    const livePack = getRoomImagePack(room, stateKey);
    if (livePack) return livePack;
    const userId = mx.getUserId();
    if (!userId) return undefined;
    return readCachedPacks(userId, roomPacksScope(room.roomId)).find(
      (pack) => pack.address?.stateKey === stateKey
    );
  });

  useEffect(() => {
    const userId = mx.getUserId();
    if (!userId) return;
    // Persist all packs for this room whenever this single-pack state changes
    const scope = roomPacksScope(room.roomId);
    writeCachedPack(userId, scope, roomPack);
  }, [mx, room.roomId, roomPack]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === (CustomStateEvent.PoniesRoomEmotes as string) &&
          mEvent.getStateKey() === stateKey
        ) {
          setRoomPack((prev) => {
            const next = getRoomImagePack(room, stateKey);
            return imagePackEqual(prev, next) ? prev : next;
          });
        }
      },
      [room, stateKey]
    )
  );

  return roomPack;
};

export const useRoomImagePacks = (room: Room): ImagePack[] => {
  const mx = useMatrixClient();
  // Seed from cache during initial state when live data is not available yet.
  const [roomPacks, setRoomPacks] = useState<ImagePack[]>(() => {
    const livePacks = getRoomImagePacks(room);
    if (livePacks.length > 0) return livePacks;
    const userId = mx.getUserId();
    if (!userId) return livePacks;
    const cachedPacks = readCachedPacks(userId, roomPacksScope(room.roomId));
    return cachedPacks.length > 0 ? cachedPacks : livePacks;
  });

  useEffect(() => {
    const userId = mx.getUserId();
    if (userId) writeCachedPacks(userId, roomPacksScope(room.roomId), roomPacks);
  }, [mx, room.roomId, roomPacks]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === (CustomStateEvent.PoniesRoomEmotes as string)
        ) {
          setRoomPacks((prev) => {
            const next = getRoomImagePacks(room);
            return imagePackListEqual(prev, next) ? prev : next;
          });
        }
      },
      [room]
    )
  );

  return roomPacks;
};

export const useRoomsImagePacks = (rooms: Room[]) => {
  const mx = useMatrixClient();
  // Seed from cache during initial state when live data is not available yet.
  const [roomPacks, setRoomPacks] = useState<ImagePack[]>(() => {
    const livePacks = rooms.flatMap(getRoomImagePacks);
    if (livePacks.length > 0) return livePacks;
    const userId = mx.getUserId();
    if (!userId) return livePacks;
    const cachedPacks = rooms.flatMap((room) => {
      const roomLivePacks = getRoomImagePacks(room);
      if (roomLivePacks.length > 0) return roomLivePacks;
      return readCachedPacks(userId, roomPacksScope(room.roomId));
    });
    return cachedPacks.length > 0 ? cachedPacks : livePacks;
  });

  useEffect(() => {
    const userId = mx.getUserId();
    if (!userId) return;
    // Persist per-room — group packs by roomId and write each bucket
    const byRoom = new Map<string, ImagePack[]>();
    roomPacks.forEach((pack) => {
      if (!pack.address) return;
      const bucket = byRoom.get(pack.address.roomId) ?? [];
      bucket.push(pack);
      byRoom.set(pack.address.roomId, bucket);
    });
    byRoom.forEach((packs, roomId) => {
      writeCachedPacks(userId, roomPacksScope(roomId), packs);
    });
  }, [mx, roomPacks]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          rooms.find((room) => room.roomId === mEvent.getRoomId()) &&
          mEvent.getType() === (CustomStateEvent.PoniesRoomEmotes as string)
        ) {
          setRoomPacks((prev) => {
            const next = rooms.flatMap(getRoomImagePacks);
            return imagePackListEqual(prev, next) ? prev : next;
          });
        }
      },
      [rooms]
    )
  );

  return roomPacks;
};

export const useRelevantImagePacks = (usage: ImageUsage, rooms: Room[]): ImagePack[] => {
  const userPack = useUserImagePack();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(() => {
    const packs = userPack ? [userPack] : [];
    const globalPackIds = new Set(globalPacks.map((pack) => pack.id));

    const relPacks = packs.concat(
      globalPacks,
      roomsPacks.filter((pack) => !globalPackIds.has(pack.id))
    );

    return relPacks.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, globalPacks, roomsPacks, usage]);

  return relevantPacks;
};
