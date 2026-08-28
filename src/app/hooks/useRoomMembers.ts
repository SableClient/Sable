import type { MatrixClient, MatrixEvent, RoomMember } from '$types/matrix-sdk';
import { ClientEvent, RoomMemberEvent } from '$types/matrix-sdk';
import { useEffect, useState } from 'react';
import { hydrateAllRoomMembers } from '$client/roomMemberHydration';

const MAX_EAGER_MEMBER_COUNT = 1_000;

const sameRoster = (prev: RoomMember[], next: RoomMember[]): boolean =>
  prev.length === next.length &&
  prev.every((member, index) => {
    const other = next[index];
    return (
      !!other &&
      member.userId === other.userId &&
      member.membership === other.membership &&
      member.powerLevel === other.powerLevel
    );
  });

export const useRoomMembers = (mx: MatrixClient, roomId: string, enabled = true): RoomMember[] => {
  const [members, setMembers] = useState<RoomMember[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMembers([]);
      return undefined;
    }

    const room = mx.getRoom(roomId);
    let disposed = false;
    const canEagerlyLoadRoster = !!room && room.getJoinedMemberCount() <= MAX_EAGER_MEMBER_COUNT;

    const updateMemberList = (event?: MatrixEvent) => {
      if (!room || disposed || (event && event.getRoomId() !== roomId)) return;
      const next = room.getMembers();
      setMembers((prev) => (sameRoster(prev, next) ? prev : next));
    };

    // A failed SDK member load must not trigger the direct roster fallback:
    // classic sync already owns retries.
    let refillAllowed = false;
    const refillRoster = () => {
      if (
        !room ||
        disposed ||
        !canEagerlyLoadRoster ||
        room.getJoinedMemberCount() > MAX_EAGER_MEMBER_COUNT ||
        !refillAllowed
      )
        return;
      void hydrateAllRoomMembers(mx, roomId).then(() => updateMemberList());
    };

    if (room) {
      setMembers(room.getMembers());
      // Keep the lazy-loaded roster in large rooms: requesting all member state
      // can make the client unresponsive before the virtualized drawer renders.
      if (canEagerlyLoadRoster) {
        // Sliding sync may retain an incomplete member set. Do not let its SDK
        // request block incoming membership updates.
        void room.loadMembersIfNeeded().then(
          () => {
            refillAllowed = true;
            updateMemberList();
            refillRoster();
          },
          () => updateMemberList()
        );
      }
    }

    mx.on(RoomMemberEvent.Membership, updateMemberList);
    mx.on(RoomMemberEvent.PowerLevel, updateMemberList);
    // joined_count can rise after mount and emits no event of its own.
    mx.on(ClientEvent.Sync, refillRoster);
    return () => {
      disposed = true;
      mx.removeListener(RoomMemberEvent.Membership, updateMemberList);
      mx.removeListener(RoomMemberEvent.PowerLevel, updateMemberList);
      mx.removeListener(ClientEvent.Sync, refillRoster);
    };
  }, [enabled, mx, roomId]);

  return members;
};
