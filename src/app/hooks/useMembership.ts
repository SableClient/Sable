import { useCallback, useState } from 'react';
import type { Membership, Room, RoomMemberEventHandlerMap } from '$types/matrix-sdk';
import { RoomMemberEvent, KnownMembership } from '$types/matrix-sdk';
import { useMatrixEvent } from '$hooks/useMatrixEvent';

export const useMembership = (room: Room, userId: string): Membership => {
  const member = room.getMember(userId);

  const [membership, setMembership] = useState<Membership>(
    () => member?.membership ?? KnownMembership.Leave
  );

  const handleMembershipChange: RoomMemberEventHandlerMap[RoomMemberEvent.Membership] = useCallback(
    (event, m) => {
      if (event.getRoomId() === room.roomId && m.userId === userId) {
        setMembership(m.membership ?? KnownMembership.Leave);
      }
    },
    [room.roomId, userId]
  );

  useMatrixEvent(member, RoomMemberEvent.Membership, handleMembershipChange);

  return membership;
};
