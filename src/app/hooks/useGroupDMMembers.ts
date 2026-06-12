import { useEffect, useState } from 'react';
import type { MatrixClient, Room } from '$types/matrix-sdk';

export type GroupMemberInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

const loadedMemberRoomIds = new Set<string>();
const memberLoadPromises = new Map<string, Promise<void>>();

// Filter out bridge bots (not bridged users)
const isBridgeBot = (userId: string): boolean => {
  const localpart = userId.split(':')[0]?.substring(1) ?? '';
  const lowerLocalpart = localpart.toLowerCase();

  // Only filter out users ending with 'bot' (e.g., discordbot, blueskybot)
  // Don't filter bridge users with IDs like discord_378405164077547520
  if (lowerLocalpart.endsWith('bot')) return true;

  return false;
};

async function loadRoomMembersOnce(room: Room): Promise<void> {
  const { roomId } = room;
  if (loadedMemberRoomIds.has(roomId)) return;

  let loadPromise = memberLoadPromises.get(roomId);
  if (!loadPromise) {
    loadPromise = room
      .loadMembersIfNeeded()
      .then(() => {
        loadedMemberRoomIds.add(roomId);
      })
      .finally(() => {
        memberLoadPromises.delete(roomId);
      });
    memberLoadPromises.set(roomId, loadPromise);
  }

  await loadPromise;
}

/**
 * Read member info synchronously from already-loaded room state.
 * Returns partial data (no profile API) so the first render has something to
 * show rather than being empty while the async fetch is in-flight.
 */
function getInitialMembers(
  mx: MatrixClient,
  room: Room | undefined,
  maxMembers: number
): GroupMemberInfo[] {
  if (!room) return [];
  const currentUserId = mx.getUserId();
  return room
    .getMembers()
    .filter((m) => m.membership === 'join' && m.userId !== currentUserId && !isBridgeBot(m.userId))
    .slice(0, maxMembers)
    .map((m) => ({
      userId: m.userId,
      displayName: m.name || m.userId,
      avatarUrl: m.getMxcAvatarUrl() ?? undefined,
    }));
}

/**
 * Fetches member information for a group DM.
 * Starts from already-synced room state, then loads members once per room if
 * lazy-loaded state is too sparse to render a group-DM avatar.
 * Sorts members by who last sent messages (most recent first), with members who haven't sent messages last.
 */
export const useGroupDMMembers = (
  mx: MatrixClient,
  room: Room | undefined,
  maxMembers = 3
): GroupMemberInfo[] => {
  // Seed from local room state so the triple-avatar layout renders on the
  // first paint instead of flashing in after the async profile fetch.
  const [members, setMembers] = useState<GroupMemberInfo[]>(() =>
    getInitialMembers(mx, room, maxMembers)
  );

  useEffect(() => {
    let cancelled = false;
    if (!room) {
      // Use functional update to avoid a re-render when state is already empty
      // (e.g. every 1:1 DM nav item that never had group members).
      setMembers((prev) => (prev.length > 0 ? [] : prev));
      return undefined;
    }
    const fetchMembers = async () => {
      try {
        const currentUserId = mx.getUserId();

        let allMembers = room.getMembers();

        let joinedMembers = allMembers.filter(
          (m) => m.membership === 'join' && m.userId !== currentUserId && !isBridgeBot(m.userId)
        );
        const expectedVisibleMembers = Math.min(
          maxMembers,
          Math.max(0, room.getJoinedMemberCount() - 1)
        );

        if (joinedMembers.length < expectedVisibleMembers) {
          await loadRoomMembersOnce(room);
          if (cancelled) return;

          allMembers = room.getMembers();
          joinedMembers = allMembers.filter(
            (m) => m.membership === 'join' && m.userId !== currentUserId && !isBridgeBot(m.userId)
          );
        }

        const allUserIds = joinedMembers.map((m) => m.userId);

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
        if (cancelled) return;
        setMembers(fetchedMembers);
      } catch {
        if (cancelled) return;
        // If fetching fails, set empty array
        setMembers([]);
      }
    };

    fetchMembers();

    return () => {
      cancelled = true;
    };
  }, [mx, room, maxMembers]);

  return members;
};
