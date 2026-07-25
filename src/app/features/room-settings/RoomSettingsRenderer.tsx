import { useRef } from 'react';
import { Modal } from 'folds';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { useCloseRoomSettings, useRoomSettingsState } from '$state/hooks/roomSettings';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import type { RoomSettingsState } from '$state/roomSettings';
import { RoomProvider } from '$hooks/useRoom';
import { SpaceProvider } from '$hooks/useSpace';
import { RoomSettings } from './RoomSettings';

type RenderSettingsProps = {
  state: RoomSettingsState;
};
function RenderSettings({ state }: RenderSettingsProps) {
  const { roomId, spaceId, page } = state;
  const closeSettings = useCloseRoomSettings();
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId && spaceId !== roomId ? getRoom(spaceId) : undefined;
  const modalRef = useRef<HTMLDivElement | null>(null);

  if (!room) return null;

  return (
    <ModalOverlay requestClose={closeSettings} mobile="fullscreen" contentRef={modalRef}>
      <Modal ref={modalRef} tabIndex={-1} size="500" variant="Background">
        <SpaceProvider value={space ?? null}>
          <RoomProvider value={room}>
            <RoomSettings initialPage={page} requestClose={closeSettings} />
          </RoomProvider>
        </SpaceProvider>
      </Modal>
    </ModalOverlay>
  );
}

export function RoomSettingsRenderer() {
  const state = useRoomSettingsState();

  if (!state) return null;
  return <RenderSettings state={state} />;
}
