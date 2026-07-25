import { forwardRef } from 'react';
import { Box, Text, Menu, MenuItem, toRem, config, Line, Spinner } from 'folds';
import type { Room } from '$types/matrix-sdk';

import {
  Checks,
  ClockCounterClockwise,
  GearSix,
  Link,
  menuIcon,
  SignOut,
  UserPlus,
} from '$components/icons/phosphor';
import { UseStateProvider } from '$components/UseStateProvider';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { DirectInvitePrompt } from '$components/direct-invite-prompt';
import {
  getRoomNotificationMode,
  roomNotificationModeIcon,
  useRoomsNotificationPreferencesContext,
} from '$hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '$components/RoomNotificationSwitcher';
import { AsyncStatus } from '$hooks/useAsyncCallback';
import { JumpToTime } from './jump-to-time';
import { useRoomMenuActions } from '$hooks/useRoomMenuActions';

type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
};

const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(({ room, requestClose }, ref) => {
  const {
    handleMarkAsRead,
    handleInvite,
    handleCopyLink,
    handleOpenSettings,
    handleLeaveRoom,
    canInvite,
    unread,
    invitePrompt,
    setInvitePrompt,
    directInvitePrompt,
    setDirectInvitePrompt,
    handleInviteDirect,
    handleConvertAndInvite,
    convertState,
    navigateRoom,
  } = useRoomMenuActions(room);

  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);

  const wrappedClose = (reason: string) => () => {
    if (reason === 'invite') setInvitePrompt(false);
    if (reason === 'directInvite') setDirectInvitePrompt(false);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(200) }}>
      {invitePrompt && <InviteUserPrompt room={room} requestClose={wrappedClose('invite')} />}
      {directInvitePrompt && (
        <DirectInvitePrompt
          onCancel={wrappedClose('directInvite')}
          onInviteDirect={handleInviteDirect}
          onConvertAndInvite={handleConvertAndInvite}
          converting={convertState.status === AsyncStatus.Loading}
          convertError={
            convertState.status === AsyncStatus.Error ? convertState.error.message : undefined
          }
        />
      )}
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={() => {
            handleMarkAsRead();
            requestClose();
          }}
          size="300"
          after={menuIcon(Checks)}
          radii="300"
          disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Mark as Read
          </Text>
        </MenuItem>
        <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
          {(handleOpen, opened, changing) => (
            <MenuItem
              size="300"
              after={
                changing ? (
                  <Spinner size="100" variant="Secondary" />
                ) : (
                  roomNotificationModeIcon(notificationMode)
                )
              }
              radii="300"
              aria-pressed={opened}
              onClick={handleOpen}
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                Notifications
              </Text>
            </MenuItem>
          )}
        </RoomNotificationModeSwitcher>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={() => {
            handleInvite();
          }}
          variant="Primary"
          fill="None"
          size="300"
          after={menuIcon(UserPlus)}
          radii="300"
          aria-pressed={invitePrompt}
          disabled={!canInvite}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Invite
          </Text>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleCopyLink();
            requestClose();
          }}
          size="300"
          after={menuIcon(Link)}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Copy Link
          </Text>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleOpenSettings();
            requestClose();
          }}
          size="300"
          after={menuIcon(GearSix)}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Room Settings
          </Text>
        </MenuItem>
        <UseStateProvider initial={false}>
          {(promptJump, setPromptJump) => (
            <>
              <MenuItem
                onClick={() => setPromptJump(true)}
                size="300"
                after={menuIcon(ClockCounterClockwise)}
                radii="300"
                aria-pressed={promptJump}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Jump to Time
                </Text>
              </MenuItem>
              {promptJump && (
                <JumpToTime
                  onSubmit={(eventId) => {
                    setPromptJump(false);
                    navigateRoom(room.roomId, eventId);
                    requestClose();
                  }}
                  onCancel={() => setPromptJump(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={async () => {
            await handleLeaveRoom();
            requestClose();
          }}
          variant="Critical"
          fill="None"
          size="300"
          after={menuIcon(SignOut)}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Leave Room
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
});
RoomMenu.displayName = 'RoomMenu';

export { RoomMenu };
