import type { MatrixClient, MatrixEvent, RoomMember } from '$types/matrix-sdk';
import { EventType, RoomMemberEvent, RoomStateEvent } from '$types/matrix-sdk';
import { useEffect, useState } from 'react';

export const useRoomMembers = (mx: MatrixClient, roomId: string): RoomMember[] => {
  const [members, setMembers] = useState<RoomMember[]>([]);

  useEffect(() => {
    const room = mx.getRoom(roomId);
    let loadingMembers = true;
    let disposed = false;

    const updateMemberList = (event?: MatrixEvent) => {
      if (!room || disposed || (event && event.getRoomId() !== roomId)) return;
      if (loadingMembers) return;
      setMembers(room.getMembers());
    };

    if (room) {
      setMembers(room.getMembers());
      room.loadMembersIfNeeded().then(() => {
        loadingMembers = false;
        if (disposed) return;
        updateMemberList();
      });
    }

    const handleStateEvent = (event: MatrixEvent) => {
      if (event.getRoomId() !== roomId) return;
      if (event.getType() !== (EventType.RoomMember as string)) return;
      updateMemberList(event);
    };

    mx.on(RoomMemberEvent.Membership, updateMemberList);
    mx.on(RoomMemberEvent.PowerLevel, updateMemberList);
    mx.on(RoomStateEvent.Events, handleStateEvent);
    return () => {
      disposed = true;
      mx.removeListener(RoomMemberEvent.Membership, updateMemberList);
      mx.removeListener(RoomMemberEvent.PowerLevel, updateMemberList);
      mx.removeListener(RoomStateEvent.Events, handleStateEvent);
    };
  }, [mx, roomId]);

  return members;
};
