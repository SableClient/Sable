import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';
import { useHomeRooms } from './useHomeRooms';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

export function HomeRouteRoomProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  const [isShowingAllRoomsInHome] = useSetting(settingsAtom, 'isShowingAllRoomsInHome');
  const rooms = useHomeRooms();

  const { roomIdOrAlias: encodedRoomIdOrAlias, eventId: encodedEventId } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const eventId = encodedEventId && decodeURIComponent(encodedEventId);
  const viaServers = useSearchParamsViaServers();
  const roomId = useSelectedRoom();
  const room = mx.getRoom(roomId);

  if (!room || (!isShowingAllRoomsInHome && !rooms.includes(room.roomId))) {
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
