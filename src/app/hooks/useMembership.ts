import { useEffect, useState } from 'react';
import type { Room, RoomMemberEventHandlerMap } from '$types/matrix-sdk';
import { RoomMemberEvent } from '$types/matrix-sdk';
import { Membership } from '$types/matrix/room';

export const useMembership = (room: Room, userId: string): Membership => {
  const member = room.getMember(userId);

  const [membership, setMembership] = useState<Membership>(
    () => (member?.membership as Membership | undefined) ?? Membership.Leave
  );

  useEffect(() => {
    const handleMembershipChange: RoomMemberEventHandlerMap[RoomMemberEvent.Membership] = (
      event,
      m
    ) => {
      if (event.getRoomId() === room.roomId && m.userId === userId) {
        setMembership((m.membership as Membership | undefined) ?? Membership.Leave);
      }
    };
    member?.on(RoomMemberEvent.Membership, handleMembershipChange);
    return () => {
      member?.removeListener(RoomMemberEvent.Membership, handleMembershipChange);
    };
  }, [room, member, userId]);

  return membership;
};
