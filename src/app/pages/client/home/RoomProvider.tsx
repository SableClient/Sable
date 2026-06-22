import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';
import { EventType } from '$types/matrix-sdk';
import { getAccountData, getAllParents, getMDirects, getStateEvents, isRoom } from '$utils/room';
import { roomToParentsAtom, roomToParentsReadyAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { useHomeRooms } from './useHomeRooms';

export function HomeRouteRoomProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  useHomeRooms();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const roomToParentsReady = useAtomValue(roomToParentsReadyAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const eventId = encodedEventId && decodeURIComponent(encodedEventId);
  const viaServers = useSearchParamsViaServers();
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);
  const isJoinedRoom = room?.getMyMembership() === 'join';
  const cachedParentSpaceIds = room ? getAllParents(roomToParents, room.roomId) : new Set<string>();
  const liveParentSpaceIds = new Set(
    room
      ? getStateEvents(room, EventType.SpaceParent)
          .map((event) => event.getStateKey())
          .filter((parentId): parentId is string => typeof parentId === 'string')
      : []
  );
  const liveDirectEvent = getAccountData(mx, EventType.Direct);
  const liveDirects = liveDirectEvent ? getMDirects(liveDirectEvent) : undefined;
  const isLiveDirectRoom = !!room && liveDirects?.has(room.roomId);
  const isHomeClassificationPending =
    !!room &&
    isJoinedRoom &&
    !roomToParentsReady &&
    cachedParentSpaceIds.size === 0 &&
    liveParentSpaceIds.size === 0 &&
    liveDirects === undefined;
  const isLiveHomeRoom =
    !!room &&
    isRoom(room) &&
    !mDirects.has(room.roomId) &&
    !isLiveDirectRoom &&
    cachedParentSpaceIds.size === 0 &&
    (roomToParentsReady || liveParentSpaceIds.size === 0);

  if (isHomeClassificationPending) {
    return null;
  }

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
