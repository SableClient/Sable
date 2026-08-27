import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';

import { getAccountData, getStateEvent, getStateEvents } from '$utils/room/hierarchy';

import type { IImageInfo } from '$types/matrix/common';
import type { ImageUsage, PackContent } from './types';
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

export function getImagePackStateEventTypes(
  room: Room,
  stateKey: string
): Array<typeof CustomStateEvent.ImagePack | typeof CustomStateEvent.PoniesRoomEmotes> {
  const legacyContent = getStateEvent(
    room,
    CustomStateEvent.PoniesRoomEmotes,
    stateKey
  )?.getContent<PackContent>();
  return legacyContent && (legacyContent.pack !== undefined || legacyContent.images !== undefined)
    ? [CustomStateEvent.ImagePack, CustomStateEvent.PoniesRoomEmotes]
    : [CustomStateEvent.ImagePack];
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

function makeImagePacks(
  stableEvents: MatrixEvent[],
  legacyEvents: MatrixEvent[],
  includeStateKey: (stateKey: string) => boolean = () => true
): ImagePack[] {
  const legacyByKey = new Map<string, MatrixEvent>();
  const eventByKey = new Map<string, MatrixEvent>();
  legacyEvents.concat(stableEvents).forEach((event) => {
    const key = event.getStateKey();
    if (typeof key !== 'string' || !includeStateKey(key)) return;
    eventByKey.set(key, event);
    if (legacyEvents.includes(event)) legacyByKey.set(key, event);
  });

  return Array.from(eventByKey, ([key, event]) => {
    const id = event.getId();
    if (!id) return undefined;
    const legacyEvent = legacyByKey.get(key);
    return ImagePack.fromMatrixEvent(id, event, legacyEvent === event ? undefined : legacyEvent);
  }).filter((pack): pack is ImagePack => pack !== undefined);
}

export function getRoomImagePack(room: Room, stateKey: string): ImagePack | undefined {
  const stable = getStateEvent(room, CustomStateEvent.ImagePack, stateKey);
  const legacy = getStateEvent(room, CustomStateEvent.PoniesRoomEmotes, stateKey);
  return makeImagePacks(stable ? [stable] : [], legacy ? [legacy] : [])[0];
}

export function getRoomImagePacks(room: Room): ImagePack[] {
  return makeImagePacks(
    getStateEvents(room, CustomStateEvent.ImagePack),
    getStateEvents(room, CustomStateEvent.PoniesRoomEmotes)
  );
}

export function getGlobalImagePacks(mx: MatrixClient): ImagePack[] {
  const emoteRoomsContent =
    getAccountData(mx, CustomAccountDataEvent.ImagePackRooms)?.getContent() ||
    getAccountData(mx, CustomAccountDataEvent.PoniesEmoteRooms)?.getContent();

  if (typeof emoteRoomsContent !== 'object') return [];

  const { rooms: roomIdToPackInfo } = emoteRoomsContent;
  if (typeof roomIdToPackInfo !== 'object') return [];

  const roomIds = Object.keys(roomIdToPackInfo);

  const packs = roomIds.flatMap((roomId) => {
    if (typeof roomIdToPackInfo[roomId] !== 'object') return [];
    const room = mx.getRoom(roomId);
    if (!room) return [];
    const packStateKeyToUnknown = roomIdToPackInfo[roomId];

    return makeImagePacks(
      getStateEvents(room, CustomStateEvent.ImagePack),
      getStateEvents(room, CustomStateEvent.PoniesRoomEmotes),
      (stateKey) => !!packStateKeyToUnknown[stateKey]
    );
  });

  return packs;
}

export function getGlobalImagePackRoomIds(mx: MatrixClient): string[] {
  const emoteRoomsContent =
    getAccountData(mx, CustomAccountDataEvent.ImagePackRooms)?.getContent() ||
    getAccountData(mx, CustomAccountDataEvent.PoniesEmoteRooms)?.getContent();

  if (typeof emoteRoomsContent !== 'object' || !emoteRoomsContent) return [];
  const { rooms: roomIdToPackInfo } = emoteRoomsContent as { rooms?: unknown };
  if (typeof roomIdToPackInfo !== 'object' || !roomIdToPackInfo) return [];

  return Object.keys(roomIdToPackInfo);
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

/**
 * The info a pack declares for one of its images: dimensions, mimetype and size, so sending a pack
 * image never requires downloading it first.
 */
export function getPackImageInfo(
  mx: MatrixClient,
  room: Room,
  usage: ImageUsage,
  mxcUrl: string
): IImageInfo | undefined {
  const userPack = getUserImagePack(mx);
  const packs = [
    ...getRoomImagePacks(room),
    ...(userPack ? [userPack] : []),
    ...getGlobalImagePacks(mx),
  ];
  for (const pack of packs) {
    const info = pack.getImages(usage).find((image) => image.url === mxcUrl)?.info;
    if (info) return info;
  }
  return undefined;
}
