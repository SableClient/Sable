import { useEffect, useState } from 'react';
import { MatrixClient } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import { getAccountData } from '$utils/room';

export type GroupMemberInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

/**
 * Fetches member information for a group DM without requiring full room state.
 * Uses m.direct account data to find user IDs, then fetches profiles via getProfileInfo.
 */
export const useGroupDMMembers = (
  mx: MatrixClient,
  roomId: string,
  maxMembers = 4
): GroupMemberInfo[] => {
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        // Get m.direct account data to find user IDs associated with this room
        const mDirectEvent = getAccountData(mx, AccountDataEvent.Direct);
        if (!mDirectEvent) {
          setMembers([]);
          return;
        }

        const userIdToRooms = mDirectEvent.getContent();
        const currentUserId = mx.getUserId();

        // Find user IDs that have this room in their DM list (excluding current user)
        const userIds = Object.keys(userIdToRooms).filter((userId) => {
          if (userId === currentUserId) return false;
          const rooms = userIdToRooms[userId];
          return Array.isArray(rooms) && rooms.includes(roomId);
        });

        // Slice to max members
        const limitedUserIds = userIds.slice(0, maxMembers);

        // Fetch profiles for each user
        const memberPromises = limitedUserIds.map(async (userId) => {
          try {
            const profile = await mx.getProfileInfo(userId);
            return {
              userId,
              displayName: profile.displayname || userId,
              avatarUrl: profile.avatar_url,
            };
          } catch {
            // If profile fetch fails, return basic info
            return {
              userId,
              displayName: userId,
              avatarUrl: undefined,
            };
          }
        });

        const fetchedMembers = await Promise.all(memberPromises);
        setMembers(fetchedMembers);
      } catch {
        // If fetching fails, set empty array
        setMembers([]);
      }
    };

    fetchMembers();
  }, [mx, roomId, maxMembers]);

  return members;
};
