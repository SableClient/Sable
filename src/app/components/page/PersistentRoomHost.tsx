import type { ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Room } from '$features/room';
import { IsInactivePanelProvider } from '$hooks/useRoom';
import { HomeRouteRoomProvider } from '$pages/client/home';
import { DirectRouteRoomProvider } from '$pages/client/direct';
import { SpaceRouteRoomProvider } from '$pages/client/space';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { resolveSection, type SectionNav } from '$pages/pathUtils';
import { HOME_ROOM_PATH, DIRECT_ROOM_PATH, SPACE_ROOM_PATH } from '$pages/paths';
import { isRoomAlias, isRoomId } from '$utils/matrix';

type DisplayedRoom = {
  roomIdOrAlias: string;
  eventId?: string;
};

function useDisplayedRoom(section: SectionNav | null): DisplayedRoom | undefined {
  const location = useLocation();
  const lastRoom = useAtomValue(lastVisitedRoomAtom);

  if (!section || !section.getRoomPath) return undefined;

  const roomMatch =
    matchPath({ path: HOME_ROOM_PATH, end: false }, location.pathname) ??
    matchPath({ path: DIRECT_ROOM_PATH, end: false }, location.pathname) ??
    matchPath({ path: SPACE_ROOM_PATH, end: false }, location.pathname);

  if (roomMatch) {
    const encodedId = roomMatch.params.roomIdOrAlias;
    const encodedEvent = roomMatch.params.eventId;
    if (encodedId) {
      const decodedId = decodeURIComponent(encodedId);
      // `:roomIdOrAlias` also matches non-room segments like `create`, `search`, `lobby`.
      // Only treat it as a room when it's a real Matrix id/alias.
      if (isRoomId(decodedId) || isRoomAlias(decodedId)) {
        return {
          roomIdOrAlias: decodedId,
          eventId: encodedEvent ? decodeURIComponent(encodedEvent) : undefined,
        };
      }
    }
  }

  const lastRoomId = lastRoom?.[section.key];
  if (lastRoomId) {
    return { roomIdOrAlias: lastRoomId };
  }

  return undefined;
}

export function PersistentRoomHost({ inactive }: { inactive: boolean }) {
  const location = useLocation();
  const section = resolveSection(location.pathname);
  const displayed = useDisplayedRoom(section);

  if (!displayed) return null;

  const roomNode = <Room />;

  let hosted: ReactNode = null;
  if (section?.key === 'home') {
    hosted = (
      <HomeRouteRoomProvider roomIdOrAlias={displayed.roomIdOrAlias} eventId={displayed.eventId}>
        {roomNode}
      </HomeRouteRoomProvider>
    );
  } else if (section?.key === 'direct') {
    hosted = (
      <DirectRouteRoomProvider roomIdOrAlias={displayed.roomIdOrAlias} eventId={displayed.eventId}>
        {roomNode}
      </DirectRouteRoomProvider>
    );
  } else if (section?.key.startsWith('space:')) {
    hosted = (
      <SpaceRouteRoomProvider roomIdOrAlias={displayed.roomIdOrAlias} eventId={displayed.eventId}>
        {roomNode}
      </SpaceRouteRoomProvider>
    );
  }

  if (!hosted) return null;

  return <IsInactivePanelProvider value={inactive}>{hosted}</IsInactivePanelProvider>;
}
