import { Avatar, Box, Text } from 'folds';
import { userFallbackIcon } from '$components/icons/phosphor';
import type { MouseEventHandler } from 'react';
import { useAtomValue } from 'jotai';
import type { Room, CallMembership } from '$types/matrix-sdk';
import { NavButton, NavItem, NavItemContent } from '$components/nav';
import { UserAvatar } from '$components/user-avatar';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getMxIdLocalPart } from '$utils/matrix';
import { getAvatarUrl, getMemberAvatarMxc, getMemberDisplayName } from '$utils/room/display';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSpaceOptionally } from '$hooks/useSpace';
import { nicknamesAtom } from '$state/nicknames';
import classNames from 'classnames';
import * as css from './styles.css';

type RoomNavUserProps = {
  room: Room;
  callMembership: CallMembership;
  hideText?: boolean;
  activeSpeakers?: Set<string>;
};

export function RoomNavUser({ room, callMembership, hideText, activeSpeakers }: RoomNavUserProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();

  const userId = callMembership.sender ?? '';
  const avatarMxcUrl = getMemberAvatarMxc(room, userId);
  const avatarUrl = getAvatarUrl(mx, avatarMxcUrl, 32, useAuthentication);
  const nicknames = useAtomValue(nicknamesAtom);
  const name = getMemberDisplayName(room, userId, nicknames) ?? getMxIdLocalPart(userId);
  const isSpeaking = !!activeSpeakers?.has(userId);

  const handleNavUserClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    openProfile(
      room.roomId,
      space?.roomId,
      userId,
      undefined,
      evt.currentTarget.getBoundingClientRect()
    );
  };

  const ariaLabel = isSpeaking ? `Speaking: ${name}` : name;

  return (
    <NavItem variant="Background" radii="400">
      <NavButton onClick={handleNavUserClick} aria-label={ariaLabel}>
        <NavItemContent as="div" style={hideText ? { padding: '0' } : {}}>
          <Box direction="Column" grow="Yes" gap="200" justifyContent="Stretch">
            <Box alignItems="Center" gap="200" justifyContent={hideText ? 'Center' : 'Start'}>
              <Avatar size="200" className={classNames(isSpeaking && css.SpeakerAvatarRing)}>
                <UserAvatar
                  userId={userId}
                  src={avatarUrl ?? undefined}
                  alt={name}
                  renderFallback={() => userFallbackIcon('sm')}
                />
              </Avatar>
              {!hideText && (
                <Text as="span" size="B400" priority="300" truncate>
                  {name}
                </Text>
              )}
            </Box>
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}
