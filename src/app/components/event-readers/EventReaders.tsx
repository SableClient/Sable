import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { Avatar, Box, Header, IconButton, MenuItem, Scroll, Text, as, config } from 'folds';
import type { Room } from '$types/matrix-sdk';
import { useRoomEventReaders } from '$hooks/useRoomEventReaders';
import { getAvatarUrl, getMemberDisplayName } from '$utils/room/display';
import { getMxIdLocalPart } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSpaceOptionally } from '$hooks/useSpace';
import { getMouseEventCords } from '$utils/dom';
import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { hydrateRoomMembers } from '$client/roomMemberHydration';
import { UserAvatar } from '$components/user-avatar';
import { composerIcon, userFallbackIcon, X } from '$components/icons/phosphor';
import * as css from './EventReaders.css';

type EventReadersProps = {
  room: Room;
  eventId: string;
  requestClose: () => void;
};
export const EventReaders = as<'div', EventReadersProps>(
  ({ className, room, eventId, requestClose, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const latestEventReaders = useRoomEventReaders(room, eventId);
    const openProfile = useOpenUserRoomProfile();
    const space = useSpaceOptionally();
    const nicknames = useAtomValue(nicknamesAtom);
    const cachedProfiles = useAtomValue(profilesCacheAtom);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
      let disposed = false;
      const unknownUserIds = latestEventReaders.filter(
        (readerId) => readerId && !room.getMember(readerId)
      );
      if (unknownUserIds.length > 0) {
        hydrateRoomMembers(mx, room.roomId, unknownUserIds).then(() => {
          if (!disposed) forceUpdate((n) => n + 1);
        });
      }
      return () => {
        disposed = true;
      };
    }, [mx, room, latestEventReaders]);

    const getName = (userId: string) =>
      getMemberDisplayName(room, userId, nicknames) ??
      cachedProfiles[userId]?.displayName ??
      getMxIdLocalPart(userId) ??
      userId;

    return (
      <Box
        className={classNames(css.EventReaders, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.Header} variant="Surface" size="600">
          <Box grow="Yes">
            <Text size="H3">Seen by</Text>
          </Box>
          <IconButton size="300" onClick={requestClose}>
            {composerIcon(X)}
          </IconButton>
        </Header>
        <Box grow="Yes" style={{ width: '100%', minWidth: 0 }}>
          <Box
            grow="Yes"
            className={css.Content}
            direction="Column"
            style={{ width: '100%', minWidth: 0 }}
          >
            <Scroll visibility="Hover" hideTrack size="300" style={{ width: '100%' }}>
              {latestEventReaders.map((readerId) => {
                const name = getName(readerId);
                const avatarMxcUrl = room.getMember(readerId)?.getMxcAvatarUrl();
                const avatarUrl = getAvatarUrl(mx, avatarMxcUrl, 100, useAuthentication);

                return (
                  <MenuItem
                    key={readerId}
                    style={{ padding: `0 ${config.space.S200}`, width: '100%' }}
                    radii="400"
                    onClick={(event) => {
                      openProfile(
                        room.roomId,
                        space?.roomId,
                        readerId,
                        undefined,
                        getMouseEventCords(event.nativeEvent),
                        'Bottom'
                      );
                    }}
                    before={
                      <Avatar size="200">
                        <UserAvatar
                          userId={readerId}
                          src={avatarUrl ?? undefined}
                          alt={name}
                          renderFallback={() => userFallbackIcon('sm')}
                        />
                      </Avatar>
                    }
                  >
                    <Text size="T400" truncate>
                      {name}
                    </Text>
                  </MenuItem>
                );
              })}
            </Scroll>
          </Box>
        </Box>
      </Box>
    );
  }
);
