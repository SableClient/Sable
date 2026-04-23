import type { JoinRule, Room } from '$types/matrix-sdk';
import { GuestAccess, HistoryVisibility, EventType } from '$types/matrix-sdk';

import { getStateEvent } from '$utils/room';

export type LocalRoomSummary = {
  roomId: string;
  name: string;
  topic?: string;
  avatarUrl?: string;
  canonicalAlias?: string;
  worldReadable?: boolean;
  guestCanJoin?: boolean;
  memberCount?: number;
  roomType?: string;
  joinRule?: JoinRule;
};
export const useLocalRoomSummary = (room: Room): LocalRoomSummary => {
  const topicEvent = getStateEvent(room, EventType.RoomTopic);
  const topicContent = topicEvent?.getContent();
  const topic =
    topicContent && typeof topicContent.topic === 'string' ? topicContent.topic : undefined;

  const historyEvent = getStateEvent(room, EventType.RoomHistoryVisibility);
  const historyContent = historyEvent?.getContent();
  const worldReadable =
    historyContent && typeof historyContent.history_visibility === 'string'
      ? historyContent.history_visibility === (HistoryVisibility.WorldReadable as string)
      : undefined;

  const guestCanJoin = (room.getGuestAccess() as string) === (GuestAccess.CanJoin as string);

  return {
    roomId: room.roomId,
    name: room.name,
    topic,
    avatarUrl: room.getMxcAvatarUrl() ?? undefined,
    canonicalAlias: room.getCanonicalAlias() ?? undefined,
    worldReadable,
    guestCanJoin,
    memberCount: room.getJoinedMemberCount(),
    roomType: room.getType(),
    joinRule: room.getJoinRule(),
  };
};
