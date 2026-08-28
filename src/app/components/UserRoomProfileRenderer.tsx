import { Menu, toRem } from 'folds';
import { useCallback, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { userRoomProfileAtom } from '$state/userRoomProfile';
import type { UserRoomProfileState } from '$state/userRoomProfile';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { SpaceProvider } from '$hooks/useSpace';
import { RoomProvider } from '$hooks/useRoom';
import { UserRoomProfile } from './user-profile';
import { ResponsiveMenu } from './ResponsiveMenu';

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const { roomId, spaceId, userId, pmp, cords, position, initialProfile } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const [surfaceColor, setSurfaceColor] = useState<string | undefined>();
  const close = useSetAtom(userRoomProfileAtom);
  const requestClose = useCallback(() => {
    close((current) => (current === state ? undefined : current));
  }, [close, state]);

  if (!room) return null;

  return (
    <ResponsiveMenu
      anchor={cords}
      requestClose={requestClose}
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
                pmp={pmp}
                anchor={cords}
                position={position}
              />
            </RoomProvider>
          </SpaceProvider>
        </Menu>
      }
    />
  );
}

export function UserRoomProfileRenderer() {
  const state = useAtomValue(userRoomProfileAtom);

  if (!state) return null;
  return <UserRoomProfileContextMenu key={`${state.roomId}:${state.userId}`} state={state} />;
}
