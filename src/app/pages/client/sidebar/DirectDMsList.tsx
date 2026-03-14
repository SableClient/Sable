import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Text, Box, toRem } from 'folds';
import { useAtomValue } from 'jotai';
import { Room, SyncState } from '$types/matrix-sdk';
import { useDirects } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getDirectRoomPath } from '$pages/pathUtils';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { UnreadBadge } from '$components/unread-badge';
import { RoomAvatar } from '$components/room-avatar';
import { UserAvatar } from '$components/user-avatar';
import { getDirectRoomAvatarUrl } from '$utils/room';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { factoryRoomIdByActivity } from '$utils/sort';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useGroupDMMembers } from '$hooks/useGroupDMMembers';
import { useSyncState } from '$hooks/useSyncState';
import * as css from './DirectDMsList.css';

const MAX_DM_AVATARS = 3;
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
    if (groupMembers.length !== 1 || !groupMembers[0].avatarUrl) {
      return undefined;
    }
    return (
      mxcUrlToHttp(mx, groupMembers[0].avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    );
  };

  // Render appropriate avatar based on DM type
  const renderAvatar = () => {
    if (!isGroupDM) {
      // Regular DM
      return (
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
      );
    }

    if (groupMembers.length === 1) {
      // Single member in group DM - fill the space like a normal DM
      return (
        <Avatar size="400" radii="400">
          <UserAvatar
            userId={groupMembers[0].userId}
            src={getSingleMemberAvatarSrc()}
            alt={groupMembers[0].displayName || groupMembers[0].userId}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(groupMembers[0].displayName || groupMembers[0].userId)}
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
        <SidebarItemBadge
          hasCount={unread.total > 0}
          style={{
            left: unread.total > 0 ? toRem(-6) : toRem(-2),
            right: 'auto',
          }}
        >
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

  // Track sync state to wait for initial sync completion
  const [syncReady, setSyncReady] = useState(false);

  useSyncState(
    mx,
    useCallback((state, prevState) => {
      // Consider ready after initial sync reaches Syncing state
      // This ensures m.direct and unread counts are populated
      if (state === SyncState.Syncing && prevState !== SyncState.Syncing) {
        setSyncReady(true);
      }
      // Also set ready if we're already syncing (e.g., after a refresh while still online)
      if (state === SyncState.Syncing || state === SyncState.Catchup) {
        setSyncReady(true);
      }
    }, [])
  );

  // Get up to MAX_DM_AVATARS recent DMs that have unread messages
  const recentDMs = useMemo(() => {
    // Don't show DMs until initial sync completes
    if (!syncReady) {
      return [];
    }

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
  }, [directs, mx, roomToUnread, syncReady]);

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
