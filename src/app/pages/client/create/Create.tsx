import { useSearchParams, useNavigate } from 'react-router-dom';
import { FormPage } from '$components/page/FormPage';
import { CreateSpaceForm } from '$features/create-space';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { SpaceProvider } from '$hooks/useSpace';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';

export function Create() {
  const { navigateSpace } = useRoomNavigate();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('spaceId') ?? undefined;

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  return (
    <FormPage
      title="Create Space"
      subTitle="Build a space for your community."
      closeLabel="Close create space"
      onClose={() => navigate(-1)}
    >
      <SpaceProvider value={space ?? null}>
        <CreateSpaceForm space={space} onCreate={navigateSpace} />
      </SpaceProvider>
    </FormPage>
  );
}
