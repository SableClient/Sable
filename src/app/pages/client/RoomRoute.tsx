import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ForumView } from '$features/forum';
import { Room } from '$features/room';
import { useRoom } from '$hooks/useRoom';
import {
  getDirectForumPath,
  getDirectRoomPath,
  getHomeForumPath,
  getHomeRoomPath,
  getSpaceForumPath,
  getSpaceRoomPath,
} from '$pages/pathUtils';
import { ROOM_TIMELINE_SEARCH_PARAM } from '$pages/paths';
import { CustomRoomType } from '$types/matrix/room';

export type RoomRouteSection = 'home' | 'direct' | 'space';

type RoomGateProps = {
  section: RoomRouteSection;
  /** Which view the current route shows: forum or timeline. */
  forum: boolean;
  roomIdOrAlias?: string;
  spaceIdOrAlias?: string;
  eventId?: string;
};

/** Renders the view matching the room type, redirecting when the route shows the other one. */
export function RoomGate({
  section,
  forum,
  roomIdOrAlias,
  spaceIdOrAlias,
  eventId,
}: RoomGateProps) {
  const room = useRoom();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Lets the developer tools open a forum room's timeline without being redirected back.
  const timelineRequested = !forum && searchParams.get(ROOM_TIMELINE_SEARCH_PARAM) === 'true';
  const isForum = room.getType() === CustomRoomType.Forum && !timelineRequested;

  useEffect(() => {
    if (isForum === forum) return;

    if (!roomIdOrAlias) return;

    let path: string;
    if (section === 'space') {
      if (!spaceIdOrAlias) return;
      path = isForum
        ? getSpaceForumPath(spaceIdOrAlias, roomIdOrAlias, eventId)
        : getSpaceRoomPath(spaceIdOrAlias, roomIdOrAlias, eventId);
    } else if (section === 'direct') {
      path = isForum
        ? getDirectForumPath(roomIdOrAlias, eventId)
        : getDirectRoomPath(roomIdOrAlias, eventId);
    } else {
      path = isForum
        ? getHomeForumPath(roomIdOrAlias, eventId)
        : getHomeRoomPath(roomIdOrAlias, eventId);
    }

    navigate(path, { replace: true });
  }, [eventId, forum, isForum, navigate, roomIdOrAlias, section, spaceIdOrAlias]);

  if (isForum !== forum) return null;
  return forum ? <ForumView /> : <Room />;
}

type RoomRouteProps = {
  section: RoomRouteSection;
  forum: boolean;
};

const decodeParam = (value: string | undefined): string | undefined =>
  value ? decodeURIComponent(value) : undefined;

export function RoomRoute({ section, forum }: RoomRouteProps) {
  const { roomIdOrAlias, spaceIdOrAlias, eventId } = useParams();
  return (
    <RoomGate
      section={section}
      forum={forum}
      roomIdOrAlias={decodeParam(roomIdOrAlias)}
      spaceIdOrAlias={decodeParam(spaceIdOrAlias)}
      eventId={decodeParam(eventId)}
    />
  );
}
