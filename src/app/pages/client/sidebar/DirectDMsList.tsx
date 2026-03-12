import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Text, Box } from 'folds';
import { useAtomValue } from 'jotai';
import { Room, RoomMember } from '$types/matrix-sdk';
import { useDirects } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getDirectRoomPath } from '$pages/pathUtils';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemTooltip,
} from '$components/sidebar';
import { RoomAvatar } from '$components/room-avatar';
import { UserAvatar } from '$components/user-avatar';
import { getDirectRoomAvatarUrl, getMemberAvatarMxc } from '$utils/room';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { factoryRoomIdByActivity } from '$utils/sort';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import * as css from './DirectDMsList.css';

const MAX_DM_AVATARS = 3;
const MAX_GROUP_MEMBERS = 4;

type DMItemProps = {
  room: Room;
  selected: boolean;
};

function DMItem({ room, selected }: DMItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(getDirectRoomPath(getCanonicalAliasOrRoomId(mx, room.roomId)));
  };

  // Check if this is a group DM (more than 2 members)
  const isGroupDM = room.getJoinedMemberCount() > 2;

  // Get active members for group DMs
  const groupMembers = useMemo(() => {
    if (!isGroupDM) return [];

    const members = room.getJoinedMembers();
    // Filter out the current user
    const otherMembers = members.filter((member) => member.userId !== mx.getUserId());

    // Sort by most recent activity (could be enhanced with actual activity tracking)
    // For now, just return first 2-4 members
    return otherMembers.slice(0, MAX_GROUP_MEMBERS);
  }, [isGroupDM, room, mx]);

  return (
    <SidebarItem active={selected}>
      <SidebarItemTooltip tooltip={room.name}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined={false} onClick={handleClick}>
            {isGroupDM ? (
              <Box className={css.GroupAvatarGrid}>
                {groupMembers.map((member) => {
                  const avatarMxc = getMemberAvatarMxc(room, member.userId);
                  const avatarUrl = avatarMxc
                    ? mxcUrlToHttp(mx, avatarMxc, 48, 48, 'crop', useAuthentication)
                    : undefined;

                  return (
                    <Avatar key={member.userId} size="200" radii="400" className={css.GroupAvatar}>
                      <UserAvatar
                        userId={member.userId}
                        src={avatarUrl}
                        alt={member.name}
                        renderFallback={() => (
                          <Text as="span" size="T200">
                            {nameInitials(member.name)}
                          </Text>
                        )}
                      />
                    </Avatar>
                  );
                })}
              </Box>
            ) : (
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
            )}
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}

export function DirectDMsList() {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const selectedRoomId = useSelectedRoom();

  // Get up to MAX_DM_AVATARS recent DMs that have unread messages
  const recentDMs = useMemo(() => {
    // Filter to only DMs with unread messages
    const withUnread = directs.filter((roomId) => {
      const unread = roomToUnread.get(roomId);
      return unread && (unread.total > 0 || unread.highlight > 0);
    });

    // Sort by activity
    const sorted = withUnread.sort(factoryRoomIdByActivity(mx));

    return sorted
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
