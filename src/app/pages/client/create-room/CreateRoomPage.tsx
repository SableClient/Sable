import { useSearchParams, useNavigate } from 'react-router-dom';
import { FormPage } from '$components/page/FormPage';
import { CreateRoomForm } from '$features/create-room/CreateRoom';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { SpaceProvider } from '$hooks/useSpace';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { CreateRoomType } from '$components/create-room/types';

export function CreateRoomPage() {
  const { navigateRoom } = useRoomNavigate();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const spaceIdParam = searchParams.get('spaceId') ?? undefined;
  const typeParam = searchParams.get('type') ?? undefined;

  const type: CreateRoomType | undefined =
    typeParam === CreateRoomType.TextRoom || typeParam === CreateRoomType.VoiceRoom
      ? (typeParam as CreateRoomType)
      : undefined;

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceIdParam ? getRoom(spaceIdParam) : undefined;

  const title = type === CreateRoomType.VoiceRoom ? 'New Voice Room' : 'New Chat Room';

  return (
    <FormPage
      title={title}
      subTitle="Create a new room."
      closeLabel="Close create room"
      onClose={() => navigate(-1)}
    >
      <SpaceProvider value={space ?? null}>
        <CreateRoomForm space={space} onCreate={navigateRoom} defaultType={type} />
      </SpaceProvider>
    </FormPage>
  );
}
