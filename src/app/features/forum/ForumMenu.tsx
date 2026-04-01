import { forwardRef, useState } from 'react';
import { Box, Line, Menu, MenuItem, Text, config, toRem } from 'folds';
import type { Room } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { UseStateProvider } from '$components/UseStateProvider';
import { LeaveRoomPrompt } from '$components/leave-room-prompt';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useIsDirectRoom } from '$hooks/useRoom';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import type { IPowerLevels } from '$hooks/usePowerLevels';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { markAsRead } from '$utils/notifications';
import { copyToClipboard } from '$utils/dom';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '$utils/matrix';
import { getHomeRoomPath, getDirectRoomPath, getSpaceRoomPath } from '$pages/pathUtils';
import { getMatrixToRoom } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import {
  Checks,
  GearSix,
  Link,
  menuIcon,
  SignOut,
  Terminal,
  UserPlus,
} from '$components/icons/phosphor';

type ForumMenuProps = {
  room: Room;
  powerLevels: IPowerLevels;
  requestClose: () => void;
};
export const ForumMenu = forwardRef<HTMLDivElement, ForumMenuProps>(
  ({ room, powerLevels, requestClose }, ref) => {
    const mx = useMatrixClient();
    const [hideReads] = useSetting(settingsAtom, 'hideReads');
    const [developerTools] = useSetting(settingsAtom, 'developerTools');
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const openRoomSettings = useOpenRoomSettings();
    const navigate = useNavigate();
    const parentSpace = useSpaceOptionally();
    const isDirectRoom = useIsDirectRoom();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleMarkAsRead = () => {
      markAsRead(mx, room.roomId, hideReads);
      requestClose();
    };

    const handleCopyLink = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
      const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
      copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
      requestClose();
    };

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleRoomSettings = () => {
      openRoomSettings(room.roomId);
      requestClose();
    };

    const handleOpenTimeline = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
      if (parentSpace) {
        const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace.roomId);
        navigate(getSpaceRoomPath(spaceIdOrAlias, roomIdOrAlias));
      } else if (isDirectRoom) {
        navigate(getDirectRoomPath(roomIdOrAlias));
      } else {
        navigate(getHomeRoomPath(roomIdOrAlias));
      }
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem onClick={handleMarkAsRead} size="300" after={menuIcon(Checks)} radii="300">
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Mark as Read
            </Text>
          </MenuItem>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleInvite}
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
          <MenuItem onClick={handleCopyLink} size="300" after={menuIcon(Link)} radii="300">
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Copy Link
            </Text>
          </MenuItem>
          <MenuItem onClick={handleRoomSettings} size="300" after={menuIcon(GearSix)} radii="300">
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Room Settings
            </Text>
          </MenuItem>
          {developerTools && (
            <MenuItem
              onClick={handleOpenTimeline}
              size="300"
              after={menuIcon(Terminal)}
              radii="300"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                Event Timeline
              </Text>
            </MenuItem>
          )}
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <UseStateProvider initial={false}>
            {(promptLeave, setPromptLeave) => (
              <>
                <MenuItem
                  onClick={() => setPromptLeave(true)}
                  variant="Critical"
                  fill="None"
                  size="300"
                  after={menuIcon(SignOut)}
                  radii="300"
                  aria-pressed={promptLeave}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Leave Room
                  </Text>
                </MenuItem>
                {promptLeave && (
                  <LeaveRoomPrompt
                    roomId={room.roomId}
                    onDone={requestClose}
                    onCancel={() => setPromptLeave(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
        </Box>
      </Menu>
    );
  }
);
