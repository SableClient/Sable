import { useMemo, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Text, Box } from 'folds';
import { useAtomValue } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getDirectRoomPath } from '$pages/pathUtils';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarUnreadBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { RoomAvatar } from '$components/room-avatar';
import { UserAvatar } from '$components/user-avatar';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '$utils/room';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useGroupDMMembers } from '$hooks/useGroupDMMembers';
import { useSidebarDirectRoomIds } from './useSidebarDirectRoomIds';
import * as css from './DirectDMsList.css';

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
    navigate(getDirectRoomPath(getCanonicalAliasOrRoomId(mx, room.roomId)));
  };

  // Check if this is a group DM (more than 2 members)
  const isGroupDM = room.getJoinedMemberCount() > 2;

  // Get member info for group DMs using m.direct and profile API (doesn't require full room state)
  // Members are sorted by who last sent messages (most recent first)
  const groupMembers = useGroupDMMembers(mx, room, MAX_GROUP_MEMBERS);

  // Get unread info for badge
  const unread = roomToUnread.get(room.roomId);

  // Determine avatar src for single group DM member to avoid nested ternary
  const getSingleMemberAvatarSrc = () => {
    const member = groupMembers[0];
    if (groupMembers.length !== 1 || !member?.avatarUrl) {
      return undefined;
    }
    return mxcUrlToHttp(mx, member.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined;
  };

  // Render appropriate avatar based on DM type
  const renderAvatar = () => {
    if (!isGroupDM) {
      // Regular DM
      return (
        <Avatar size="400" radii="400">
          <RoomAvatar
            roomId={room.roomId}
            src={
              getRoomAvatarUrl(mx, room, 96, useAuthentication) ||
              getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
            }
            alt={room.name}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(room.name)}
              </Text>
            )}
          />
        </Avatar>
      );
    }

    if (groupMembers.length === 1) {
      const member = groupMembers[0];
      if (!member) return null;
      return (
        <Avatar size="400" radii="400">
          <UserAvatar
            userId={member.userId}
            src={getSingleMemberAvatarSrc()}
            alt={member.displayName || member.userId}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(member.displayName || member.userId)}
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
    <SidebarItem active={selected}>
      <SidebarItemTooltip tooltip={room.name}>
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
    </SidebarItem>
  );
}

export function DirectDMsList() {
  const mx = useMatrixClient();
  const selectedRoomId = useSelectedRoom();
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
