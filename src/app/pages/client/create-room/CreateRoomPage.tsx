import { useSearchParams } from 'react-router';
import { RouteSurface } from '$components/page/RouteSurface';
import { CreateRoomType } from '$components/create-room/types';
import { CreateRoomForm } from '$features/create-room/CreateRoom';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { SpaceProvider } from '$hooks/useSpace';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';

export function CreateRoomPage() {
  const { navigateRoom } = useRoomNavigate();

  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('spaceId') ?? undefined;
  const typeParam = searchParams.get('type');
  const type =
    typeParam === CreateRoomType.TextRoom ||
    typeParam === CreateRoomType.VoiceRoom ||
    typeParam === CreateRoomType.ForumRoom
      ? typeParam
      : undefined;

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
        <CreateRoomForm space={space} onCreate={navigateRoom} defaultType={type} />
      </SpaceProvider>
    </RouteSurface>
  );
}
