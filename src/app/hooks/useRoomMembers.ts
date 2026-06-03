import type { MatrixClient, MatrixEvent, RoomMember } from '$types/matrix-sdk';
import { EventType, RoomMemberEvent, RoomStateEvent } from '$types/matrix-sdk';
import { useEffect, useRef, useState } from 'react';

// Track which rooms have already loaded members to prevent redundant API calls (SABLE-1C fix)
const loadedRooms = new Set<string>();

export const useRoomMembers = (mx: MatrixClient, roomId: string): RoomMember[] => {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const loadInitiatedRef = useRef(false);

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

      // Only load members if we haven't already loaded them for this room
      // Fixes N+1 issue where every component mount triggers a /members API call
      const alreadyLoaded = loadedRooms.has(roomId);
      if (!alreadyLoaded && !loadInitiatedRef.current) {
        loadInitiatedRef.current = true;
        room
          .loadMembersIfNeeded()
          .then(() => {
            loadedRooms.add(roomId);
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
