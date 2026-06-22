import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSpaces } from '$state/hooks/roomList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useSelectedSpace } from '$hooks/router/useSelectedSpace';
import { SpaceProvider } from '$hooks/useSpace';
import { JoinBeforeNavigate } from '$features/join-before-navigate';
import { useSearchParamsViaServers } from '$hooks/router/useSearchParamsViaServers';
import { isSpace } from '$utils/room';

type RouteSpaceProviderProps = {
  children: ReactNode;
};
export function RouteSpaceProvider({ children }: RouteSpaceProviderProps) {
  const mx = useMatrixClient();
  useSpaces(mx, allRoomsAtom);

  const { spaceIdOrAlias: encodedSpaceIdOrAlias } = useParams();
  const spaceIdOrAlias = encodedSpaceIdOrAlias && decodeURIComponent(encodedSpaceIdOrAlias);
  const viaServers = useSearchParamsViaServers();

  const selectedSpaceId = useSelectedSpace();
  const space = mx.getRoom(selectedSpaceId);
  const isJoinedSpace = space?.getMyMembership() === 'join';
  const isLiveSpace = !!space && isSpace(space);

  if (!space || !isJoinedSpace || !isLiveSpace) {
    return <JoinBeforeNavigate roomIdOrAlias={spaceIdOrAlias ?? ''} viaServers={viaServers} />;
  }

  return (
    <SpaceProvider key={space.roomId} value={space}>
      {children}
    </SpaceProvider>
  );
}
