import { useEffect, useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import { hydrateRoomMember } from '$client/roomMemberHydration';
import { useMatrixClient } from './useMatrixClient';
import { useIsInactivePanel } from './useRoom';
import { useTimelineScrolling } from './useTimelineScrollActivity';

export const useRoomMemberHydration = (
  room: Room,
  userId: string,
  hasTimelineMember = false,
  profileDisplayName?: string
): number => {
  const mx = useMatrixClient();
  const [version, setVersion] = useState(0);
  const isInactivePanel = useIsInactivePanel();
  const timelineScrolling = useTimelineScrolling();

  useEffect(() => {
    if (isInactivePanel || timelineScrolling || !userId.startsWith('@')) return undefined;

    const member = room.getMember(userId);

    if (!member && !hasTimelineMember) {
      let disposed = false;
      void hydrateRoomMember(mx, room.roomId, userId).then(() => {
        if (!disposed && room.getMember(userId)) setVersion((v) => v + 1);
      });
      return () => {
        disposed = true;
      };
    }

    if (member && profileDisplayName && profileDisplayName !== member.rawDisplayName) {
      let disposed = false;
      void hydrateRoomMember(mx, room.roomId, userId, true).then(() => {
        if (!disposed && room.getMember(userId)) setVersion((v) => v + 1);
      });
      return () => {
        disposed = true;
      };
    }

    return undefined;
  }, [mx, room, userId, hasTimelineMember, isInactivePanel, timelineScrolling, profileDisplayName]);

  return version;
};
