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
  const { roomId, spaceId, page, openedViaSwipe } = state;
  const closeSettings = useCloseRoomSettings();
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId && spaceId !== roomId ? getRoom(spaceId) : undefined;

  if (!room) return null;

  return (
    <ModalOverlay requestClose={closeSettings} mobile="fullscreen" size="500">
      <SpaceProvider value={space ?? null}>
        <RoomProvider value={room}>
          <RoomSettings
            initialPage={page}
            openedViaSwipe={openedViaSwipe}
            requestClose={closeSettings}
          />
        </RoomProvider>
      </SpaceProvider>
    </ModalOverlay>
  );
}

export function RoomSettingsRenderer() {
  const state = useRoomSettingsState();

  if (!state) return null;
  return <RenderSettings state={state} />;
}
