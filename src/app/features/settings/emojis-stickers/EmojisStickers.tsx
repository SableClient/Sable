import { useState } from 'react';
import { Box, Scroll } from 'folds';
import { PageContent } from '$components/page';
import { ImagePack } from '$plugins/custom-emoji';
import { ImagePackView } from '$components/image-pack-view';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { GlobalPacks } from './GlobalPacks';
import { UserPack } from './UserPack';

type EmojisStickersProps = {
  requestClose: () => void;
};
export function EmojisStickers({ requestClose }: EmojisStickersProps) {
  const [imagePack, setImagePack] = useState<ImagePack>();

  const handleImagePackViewClose = () => {
    setImagePack(undefined);
  };

  if (imagePack) {
    return <ImagePackView address={imagePack.address} requestClose={handleImagePackViewClose} />;
  }

  return (
    <SettingsSectionPage title="Emojis & Stickers" requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <UserPack onViewPack={setImagePack} />
              <GlobalPacks onViewPack={setImagePack} />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
