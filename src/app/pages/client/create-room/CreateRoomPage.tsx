import { useSearchParams } from 'react-router-dom';
import { RouteSurface } from '$components/page/RouteSurface';
import { CreateRoomForm } from '$features/create-room/CreateRoom';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { SpaceProvider } from '$hooks/useSpace';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';

export function CreateRoomPage() {
  const { navigateRoom } = useRoomNavigate();

  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('spaceId') ?? undefined;

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  return (
    <RouteSurface
      title="New Room"
      subTitle="Build a room for real-time conversations."
      closeLabel="Close create room"
    >
      <SpaceProvider value={space ?? null}>
        <CreateRoomForm space={space} onCreate={navigateRoom} />
      </SpaceProvider>
    </RouteSurface>
  );
}
