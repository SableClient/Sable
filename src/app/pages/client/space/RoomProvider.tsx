import type { ReactNode } from 'react';
import { Spinner } from 'folds';
import { useParams } from 'react-router';
import { useAtom, useAtomValue } from 'jotai';
import { useResolvedRoomIdOrAlias } from '$hooks/router/useResolvedRoomId';
import { IsDirectRoomProvider, DisplayedEventIdProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSpace } from '$hooks/useSpace';
import { getAllParents, getSpaceChildren } from '$utils/room/hierarchy';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';
import { mDirectAtom } from '$state/mDirectList';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';

export function SpaceRouteRoomProvider({
  roomIdOrAlias: roomIdOrAliasProp,
  eventId: eventIdProp,
  children,
}: {
  roomIdOrAlias?: string;
  eventId?: string;
  children: ReactNode;
}) {
  const mx = useMatrixClient();
  const space = useSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const [roomToParents, setRoomToParents] = useAtom(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useAtomValue(allRoomsAtom);

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias =
    roomIdOrAliasProp ?? (encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias));
  const eventId = eventIdProp ?? (encodedEventId && decodeURIComponent(encodedEventId));
  const viaServers = useSearchParamsViaServers();
  const { roomId, resolving } = useResolvedRoomIdOrAlias(roomIdOrAlias);
  const room = mx.getRoom(roomId);

  if (resolving) return <Spinner variant="Secondary" size="600" />;

  if (!room || !allRooms.includes(room.roomId)) {
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
        <IsDirectRoomProvider value={mDirects.has(room.roomId)}>
          <DisplayedEventIdProvider value={eventId}>{children}</DisplayedEventIdProvider>
        </IsDirectRoomProvider>
      </RoomProvider>
    );
  }

  if (!getAllParents(roomToParents, room.roomId).has(space.roomId)) {
    if (getSpaceChildren(space).includes(room.roomId)) {
      // fill missing roomToParent mapping
      setRoomToParents({
        type: 'PUT',
        parent: space.roomId,
        children: [room.roomId],
      });
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
      <IsDirectRoomProvider value={mDirects.has(room.roomId)}>
        <DisplayedEventIdProvider value={eventId}>{children}</DisplayedEventIdProvider>
      </IsDirectRoomProvider>
    </RoomProvider>
  );
}
