import { useMemo, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router';
import { Avatar, Text, Box } from 'folds';
import { useAtomValue } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getDirectForumPath, getDirectRoomPath } from '$pages/pathUtils';
import {
  SidebarAvatar,
  SidebarItemLeft,
  SidebarUnreadBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { RoomAvatar } from '$components/room-avatar';
import { UserAvatar } from '$components/user-avatar';
import { getAvatarUrl, getDmOtherMember, getRoomAvatarUrl } from '$utils/room/display';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedOrLastRoom } from '$hooks/router/useSelectedRoom';
import { useGroupDMMembers } from '$hooks/useGroupDMMembers';
import { useRoomAvatar, useRoomName } from '$hooks/useRoomMeta';
import { useSidebarDirectRoomIds } from './useSidebarDirectRoomIds';
import * as css from './DirectDMsList.css';
import { CustomRoomType } from '$types/matrix/room';

const MAX_GROUP_MEMBERS = 3;

type DMItemProps = {
  room: Room;
  selected: boolean;
};

function DMItem({ room, selected }: DMItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const roomToUnread = useAtomValue(roomToUnreadAtom);

  const handleClick = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    navigate(
      room.getType() === CustomRoomType.Forum
        ? getDirectForumPath(roomIdOrAlias)
        : getDirectRoomPath(roomIdOrAlias)
    );
  };

  const roomName = useRoomName(room);
  const dmAvatarMxc = useRoomAvatar(room, true);
  const dmAvatarUrl = getAvatarUrl(mx, dmAvatarMxc, 96, useAuthentication);

  // Use already-synced room state only; sidebar rendering must not trigger member/profile requests.
  const groupMembers = useGroupDMMembers(mx, room, MAX_GROUP_MEMBERS);

  const isGroupDM = !getDmOtherMember(mx, room) && groupMembers.length > 1;

  // Get unread info for badge
  const unread = roomToUnread.get(room.roomId);

  // Render appropriate avatar based on DM type
  const renderAvatar = () => {
    if (!isGroupDM) {
      // Regular DM
      return (
        <Avatar size="400" radii="400">
          <RoomAvatar
            roomId={room.roomId}
            src={getRoomAvatarUrl(mx, room, 96, useAuthentication) || dmAvatarUrl}
            alt={roomName}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(roomName)}
              </Text>
            )}
          />
        </Avatar>
      );
    }

    // Multiple members in group DM - triangle layout
    return (
      <Box className={css.GroupAvatarContainer}>
        <Box className={css.GroupAvatarRow}>
          {groupMembers.map((member) => {
            const avatarUrl = member.avatarUrl
              ? (mxcUrlToHttp(mx, member.avatarUrl, useAuthentication, 48, 48, 'crop') ?? undefined)
              : undefined;

            return (
              <Avatar key={member.userId} size="200" radii="300" className={css.GroupAvatar}>
                <UserAvatar
                  userId={member.userId}
                  src={avatarUrl}
                  alt={member.displayName || member.userId}
                  renderFallback={() => (
                    <Text as="span" size="T300">
                      {nameInitials(member.displayName || member.userId)}
                    </Text>
                  )}
                />
              </Avatar>
            );
          })}
        </Box>
      </Box>
    );
  };

  return (
    <SidebarItemLeft active={selected}>
      <SidebarItemTooltip tooltip={roomName}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleClick} size="400">
            {renderAvatar()}
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {unread && (unread.total > 0 || unread.highlight > 0) && (
        <SidebarUnreadBadge
          highlight={unread.highlight > 0}
          count={unread.highlight > 0 ? unread.highlight : unread.total}
          dm
        />
      )}
    </SidebarItemLeft>
  );
}

export function DirectDMsList() {
  const mx = useMatrixClient();
  const selectedRoomId = useSelectedOrLastRoom();
  const sidebarRoomIds = useSidebarDirectRoomIds();

  const mountTimeRef = useRef(performance.now());
  const firstReadyRef = useRef(false);

  const recentDMs = useMemo(
    () =>
      sidebarRoomIds
        .map((roomId) => mx.getRoom(roomId))
        .filter((room): room is Room => room !== null),
    [sidebarRoomIds, mx]
  );

  useEffect(() => {
    if (recentDMs.length > 0 && !firstReadyRef.current) {
      firstReadyRef.current = true;
      Sentry.metrics.distribution(
        'sable.roomlist.time_to_ready_ms',
        performance.now() - mountTimeRef.current
      );
    }
  }, [recentDMs]);

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
