import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { SpaceProvider } from '$hooks/useSpace';
import { useCloseCreateSpaceModal, useCreateSpaceModalState } from '$state/hooks/createSpaceModal';
import type { CreateSpaceModalState } from '$state/createSpaceModal';
import { FormModal } from '$components/modal-overlay/FormModal';
import { CreateSpaceForm } from './CreateSpace';

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
      <FormModal title="New Space" requestClose={closeDialog}>
        <CreateSpaceForm space={space} onCreate={closeDialog} />
      </FormModal>
    </SpaceProvider>
  );
}

export function CreateSpaceModalRenderer() {
  const state = useCreateSpaceModalState();

  if (!state) return null;
  return <CreateSpaceModal state={state} />;
}
