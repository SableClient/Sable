import { type ReactNode, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSpace } from '$hooks/useSpace';
import { getAllParents, getRoomToParents, getSpaceChildren } from '$utils/room';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';
import { mDirectAtom } from '$state/mDirectList';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { isRoom } from '$utils/room';

export function SpaceRouteRoomProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  const space = useSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const [roomToParents, setRoomToParents] = useAtom(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useAtomValue(allRoomsAtom);

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const eventId = encodedEventId && decodeURIComponent(encodedEventId);
  const viaServers = useSearchParamsViaServers();
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);
  const liveRoomToParents = getRoomToParents(mx);
  const isJoinedRoom = room?.getMyMembership() === 'join';
  const isKnownJoinedRoom = !!room && allRooms.includes(room.roomId);
  const cachedDirectParentSpace = !!room && roomToParents.get(room.roomId)?.has(space.roomId);
  const liveDirectParentSpace = !!room && liveRoomToParents.get(room.roomId)?.has(space.roomId);
  const hasAnyParentSpace = !!room && getAllParents(roomToParents, room.roomId).has(space.roomId);
  const hasLiveParentSpace =
    !!room && getAllParents(liveRoomToParents, room.roomId).has(space.roomId);
  const isDirectSpaceChild = !!room && getSpaceChildren(space).includes(room.roomId);
  const canRenderSpaceRoom =
    !!room &&
    (isRoom(room) || (developerTools && room.isSpaceRoom() && room.roomId === space.roomId));

  useEffect(() => {
    if (!room) return;
    if (!isDirectSpaceChild && !liveDirectParentSpace) return;
    if (cachedDirectParentSpace) return;

    setRoomToParents({
      type: 'PUT',
      parent: space.roomId,
      children: [room.roomId],
    });
  }, [
    cachedDirectParentSpace,
    isDirectSpaceChild,
    liveDirectParentSpace,
    room,
    setRoomToParents,
    space.roomId,
  ]);

  if (!room || !isJoinedRoom || !canRenderSpaceRoom) {
    // room is not joined
    return (
      <JoinBeforeNavigate
        roomIdOrAlias={roomIdOrAlias!}
        eventId={eventId}
        viaServers={viaServers}
      />
    );
  }

  if (developerTools && room.isSpaceRoom() && room.roomId === space.roomId) {
    // allow to view space timeline
    return (
      <RoomProvider key={room.roomId} value={room}>
        <IsDirectRoomProvider value={mDirects.has(room.roomId)}>{children}</IsDirectRoomProvider>
      </RoomProvider>
    );
  }

  if (!isKnownJoinedRoom && (liveDirectParentSpace || (hasLiveParentSpace && hasAnyParentSpace))) {
    return (
      <RoomProvider key={room.roomId} value={room}>
        <IsDirectRoomProvider value={mDirects.has(room.roomId)}>{children}</IsDirectRoomProvider>
      </RoomProvider>
    );
  }

  if (!getAllParents(roomToParents, room.roomId).has(space.roomId)) {
    if (isDirectSpaceChild || liveDirectParentSpace) {
      return (
        <RoomProvider key={room.roomId} value={room}>
          <IsDirectRoomProvider value={mDirects.has(room.roomId)}>{children}</IsDirectRoomProvider>
        </RoomProvider>
      );
    }

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
      <IsDirectRoomProvider value={mDirects.has(room.roomId)}>{children}</IsDirectRoomProvider>
    </RoomProvider>
  );
}
