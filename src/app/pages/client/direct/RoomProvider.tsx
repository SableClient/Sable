import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { buildNotificationBreadcrumb } from '$utils/notificationTelemetry';
import { useDirectRooms } from './useDirectRooms';

export function DirectRouteRoomProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  const rooms = useDirectRooms();

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const eventId = encodedEventId && decodeURIComponent(encodedEventId);
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);
  const isJoinedRoom = room?.getMyMembership() === 'join';
  const isKnownDirectRoom = !!room && rooms.includes(room.roomId);

  if (!room) {
    return <JoinBeforeNavigate roomIdOrAlias={roomIdOrAlias!} eventId={eventId} />;
  }

  if (!isKnownDirectRoom && isJoinedRoom) {
    Sentry.addBreadcrumb(
      buildNotificationBreadcrumb('restore', 'restore_direct_route_fallback_render', {
        room_id: room.roomId,
        room_id_or_alias: roomIdOrAlias,
        has_event_id: !!eventId,
      })
    );
  }

  if (!isKnownDirectRoom && !isJoinedRoom) {
    return <JoinBeforeNavigate roomIdOrAlias={roomIdOrAlias!} eventId={eventId} />;
  }

  return (
    <RoomProvider key={room.roomId} value={room}>
      <IsDirectRoomProvider value>{children}</IsDirectRoomProvider>
    </RoomProvider>
  );
}
