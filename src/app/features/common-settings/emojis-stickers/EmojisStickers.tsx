import { useState } from 'react';
import { Box, IconButton, Scroll, Text } from 'folds';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { Page, PageContent, PageHeader } from '$components/page';
import { ImagePack } from '$plugins/custom-emoji';
import { ImagePackView } from '$components/image-pack-view';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { RoomPacks } from './RoomPacks';

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
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Emojis & Stickers
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <PhosphorIcon as={XIcon} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <RoomPacks onViewPack={setImagePack} />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
