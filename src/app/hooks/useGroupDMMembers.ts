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
  maxMembers = 3,
  enabled = true
): GroupMemberInfo[] => {
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMembers([]);
      return () => {};
    }

    let disposed = false;

    const collectMembers = () => {
      const currentUserId = mx.getUserId();
      const allMembers = room.getMembers();

      const timeline = room.getLiveTimeline();
      const events = timeline.getEvents();
      const recentSenderOrder = new Map<string, number>();

      for (let i = events.length - 1; i >= 0; i -= 1) {
        const sender = events[i]?.getSender();
        if (
          sender &&
          sender !== currentUserId &&
          !isBridgeBot(sender) &&
          !recentSenderOrder.has(sender)
        ) {
          recentSenderOrder.set(sender, recentSenderOrder.size);
        }
      }

      return allMembers
        .filter(
          (m) => m.membership === 'join' && m.userId !== currentUserId && !isBridgeBot(m.userId)
        )
        .toSorted((a, b) => {
          const aIndex = recentSenderOrder.get(a.userId);
          const bIndex = recentSenderOrder.get(b.userId);

          if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
          if (aIndex !== undefined) return -1;
          if (bIndex !== undefined) return 1;
          return 0;
        })
        .slice(0, maxMembers)
        .map((member) => ({
          userId: member.userId,
          displayName: member.name || member.userId,
          avatarUrl: member.getMxcAvatarUrl() ?? undefined,
        }));
    };

    const fetchMembers = async () => {
      try {
        setMembers(collectMembers());

        // Load members from server if needed (handles lazy-loading), then refresh
        // with fuller local room-state data without blocking the first paint.
        await room.loadMembersIfNeeded();

        if (!disposed) setMembers(collectMembers());
      } catch {
        // If fetching fails, set empty array
        if (!disposed) setMembers([]);
      }
    };

    fetchMembers();
    return () => {
      disposed = true;
    };
  }, [mx, room, maxMembers, enabled]);

  return members;
};
