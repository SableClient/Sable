import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAtomValue } from 'jotai';
import { Room } from '$features/room';
import { IsInactivePanelProvider } from '$hooks/useRoom';
import { HomeRouteRoomProvider } from '$pages/client/home';
import { DirectRouteRoomProvider } from '$pages/client/direct';
import { SpaceRouteRoomProvider } from '$pages/client/space';
import { RoomGate, type RoomRouteSection } from '$pages/client/RoomRoute';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { resolveSection, type SectionNav } from '$pages/pathUtils';
import { matchRoomRoute, type RoomRouteMatch } from '$pages/roomRouteMatch';

function useDisplayedRoom(
  section: SectionNav | null,
  roomRoute: RoomRouteMatch | undefined
): RoomRouteMatch | undefined {
  const lastRoom = useAtomValue(lastVisitedRoomAtom);

  if (!section || !section.getRoomPath) return undefined;

  if (roomRoute) return roomRoute;

  const lastRoomId = lastRoom?.[section.key];
  if (lastRoomId) {
    return { roomIdOrAlias: lastRoomId };
  }

  return undefined;
}

function sectionRoute(
  sectionKey: string
): { kind: RoomRouteSection; spaceIdOrAlias?: string } | undefined {
  if (sectionKey === 'home') return { kind: 'home' };
  if (sectionKey === 'direct') return { kind: 'direct' };
  if (sectionKey.startsWith('space:')) {
    return { kind: 'space', spaceIdOrAlias: sectionKey.slice('space:'.length) };
  }
  return undefined;
}

export function PersistentRoomHost({ inactive }: { inactive: boolean }) {
  const location = useLocation();
  const section = resolveSection(location.pathname);
  const roomRoute = matchRoomRoute(location.pathname);
  const displayed = useDisplayedRoom(section, roomRoute);

  if (!displayed) return null;

  // The gate redirects forum rooms opened on a timeline route; list preloads keep the plain timeline.
  const hostedSection = section ? sectionRoute(section.key) : undefined;
  const roomNode =
    roomRoute && hostedSection ? (
      <RoomGate
        section={hostedSection.kind}
        forum={false}
        roomIdOrAlias={displayed.roomIdOrAlias}
        spaceIdOrAlias={hostedSection.spaceIdOrAlias}
        eventId={displayed.eventId}
      />
    ) : (
      <Room />
    );

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
