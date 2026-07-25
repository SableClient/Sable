import type { ReactNode } from 'react';
import { as, Avatar, Box, Text } from 'folds';
import { userFallbackIcon } from '$components/icons/phosphor';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';
import { getAvatarUrl, getMemberDisplayName } from '$utils/room/display';
import { getMxIdLocalPart } from '$utils/matrix';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { UserAvatar } from '$components/user-avatar';
import { useUserPresence } from '$hooks/useUserPresence';
import { PresenceBadge } from '$components/presence';
import * as css from './style.css';

const getName = (room: Room, member: RoomMember, nicknames: Record<string, string>) =>
  getMemberDisplayName(room, member.userId, nicknames) ??
  getMxIdLocalPart(member.userId) ??
  member.userId;

type MemberTileProps = {
  mx: MatrixClient;
  room: Room;
  member: RoomMember;
  useAuthentication: boolean;
  after?: ReactNode;
};
export const MemberTile = as<'button', MemberTileProps>(
  ({ as: AsMemberTile = 'button', mx, room, member, useAuthentication, after, ...props }, ref) => {
    const nicknames = useAtomValue(nicknamesAtom);
    const name = getName(room, member, nicknames);
    const presence = useUserPresence(member.userId ?? '');

    const avatarMxcUrl = member.getMxcAvatarUrl() ?? mx.getUser(member.userId)?.avatarUrl;
    const avatarUrl = getAvatarUrl(mx, avatarMxcUrl, 100, useAuthentication);

    // Sable username color and fonts
    const { color, font } = useSableCosmetics(member.userId, room, false, false);

    return (
      <AsMemberTile className={css.MemberTile} {...props} ref={ref}>
        <Avatar size="300" radii="400">
          <UserAvatar
            userId={member.userId}
            src={avatarUrl ?? undefined}
            alt={name}
            renderFallback={() => userFallbackIcon('xl')}
          />
        </Avatar>
        <Box grow="Yes" as="span" direction="Column">
          <Text as="span" size="T300" truncate style={{ color, fontFamily: font }}>
            <b>{name}</b>
          </Text>
          {presence && presence.status && (
            <Box alignItems="Center" gap="100">
              <PresenceBadge presence={presence.presence} size="200" />
              <Text as="span" size="T200" priority="300" truncate>
                {presence.status}
              </Text>
            </Box>
          )}
        </Box>
        {after}
      </AsMemberTile>
    );
  }
);
