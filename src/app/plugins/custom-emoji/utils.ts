import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';

import { getAccountData, getStateEvent, getStateEvents } from '$utils/room';

import type { ImageUsage } from './types';
import { ImagePack } from './ImagePack';
import type { PackMetaReader } from './PackMetaReader';
import type { PackAddress } from './PackAddress';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { CustomStateEvent } from '$types/matrix/room';

export function packAddressEqual(a1?: PackAddress, a2?: PackAddress): boolean {
  if (!a1 && !a2) return true;
  if (!a1 || !a2) return false;
  return a1.roomId === a2.roomId && a1.stateKey === a2.stateKey;
}

export function imageUsageEqual(u1: ImageUsage[], u2: ImageUsage[]) {
  return u1.length === u2.length && u1.every((u) => u2.includes(u));
}

export function packMetaEqual(a: PackMetaReader, b: PackMetaReader): boolean {
  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.attribution === b.attribution &&
    imageUsageEqual(a.usage, b.usage)
  );
}

export function makeImagePacks(packEvents: MatrixEvent[]): ImagePack[] {
  return packEvents.reduce<ImagePack[]>((imagePacks, packEvent) => {
    const packId = packEvent.getId();
    if (!packId) return imagePacks;
    imagePacks.push(ImagePack.fromMatrixEvent(packId, packEvent));
    return imagePacks;
  }, []);
}

export function getRoomImagePack(room: Room, stateKey: string): ImagePack | undefined {
  const packEvent = getStateEvent(room, CustomStateEvent.PoniesRoomEmotes, stateKey);
  if (!packEvent) return undefined;
  const packId = packEvent.getId();
  if (!packId) return undefined;
  return ImagePack.fromMatrixEvent(packId, packEvent);
}

export function getRoomImagePacks(room: Room): ImagePack[] {
  const packEvents = getStateEvents(room, CustomStateEvent.PoniesRoomEmotes);
  return makeImagePacks(packEvents);
}

export function getGlobalImagePacks(mx: MatrixClient): ImagePack[] {
  const emoteRoomsContent = getAccountData(
    mx,
    CustomAccountDataEvent.PoniesEmoteRooms
  )?.getContent();
  if (typeof emoteRoomsContent !== 'object') return [];

  const { rooms: roomIdToPackInfo } = emoteRoomsContent;
  if (typeof roomIdToPackInfo !== 'object') return [];

  const roomIds = Object.keys(roomIdToPackInfo);

  const packs = roomIds.flatMap((roomId) => {
    if (typeof roomIdToPackInfo[roomId] !== 'object') return [];
    const room = mx.getRoom(roomId);
    if (!room) return [];
    const packStateKeyToUnknown = roomIdToPackInfo[roomId];
    const packEvents = getStateEvents(room, CustomStateEvent.PoniesRoomEmotes);
    const globalPackEvents = packEvents.filter((mE) => {
      const stateKey = mE.getStateKey();
      if (typeof stateKey === 'string') return !!packStateKeyToUnknown[stateKey];
      return false;
    });
    return makeImagePacks(globalPackEvents);
  });

  return packs;
}

export function getUserImagePack(mx: MatrixClient): ImagePack | undefined {
  const packEvent = getAccountData(mx, CustomAccountDataEvent.PoniesUserEmotes);
  const userId = mx.getUserId();
  if (!packEvent || !userId) {
    return undefined;
  }

  const userImagePack = ImagePack.fromMatrixEvent(userId, packEvent);
  return userImagePack;
}
