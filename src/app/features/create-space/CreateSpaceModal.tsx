import { Box, config, Header, IconButton, Modal, Scroll, Text } from 'folds';
import { composerIcon, X } from '$components/icons/phosphor';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { SpaceProvider } from '$hooks/useSpace';
import { useCloseCreateSpaceModal, useCreateSpaceModalState } from '$state/hooks/createSpaceModal';
import type { CreateSpaceModalState } from '$state/createSpaceModal';
import { CreateSpaceForm } from './CreateSpace';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

type CreateSpaceModalProps = {
  state: CreateSpaceModalState;
};
function CreateSpaceModal({ state }: CreateSpaceModalProps) {
  const { spaceId } = state;
  const closeDialog = useCloseCreateSpaceModal();

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  return (
    <SpaceProvider value={space ?? null}>
      <ModalOverlay requestClose={closeDialog}>
        <Modal size="300" flexHeight>
          <Box direction="Column">
            <Header
              size="500"
              style={{
                padding: config.space.S200,
                paddingLeft: config.space.S400,
                borderBottomWidth: config.borderWidth.B300,
              }}
            >
              <Box grow="Yes">
                <Text size="H4">New Space</Text>
              </Box>
              <Box shrink="No">
                <IconButton size="300" radii="300" onClick={closeDialog}>
                  {composerIcon(X)}
                </IconButton>
              </Box>
            </Header>
            <Scroll size="300" hideTrack>
              <Box
                style={{
                  padding: config.space.S400,
                  paddingRight: config.space.S200,
                }}
                direction="Column"
                gap="500"
              >
                <CreateSpaceForm space={space} onCreate={closeDialog} />
              </Box>
            </Scroll>
          </Box>
        </Modal>
      </ModalOverlay>
    </SpaceProvider>
  );
}

export function CreateSpaceModalRenderer() {
  const state = useCreateSpaceModalState();

  if (!state) return null;
  return <CreateSpaceModal state={state} />;
}
