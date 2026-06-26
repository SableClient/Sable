import type { MatrixClient, MatrixEvent, RoomMember } from '$types/matrix-sdk';
import { EventType, RoomMemberEvent, RoomStateEvent } from '$types/matrix-sdk';
import { useEffect, useRef, useState } from 'react';
import { isRoomMembersLoaded, loadRoomMembersOnce } from '$utils/loadRoomMembers';

export const useRoomMembers = (mx: MatrixClient, roomId: string): RoomMember[] => {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const loadInitiatedRef = useRef(false);

  useEffect(() => {
    // Reset on every room change so navigating to a new room always triggers a load.
    loadInitiatedRef.current = false;

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

      // Foreground load bypasses the background concurrency queue so sidebar
      // preloads cannot delay the active room's member list or autocomplete.
      const alreadyLoaded = isRoomMembersLoaded(roomId);
      if (!alreadyLoaded && !loadInitiatedRef.current) {
        loadInitiatedRef.current = true;
        loadRoomMembersOnce(room, { foreground: true })
          .then(() => {
            loadingMembers = false;
            if (disposed) return;
            updateMemberList();
          })
          .catch(() => {
            // If loading fails, allow retry on next mount
            loadInitiatedRef.current = false;
            loadingMembers = false;
          });
      } else {
        loadingMembers = false;
        updateMemberList();
      }
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
