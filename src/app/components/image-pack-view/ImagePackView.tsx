import { Box, IconButton, Text, Scroll, Chip } from 'folds';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { PackAddress } from '$plugins/custom-emoji';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { Page, PageHeader, PageContent } from '$components/page';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { RoomImagePack } from './RoomImagePack';
import { UserImagePack } from './UserImagePack';

type ImagePackViewProps = {
  address: PackAddress | undefined;
  requestClose: () => void;
};
export function ImagePackView({ address, requestClose }: ImagePackViewProps) {
  const mx = useMatrixClient();
  const room = address && mx.getRoom(address.roomId);

  return (
    <Page>
      <PageHeader outlined={false} balance>
        <Box alignItems="Center" grow="Yes" gap="200">
          <Box alignItems="Inherit" grow="Yes" gap="200">
            <Chip
              size="500"
              radii="Pill"
              onClick={requestClose}
              before={<PhosphorIcon size="100" as={ArrowLeftIcon} />}
            >
              <Text size="T300">Emojis & Stickers</Text>
            </Chip>
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
            {room && address ? (
              <RoomImagePack room={room} stateKey={address.stateKey} />
            ) : (
              <UserImagePack />
            )}
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
