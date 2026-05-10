import { lazy, Suspense, useRef } from 'react';
import { Menu, PopOut, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useCloseUserRoomProfile, useUserRoomProfileState } from '$state/hooks/userRoomProfile';
import type { UserRoomProfileState } from '$state/userRoomProfile';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { stopPropagation } from '$utils/keyboard';
import { SpaceProvider } from '$hooks/useSpace';
import { RoomProvider } from '$hooks/useRoom';

const UserRoomProfile = lazy(async () => {
  const mod = await import('./user-profile');
  return { default: mod.UserRoomProfile };
});

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { roomId, spaceId, userId, cords, position, initialProfile } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const close = useCloseUserRoomProfile();

  if (!room) return null;

  return (
    <PopOut
      anchor={cords}
      position={position ?? 'Top'}
      align={cords.y > window.innerHeight / 2 ? 'End' : 'Start'}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            fallbackFocus: () => menuRef.current ?? document.body,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu ref={menuRef} tabIndex={-1} style={{ width: toRem(340) }}>
            <SpaceProvider value={space ?? null}>
              <RoomProvider value={room}>
                <Suspense fallback={null}>
                  <UserRoomProfile userId={userId} initialProfile={initialProfile} />
                </Suspense>
              </RoomProvider>
            </SpaceProvider>
          </Menu>
        </FocusTrap>
      }
    />
  );
}

export function UserRoomProfileRenderer() {
  const state = useUserRoomProfileState();

  if (!state) return null;
  return <UserRoomProfileContextMenu state={state} />;
}
