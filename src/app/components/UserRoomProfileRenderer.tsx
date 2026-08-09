import { Menu, toRem } from 'folds';
import { useState } from 'react';
import { useCloseUserRoomProfile, useUserRoomProfileState } from '$state/hooks/userRoomProfile';
import type { UserRoomProfileState } from '$state/userRoomProfile';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { SpaceProvider } from '$hooks/useSpace';
import { RoomProvider } from '$hooks/useRoom';
import { UserRoomProfile } from './user-profile';
import { ResponsiveMenu } from './ResponsiveMenu';

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const { roomId, spaceId, userId, cords, position, initialProfile } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const [surfaceColor, setSurfaceColor] = useState<string | undefined>();
  const close = useCloseUserRoomProfile();

  if (!room) return null;

  return (
    <ResponsiveMenu
      anchor={cords}
      requestClose={close}
      position={position ?? 'Top'}
      align={cords.y > window.innerHeight / 2 ? 'End' : 'Start'}
      returnFocusOnDeactivate
      surfaceColor={surfaceColor}
      overlayDragHandle
      menu={
        <Menu style={{ width: toRem(340) }}>
          <SpaceProvider value={space ?? null}>
            <RoomProvider value={room}>
              <UserRoomProfile
                userId={userId}
                initialProfile={initialProfile}
                onSurfaceColorChange={setSurfaceColor}
              />
            </RoomProvider>
          </SpaceProvider>
        </Menu>
      }
    />
  );
}

export function UserRoomProfileRenderer() {
  const state = useUserRoomProfileState();

  if (!state) return null;
  return <UserRoomProfileContextMenu key={`${state.roomId}:${state.userId}`} state={state} />;
}
