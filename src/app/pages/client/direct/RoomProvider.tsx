import type { ReactNode } from 'react';
import { Spinner } from 'folds';
import { useParams } from 'react-router';
import { useResolvedRoomIdOrAlias } from '$hooks/router/useResolvedRoomId';
import { IsDirectRoomProvider, DisplayedEventIdProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useDirectRooms } from './useDirectRooms';

export function DirectRouteRoomProvider({
  roomIdOrAlias: roomIdOrAliasProp,
  eventId: eventIdProp,
  children,
}: {
  roomIdOrAlias?: string;
  eventId?: string;
  children: ReactNode;
}) {
  const mx = useMatrixClient();
  const rooms = useDirectRooms();

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias =
    roomIdOrAliasProp ?? (encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias));
  const eventId = eventIdProp ?? (encodedEventId && decodeURIComponent(encodedEventId));
  const { roomId, resolving } = useResolvedRoomIdOrAlias(roomIdOrAlias);
  const room = mx.getRoom(roomId);

  if (resolving) return <Spinner variant="Secondary" size="600" />;

  if (!room || !rooms.includes(room.roomId)) {
    return <JoinBeforeNavigate roomIdOrAlias={roomIdOrAlias!} eventId={eventId} />;
  }

  return (
    <RoomProvider key={room.roomId} value={room}>
      <IsDirectRoomProvider value>
        <DisplayedEventIdProvider value={eventId}>{children}</DisplayedEventIdProvider>
      </IsDirectRoomProvider>
    </RoomProvider>
  );
}
