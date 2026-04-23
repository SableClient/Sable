import { useEffect, useState } from 'react';
import type { MatrixClient, Room } from '$types/matrix-sdk';

export type GroupMemberInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

// Filter out bridge bots (not bridged users)
const isBridgeBot = (userId: string): boolean => {
  const localpart = userId.split(':')[0]?.substring(1) ?? '';
  const lowerLocalpart = localpart.toLowerCase();

  // Only filter out users ending with 'bot' (e.g., discordbot, blueskybot)
  // Don't filter bridge users with IDs like discord_378405164077547520
  if (lowerLocalpart.endsWith('bot')) return true;

  return false;
};

/**
 * Fetches member information for a group DM.
 * Gets all joined members from room state and fetches their profiles.
 * Sorts members by who last sent messages (most recent first), with members who haven't sent messages last.
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

        // Load members from server if needed (handles lazy-loading)
        await room.loadMembersIfNeeded();

        // Now get all members
        const allMembers = room.getMembers();

        const allUserIds = allMembers
          .filter(
            (m) => m.membership === 'join' && m.userId !== currentUserId && !isBridgeBot(m.userId)
          )
          .map((m) => m.userId);

        // Get last message senders from timeline for sorting
        const timeline = room.getLiveTimeline();
        const events = timeline.getEvents();

        // Extract senders in reverse chronological order (most recent first)
        const recentSenders: string[] = [];
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const evt = events[i];
          if (!evt) continue;
          const sender = evt.getSender();
          if (
            sender &&
            sender !== currentUserId &&
            !isBridgeBot(sender) &&
            !recentSenders.includes(sender)
          ) {
            recentSenders.push(sender);
          }
        }

        // Sort allUserIds by who appears first in recentSenders
        const sortedUserIds = allUserIds.toSorted((a, b) => {
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
