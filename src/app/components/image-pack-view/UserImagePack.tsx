import { useCallback, useMemo } from 'react';
import type { PackContent } from '$plugins/custom-emoji';
import { ImagePack } from '$plugins/custom-emoji';
import { useMatrixClient } from '$hooks/useMatrixClient';

import { useUserImagePack } from '$hooks/useImagePacks';
import { ImagePackContent } from './ImagePackContent';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export function UserImagePack() {
  const mx = useMatrixClient();

  const defaultPack = useMemo(() => new ImagePack(mx.getUserId() ?? '', {}, undefined), [mx]);
  const imagePack = useUserImagePack();

  const handleUpdate = useCallback(
    async (packContent: PackContent) => {
      await mx.setAccountData(CustomAccountDataEvent.PoniesUserEmotes, packContent);
    },
    [mx]
  );

  return <ImagePackContent imagePack={imagePack ?? defaultPack} canEdit onUpdate={handleUpdate} />;
}
