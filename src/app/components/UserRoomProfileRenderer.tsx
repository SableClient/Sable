import { Box, IconButton, Menu, PopOut, Text, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useCloseUserRoomProfile, useUserRoomProfileState } from '$state/hooks/userRoomProfile';
import type { UserRoomProfileState } from '$state/userRoomProfile';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { stopPropagation } from '$utils/keyboard';
import { SpaceProvider } from '$hooks/useSpace';
import { RoomProvider } from '$hooks/useRoom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { isPhoneLayoutDevice } from '$utils/user-agent';
import { composerIcon, X } from '$components/icons/phosphor';
import { Modal500 } from './Modal500';
import { UserRoomProfile } from './user-profile';

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const { roomId, spaceId, userId, cords, position, initialProfile } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile || isPhoneLayoutDevice();

  const close = useCloseUserRoomProfile();

  if (!room) return null;

  if (isMobile) {
    return (
      <Modal500 requestClose={close} fullScreenOnMobile>
        <SpaceProvider value={space ?? null}>
          <RoomProvider value={room}>
            <Box
              direction="Column"
              style={{
                height: '100%',
                minHeight: 0,
              }}
            >
              <Box
                shrink="No"
                alignItems="Center"
                justifyContent="SpaceBetween"
                style={{
                  padding: '12px 12px 8px',
                }}
              >
                <Text size="H4" truncate>
                  Member Profile
                </Text>
                <IconButton onClick={close} variant="Background">
                  {composerIcon(X)}
                </IconButton>
              </Box>
              <Box
                grow="Yes"
                direction="Column"
                style={{
                  minHeight: 0,
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehaviorY: 'contain',
                }}
              >
                <UserRoomProfile userId={userId} initialProfile={initialProfile} />
              </Box>
            </Box>
          </RoomProvider>
        </SpaceProvider>
      </Modal500>
    );
  }

  return (
    <PopOut
      anchor={cords}
      position={position ?? 'Top'}
      align={cords.y > window.innerHeight / 2 ? 'End' : 'Start'}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ width: toRem(340) }}>
            <SpaceProvider value={space ?? null}>
              <RoomProvider value={room}>
                <UserRoomProfile userId={userId} initialProfile={initialProfile} />
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
