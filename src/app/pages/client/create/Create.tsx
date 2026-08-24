import { useSearchParams } from 'react-router';
import { RouteSurface } from '$components/page/RouteSurface';
import { CreateSpaceForm } from '$features/create-space';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { SpaceProvider } from '$hooks/useSpace';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';

export function Create() {
  const { navigateSpace } = useRoomNavigate();
  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('spaceId') ?? undefined;

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  return (
    <RouteSurface
      title="New Space"
      subTitle="Build a space for your community."
      closeLabel="Close create space"
    >
      <SpaceProvider value={space ?? null}>
        <CreateSpaceForm space={space} onCreate={navigateSpace} />
      </SpaceProvider>
    </RouteSurface>
  );
}
