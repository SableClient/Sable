import { useState } from 'react';
import { Box, Scroll } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import type { ImagePack } from '$plugins/custom-emoji';
import { ImagePackView } from '$components/image-pack-view';
import { RoomPacks } from './RoomPacks';

type EmojisStickersProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function EmojisStickers({ requestBack, requestClose }: EmojisStickersProps) {
  const [imagePack, setImagePack] = useState<ImagePack>();

  const handleImagePackViewClose = () => {
    setImagePack(undefined);
  };

  if (imagePack) {
    return <ImagePackView address={imagePack.address} requestClose={handleImagePackViewClose} />;
  }

  return (
    <SettingsSectionPage
      title="Emojis & Stickers"
      requestBack={requestBack}
      requestClose={requestClose}
    >
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <RoomPacks onViewPack={setImagePack} />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
