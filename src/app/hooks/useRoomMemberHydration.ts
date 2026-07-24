import { useEffect, useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import { hydrateRoomMember } from '$client/roomMemberHydration';
import { useMatrixClient } from './useMatrixClient';
import { useIsInactivePanel } from './useRoom';
import { useTimelineScrolling } from './useTimelineScrollActivity';

/**
 * Under sliding sync, m.room.member events only arrive for senders in the
 * lazy-loaded sync window. Fetch the member on demand and bump local state so
 * the caller re-reads room member state (avatar, display name) once hydrated.
 */
export const useRoomMemberHydration = (
  room: Room,
  userId: string,
  hasTimelineMember = false
): number => {
  const mx = useMatrixClient();
  const [version, setVersion] = useState(0);
  const isInactivePanel = useIsInactivePanel();
  const timelineScrolling = useTimelineScrolling();

  useEffect(() => {
    if (
      isInactivePanel ||
      timelineScrolling ||
      hasTimelineMember ||
      !userId.startsWith('@') ||
      room.getMember(userId)
    )
      return undefined;
    let disposed = false;
    void hydrateRoomMember(mx, room.roomId, userId).then(() => {
      if (!disposed && room.getMember(userId)) setVersion((v) => v + 1);
    });
    return () => {
      disposed = true;
    };
  }, [mx, room, userId, hasTimelineMember, isInactivePanel, timelineScrolling]);

  return version;
};
