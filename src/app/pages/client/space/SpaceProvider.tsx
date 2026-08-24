import type { ReactNode } from 'react';
import { Spinner } from 'folds';
import { useParams } from 'react-router';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useResolvedSelectedSpace } from '$hooks/router/useResolvedRoomId';
import { SpaceProvider } from '$hooks/useSpace';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';

type RouteSpaceProviderProps = {
  children: ReactNode;
};
export function RouteSpaceProvider({ children }: RouteSpaceProviderProps) {
  const mx = useMatrixClient();
  const allRooms = useAtomValue(allRoomsAtom);

  const { spaceIdOrAlias: encodedSpaceIdOrAlias } = useParams();
  const spaceIdOrAlias = encodedSpaceIdOrAlias && decodeURIComponent(encodedSpaceIdOrAlias);
  const viaServers = useSearchParamsViaServers();

  const { roomId: selectedSpaceId, resolving } = useResolvedSelectedSpace();
  const space = mx.getRoom(selectedSpaceId);

  if (resolving) return <Spinner variant="Secondary" size="600" />;

  if (!space || !allRooms.includes(space.roomId)) {
    return <JoinBeforeNavigate roomIdOrAlias={spaceIdOrAlias ?? ''} viaServers={viaServers} />;
  }

  return <SpaceProvider value={space}>{children}</SpaceProvider>;
}
