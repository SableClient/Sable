import { MouseEventHandler, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Chip,
  config,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Text,
  toRem,
} from 'folds';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import FocusTrap from 'focus-trap-react';
import { Room } from 'matrix-js-sdk';
import { PhosphorIcon } from '$components/PhosphorIcon';
import * as css from './styles.css';
import { stopPropagation } from '../../utils/keyboard';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../components/user-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { getMouseEventCords } from '../../utils/dom';

type LiveChipProps = {
  room: Room;
  members: CallMembership[];
  count: number;
};
export function LiveChip({ count, room, members }: LiveChipProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={cords}
      position="Top"
      align="Start"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setCords(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            style={{
              maxHeight: '75vh',
              maxWidth: toRem(300),
              display: 'flex',
            }}
          >
            <Box grow="Yes">
              <Scroll size="0" hideTrack visibility="Hover">
                <Box direction="Column" style={{ padding: config.space.S100 }}>
                  {members.map((callMember) => {
                    const userId = callMember.sender;
                    if (!userId) return null;
                    const name =
                      getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
                    const avatarMxc = getMemberAvatarMxc(room, userId);
                    const avatarUrl = avatarMxc
                      ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96) ?? undefined)
                      : undefined;

                    return (
                      <MenuItem
                        key={callMember.membershipID}
                        size="400"
                        variant="Surface"
                        radii="300"
                        style={{ paddingLeft: config.space.S200 }}
                        onClick={(evt) =>
                          openUserProfile(
                            room.roomId,
                            undefined,
                            userId,
                            getMouseEventCords(evt.nativeEvent),
                            'Right'
                          )
                        }
                        before={
                          <Avatar size="200" radii="400">
                            <UserAvatar
                              userId={userId}
                              src={avatarUrl}
                              alt={name}
                              renderFallback={() => (
                                <PhosphorIcon as={UserIcon} size="50" weight="fill" />
                              )}
                            />
                          </Avatar>
                        }
                      >
                        <Text size="T300" truncate>
                          {name}
                        </Text>
                      </MenuItem>
                    );
                  })}
                </Box>
              </Scroll>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        variant="Surface"
        fill="Soft"
        before={<Badge variant="Critical" fill="Solid" size="200" />}
        after={<PhosphorIcon size="50" as={cords ? CaretDownIcon : CaretUpIcon} />}
        radii="Pill"
        onClick={handleOpenMenu}
      >
        <Text className={css.LiveChipText} as="span" size="L400" truncate>
          {count} Live
        </Text>
      </Chip>
    </PopOut>
  );
}
