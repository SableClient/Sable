import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { SpaceProvider } from '$hooks/useSpace';
import { useCloseCreateRoomModal, useCreateRoomModalState } from '$state/hooks/createRoomModal';
import type { CreateRoomModalState } from '$state/createRoomModal';
import { FormModal } from '$components/modal-overlay/FormModal';
import { CreateRoomType } from '$components/create-room/types';
import { CreateRoomForm } from './CreateRoom';

type CreateRoomModalProps = {
  state: CreateRoomModalState;
};
function CreateRoomModal({ state }: CreateRoomModalProps) {
  const { spaceId, type } = state;
  const closeDialog = useCloseCreateRoomModal();

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  return (
    <SpaceProvider value={space ?? null}>
      <FormModal
        title={type === CreateRoomType.VoiceRoom ? 'New Voice Room' : 'New Chat Room'}
        requestClose={closeDialog}
      >
        <CreateRoomForm space={space} onCreate={closeDialog} defaultType={type} />
      </FormModal>
    </SpaceProvider>
  );
}

export function CreateRoomModalRenderer() {
  const state = useCreateRoomModalState();

  if (!state) return null;
  return <CreateRoomModal state={state} />;
}
