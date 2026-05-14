import { useEffect, useState } from 'react';
import type { Membership, Room, RoomMemberEventHandlerMap } from '$types/matrix-sdk';
import { RoomMemberEvent, KnownMembership } from '$types/matrix-sdk';

export const useMembership = (room: Room, userId: string): Membership => {
  const member = room.getMember(userId);

  const [membership, setMembership] = useState<Membership>(
    () => member?.membership ?? KnownMembership.Leave
  );

  useEffect(() => {
    const handleMembershipChange: RoomMemberEventHandlerMap[RoomMemberEvent.Membership] = (
      event,
      m
    ) => {
      if (event.getRoomId() === room.roomId && m.userId === userId) {
        setMembership(m.membership ?? KnownMembership.Leave);
      }
    };
    member?.on(RoomMemberEvent.Membership, handleMembershipChange);
    return () => {
      member?.removeListener(RoomMemberEvent.Membership, handleMembershipChange);
    };
  }, [room, member, userId]);

  return membership;
};
