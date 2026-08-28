import type { MatrixClient, Room } from '$types/matrix-sdk';
import { getMemberDisplayName } from '$utils/room/display';

export type GroupMemberInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
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
    .filter((member) => member.membership === 'join' && member.userId !== currentUserId);

  const recentSenderRank = new Map<string, number>();
  const events = room.getLiveTimeline().getEvents();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const sender = events[index]?.getSender();
    if (sender && sender !== currentUserId && !recentSenderRank.has(sender)) {
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
