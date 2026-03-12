import { useEffect, useState } from 'react';
import { MatrixClient, Room } from '$types/matrix-sdk';

export type GroupMemberInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

/**
 * Fetches member information for a group DM.
 * Gets joined members from the room and fetches their profiles via getProfileInfo.
 * Sorts members by who last sent messages in the room (most recent first).
 */
export const useGroupDMMembers = (
  mx: MatrixClient,
  room: Room,
  maxMembers = 3
): GroupMemberInfo[] => {
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const currentUserId = mx.getUserId();

        // Get joined members from the room directly
        const joinedMembers = room.getJoinedMembers();
        
        // Extract user IDs excluding current user
        const userIds = joinedMembers
          .map(member => member.userId)
          .filter(userId => userId !== currentUserId);

        // Get last message senders from timeline to sort by activity
        const timeline = room.getLiveTimeline();
        const events = timeline.getEvents();

        // Extract senders in reverse chronological order (most recent first)
        const recentSenders: string[] = [];
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const sender = events[i].getSender();
          if (sender && sender !== currentUserId && !recentSenders.includes(sender)) {
            recentSenders.push(sender);
          }
        }

        // Sort userIds by who appears first in recentSenders, then keep original order for the rest
        const sortedUserIds = userIds.sort((a, b) => {
          const aIndex = recentSenders.indexOf(a);
          const bIndex = recentSenders.indexOf(b);

          // If both are in recent senders, sort by recency
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          // If only a is in recent senders, it comes first
          if (aIndex !== -1) return -1;
          // If only b is in recent senders, it comes first
          if (bIndex !== -1) return 1;
          // Neither in recent senders, maintain original order
          return 0;
        });

        // Slice to max members
        const limitedUserIds = sortedUserIds.slice(0, maxMembers);

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
  }, [mx, room, maxMembers]);

  return members;
};
