import { getGlobalImagePacks } from '$plugins/custom-emoji/utils';
import { ImagePack } from '$plugins/custom-emoji/ImagePack';
import { MSC4459ImagePackReference } from '$types/matrix/common';
import { SerializableMap } from '$types/wrapper/SerializableMap';
import { MatrixClient } from 'matrix-js-sdk';
import { ImageUsage } from '$plugins/custom-emoji';
import { SerializableSet } from '$types/wrapper/SerializableSet';
import { getViaServers } from '$plugins/via-servers';
import { getMxIdServer } from './mxIdHelper';

export function getImagePackReferencesForMxc(
  mxcUrl: string,
  matrixClient: MatrixClient,
  imageUsage: ImageUsage
): SerializableMap<string, MSC4459ImagePackReference> {
  const globalImgPacks: ImagePack[] = getGlobalImagePacks(matrixClient);
  if (!mxcUrl.startsWith('mxc')) return new SerializableMap<string, MSC4459ImagePackReference>();
  const imagePackReferences = new SerializableMap<string, MSC4459ImagePackReference>();
  globalImgPacks
    .filter((val) => val.getImages(imageUsage).find((img) => img.url === mxcUrl))
    .forEach((pack) => {
      const img = pack.getImages(imageUsage).find((val) => val.url === mxcUrl);
      const room = matrixClient.getRoom(pack.address?.roomId);
      const viaServers = new SerializableSet<string>();
      if (room)
        getViaServers(room).forEach((via) => {
          viaServers.add(via);
        });
      // add ones own hs as via server, as that server evidently is alive
      const ownViaHS = getMxIdServer(matrixClient.getSafeUserId());
      if (ownViaHS) viaServers.add(ownViaHS);
      const imgPkRef = {
        room_id: pack.address?.roomId,
        state_key: pack.address?.stateKey,
        via: viaServers,
        shortcode: img?.shortcode,
      } satisfies MSC4459ImagePackReference;
      imagePackReferences.set(mxcUrl, imgPkRef);
    });
  return imagePackReferences;
}
