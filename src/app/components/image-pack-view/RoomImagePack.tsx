import { useCallback, useMemo } from 'react';
import type { Room } from '$types/matrix-sdk';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { PackContent } from '$plugins/custom-emoji';
import { ImagePack } from '$plugins/custom-emoji';

import { useRoomImagePack } from '$hooks/useImagePacks';
import { randomStr } from '$utils/common';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { ImagePackContent } from './ImagePackContent';
import { CustomStateEvent } from '$types/matrix/room';

type RoomImagePackProps = {
  room: Room;
  stateKey: string;
};

export function RoomImagePack({ room, stateKey }: RoomImagePackProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canEditImagePack = permissions.stateEvent(CustomStateEvent.PoniesRoomEmotes, userId);

  const fallbackPack = useMemo(() => {
    const fakePackId = randomStr(4);
    return new ImagePack(
      fakePackId,
      {},
      {
        roomId: room.roomId,
        stateKey,
      }
    );
  }, [room.roomId, stateKey]);
  const imagePack = useRoomImagePack(room, stateKey) ?? fallbackPack;

  const handleUpdate = useCallback(
    async (packContent: PackContent) => {
      const { address } = imagePack;
      if (!address) return;

      await mx.sendStateEvent(
        address.roomId,
        CustomStateEvent.PoniesRoomEmotes,
        packContent,
        address.stateKey
      );
    },
    [mx, imagePack]
  );

  return (
    <ImagePackContent imagePack={imagePack} canEdit={canEditImagePack} onUpdate={handleUpdate} />
  );
}
