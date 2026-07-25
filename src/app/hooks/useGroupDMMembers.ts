import type { MatrixClient, Room } from '$types/matrix-sdk';
import { getMemberDisplayName } from '$utils/room/display';

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
  const currentUserId = mx.getUserId();
  const members = room
    .getMembers()
    .filter(
      (member) =>
        member.membership === 'join' &&
        member.userId !== currentUserId &&
        !isBridgeBot(member.userId)
    );

  const recentSenderRank = new Map<string, number>();
  const events = room.getLiveTimeline().getEvents();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const sender = events[index]?.getSender();
    if (
      sender &&
      sender !== currentUserId &&
      !isBridgeBot(sender) &&
      !recentSenderRank.has(sender)
    ) {
      recentSenderRank.set(sender, recentSenderRank.size);
    }
  }

  return members
    .toSorted(
      (a, b) =>
        (recentSenderRank.get(a.userId) ?? Number.POSITIVE_INFINITY) -
        (recentSenderRank.get(b.userId) ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, maxMembers)
    .map((member) => ({
      userId: member.userId,
      displayName: getMemberDisplayName(room, member.userId, {}) ?? member.userId,
      avatarUrl: member.getMxcAvatarUrl() ?? undefined,
    }));
};
