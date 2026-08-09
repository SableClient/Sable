import type { MatrixClient, MatrixEvent, RoomMember } from '$types/matrix-sdk';
import { EventType, RoomMemberEvent, RoomStateEvent } from '$types/matrix-sdk';
import { useEffect, useState } from 'react';
import { hydrateAllRoomMembers } from '$client/roomMemberHydration';

export const useRoomMembers = (mx: MatrixClient, roomId: string, enabled = true): RoomMember[] => {
  const [members, setMembers] = useState<RoomMember[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMembers([]);
      return undefined;
    }

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
      const stopLoading = () => {
        loadingMembers = false;
        if (disposed) return;
        updateMemberList();
      };
      room.loadMembersIfNeeded().then(() => {
        stopLoading();
        void hydrateAllRoomMembers(mx, roomId).then(() => updateMemberList());
      }, stopLoading);
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
  }, [enabled, mx, roomId]);

  return members;
};
