import { getGlobalImagePacks, getRoomImagePacks } from '$plugins/custom-emoji/utils';
import type { ImagePack } from '$plugins/custom-emoji/ImagePack';
import type { MSC4459ImagePackReference } from '$types/matrix/common';
import { SerializableMap } from '$types/wrapper/SerializableMap';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import type { ImageUsage } from '$plugins/custom-emoji';
import { SerializableSet } from '$types/wrapper/SerializableSet';
import { getViaServers } from '$plugins/via-servers';
import { getMxIdServer } from './mxIdHelper';
import { isRoomPrivate } from './roomVisibility';

/**
 * lookup table for global mxc => MSC4459ImagePackReference
 * TODO this is far from a perfect solution
 */
const globalLookupTable = new Map<string, MSC4459ImagePackReference>();
/**
 * lookup table for room local mxc => MSC4459ImagePackReference
 * TODO this is far from a perfect solution
 */
const roomLookupTable = new Map<string, Map<string, MSC4459ImagePackReference>>();

export function getImagePackReferencesForMxcWrappedInMap(
  mxcUrl: string,
  matrixClient: MatrixClient,
  imageUsage: ImageUsage,
  room: Room
): SerializableMap<string, MSC4459ImagePackReference> {
  const retMap = new SerializableMap<string, MSC4459ImagePackReference>();
  if (!mxcUrl.startsWith('mxc')) return retMap;
  const result = getImagePackReferencesForMxc(mxcUrl, matrixClient, imageUsage, room);
  // if the result is undefined return the empty map, to not produce invalid entries
  if (!result?.room_id || !result?.state_key || !result?.shortcode) return retMap;
  retMap.set(mxcUrl, result);
  return retMap;
}

function getImagePackReferencesForMxcInternal(
  mxcUrl: string,
  matrixClient: MatrixClient,
  packs: ImagePack[],
  imageUsage: ImageUsage,
  bypassPrivateFilter = false
) {
  return packs
    .filter((val) => val.getImages(imageUsage).find((img) => img.url === mxcUrl))
    .map((pack) => {
      const img = pack.getImages(imageUsage).find((val) => val.url === mxcUrl);
      const room = matrixClient.getRoom(pack.address?.roomId);
      if (!room || (isRoomPrivate(matrixClient, room) && !bypassPrivateFilter)) return undefined;
      const viaServers = new SerializableSet<string>();
      if (room)
        getViaServers(room).forEach((via) => {
          viaServers.add(via);
        });
      // add ones own hs as via server, as that server evidently is alive
      const ownViaHS = getMxIdServer(matrixClient.getSafeUserId());
      if (ownViaHS) viaServers.add(ownViaHS);
      return {
        room_id: pack.address?.roomId,
        state_key: pack.address?.stateKey,
        via: viaServers,
        shortcode: img?.shortcode,
      } satisfies MSC4459ImagePackReference;
    })
    .find((val) => val != undefined);
}

export function getImagePackReferencesForMxc(
  mxcUrl: string,
  matrixClient: MatrixClient,
  imageUsage: ImageUsage,
  room: Room
): MSC4459ImagePackReference {
  if (!mxcUrl.startsWith('mxc')) return {};
  if (roomLookupTable.get(room.roomId)?.has(mxcUrl))
    return roomLookupTable.get(room.roomId)!.get(mxcUrl)!;
  const roomLocalImgPacks: ImagePack[] = getRoomImagePacks(room);
  const roomLocalMatch = getImagePackReferencesForMxcInternal(
    mxcUrl,
    matrixClient,
    roomLocalImgPacks,
    imageUsage,
    true
  );
  if (roomLocalMatch) {
    const roomLookupTabRes =
      roomLookupTable.get(room.roomId) ?? new Map<string, MSC4459ImagePackReference>();
    roomLookupTabRes.set(mxcUrl, roomLocalMatch);
    roomLookupTable.set(room.roomId, roomLookupTabRes);
  }
  // prefer room local match as they're probably often more relevant
  if (roomLocalMatch?.room_id && roomLocalMatch?.shortcode) return roomLocalMatch;
  // simple caching
  if (globalLookupTable.has(mxcUrl)) return globalLookupTable.get(mxcUrl)!;
  const globalImgPacks: ImagePack[] = getGlobalImagePacks(matrixClient);
  const globalMatch = getImagePackReferencesForMxcInternal(
    mxcUrl,
    matrixClient,
    globalImgPacks,
    imageUsage,
    false
  );
  if (globalMatch?.room_id && globalMatch?.shortcode) {
    globalLookupTable.set(mxcUrl, globalMatch);
    return globalMatch;
  }

  return {};
}
