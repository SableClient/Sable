import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';
import { getAllParents, isRoom } from '$utils/room';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { useHomeRooms } from './useHomeRooms';

export function HomeRouteRoomProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  useHomeRooms();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const eventId = encodedEventId && decodeURIComponent(encodedEventId);
  const viaServers = useSearchParamsViaServers();
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);
  const isJoinedRoom = room?.getMyMembership() === 'join';
  const cachedParentSpaceIds = room ? getAllParents(roomToParents, room.roomId) : new Set<string>();
  const isLiveHomeRoom =
    !!room && isRoom(room) && !mDirects.has(room.roomId) && cachedParentSpaceIds.size === 0;

  if (!room || !isJoinedRoom || !isLiveHomeRoom) {
    return (
      <JoinBeforeNavigate
        roomIdOrAlias={roomIdOrAlias!}
        eventId={eventId}
        viaServers={viaServers}
      />
    );
  }

  return (
    <RoomProvider key={room.roomId} value={room}>
      <IsDirectRoomProvider value={false}>{children}</IsDirectRoomProvider>
    </RoomProvider>
  );
}
