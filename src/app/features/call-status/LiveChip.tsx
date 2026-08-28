import { Avatar, Badge, Box, Chip, config, Menu, MenuItem, Scroll, Text, toRem } from 'folds';
import { CaretDown, CaretUp, sizedIcon, userFallbackIcon } from '$components/icons/phosphor';
import type { CallMembership } from '$types/matrix-sdk';
import type { Room } from '$types/matrix-sdk';
import * as css from './styles.css';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room/display';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../components/user-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { getMouseEventCords } from '../../utils/dom';
import { ResponsiveMenu } from '../../components/ResponsiveMenu';
import { useMenuAnchor } from '../../hooks/useMenuAnchor';

type LiveChipProps = {
  room: Room;
  members: CallMembership[];
  count: number;
};
export function LiveChip({ count, room, members }: LiveChipProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();

  const liveMenu = useMenuAnchor<HTMLButtonElement>();

  return (
    <ResponsiveMenu
      anchor={liveMenu.anchor}
      requestClose={liveMenu.close}
      position="Top"
      align="Start"
      returnFocusOnDeactivate
      menu={
        <Menu
          style={{
            maxHeight: '75dvh',
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
                          undefined,
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
                            renderFallback={() => userFallbackIcon('sm')}
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
      }
    >
      <Chip
        variant="Surface"
        fill="Soft"
        before={<Badge variant="Critical" fill="Solid" size="200" />}
        after={sizedIcon(liveMenu.anchor ? CaretDown : CaretUp, '50')}
        radii="Pill"
        onClick={liveMenu.triggerProps.onClick}
      >
        <Text className={css.LiveChipText} as="span" size="L400" truncate>
          {count} Live
        </Text>
      </Chip>
    </ResponsiveMenu>
  );
}
