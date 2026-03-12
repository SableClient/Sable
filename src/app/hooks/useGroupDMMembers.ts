import { useEffect, useState } from 'react';
import { MatrixClient, Room } from '$types/matrix-sdk';

export type GroupMemberInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

/**
 * Fetches member information for a group DM.
 * Gets member user IDs from timeline message senders and fetches their profiles.
 * Returns members sorted by who last sent messages (most recent first).
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

        // Get last message senders from timeline to find member IDs
        const timeline = room.getLiveTimeline();
        const events = timeline.getEvents();

        // Extract unique senders excluding current user
        const senders = new Set<string>();
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const sender = events[i].getSender();
          if (sender && sender !== currentUserId) {
            senders.add(sender);
          }
        }

        // Convert to array and sort by recency (most recent first)
        const recentSenders: string[] = [];
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const sender = events[i].getSender();
          if (sender && sender !== currentUserId && !recentSenders.includes(sender)) {
            recentSenders.push(sender);
          }
        }

        // Slice to max members
        const limitedUserIds = recentSenders.slice(0, maxMembers);

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
