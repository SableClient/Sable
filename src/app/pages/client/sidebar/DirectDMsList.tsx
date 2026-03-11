import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Text } from 'folds';
import { useAtomValue } from 'jotai';
import { Room } from '$types/matrix-sdk';
import { useDirects } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getDirectRoomPath, joinPathComponent } from '$pages/pathUtils';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { UnreadBadge } from '$components/unread-badge';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { useRoomUnread } from '$state/hooks/unread';
import { RoomAvatar } from '$components/room-avatar';
import { getDirectRoomAvatarUrl } from '$utils/room';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { factoryRoomIdByActivity } from '$utils/sort';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';

const MAX_DM_AVATARS = 3;

type DMItemProps = {
  room: Room;
  selected: boolean;
};

function DMItem({ room, selected }: DMItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);

  const handleClick = () => {
    if (screenSize === ScreenSize.Mobile) {
      const activePath = navToActivePath.get('direct');
      if (activePath) {
        navigate(joinPathComponent(activePath));
        return;
      }
    }
    navigate(getDirectRoomPath(getCanonicalAliasOrRoomId(mx, room.roomId)));
  };

  return (
    <SidebarItem active={selected}>
      <SidebarItemTooltip tooltip={room.name}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined={false} onClick={handleClick}>
            <Avatar size="400" radii="400">
              <RoomAvatar
                roomId={room.roomId}
                src={getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)}
                alt={room.name}
                renderFallback={() => (
                  <Text as="span" size="H6">
                    {nameInitials(room.name)}
                  </Text>
                )}
              />
            </Avatar>
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {unread && (unread.total > 0 || unread.highlight > 0) && (
        <SidebarItemBadge hasCount={unread.total > 0}>
          <UnreadBadge
            highlight={unread.highlight > 0}
            count={unread.highlight > 0 ? unread.highlight : unread.total}
            dm
          />
        </SidebarItemBadge>
      )}
    </SidebarItem>
  );
}

export function DirectDMsList() {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const selectedRoomId = useSelectedRoom();

  // Get up to MAX_DM_AVATARS recent DMs, prioritizing ones with unread messages
  const recentDMs = useMemo(() => {
    const withUnread = directs.filter((roomId) => {
      const unread = roomToUnread.get(roomId);
      return unread && (unread.total > 0 || unread.highlight > 0);
    });

    const sorted = Array.from(directs).sort(factoryRoomIdByActivity(mx));
    const prioritized = [
      ...withUnread.sort(factoryRoomIdByActivity(mx)),
      ...sorted.filter((id) => !withUnread.includes(id)),
    ];

    return prioritized
      .slice(0, MAX_DM_AVATARS)
      .map((roomId) => mx.getRoom(roomId))
      .filter((room): room is Room => room !== null);
  }, [directs, mx, roomToUnread]);

  if (recentDMs.length === 0) {
    return null;
  }

  return (
    <>
      {recentDMs.map((room) => (
        <DMItem key={room.roomId} room={room} selected={selectedRoomId === room.roomId} />
      ))}
    </>
  );
}
