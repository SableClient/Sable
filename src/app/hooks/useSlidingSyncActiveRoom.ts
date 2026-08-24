import { useCallback, useEffect, useState } from 'react';
import { matchPath, useLocation } from 'react-router';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { getSlidingSyncManager } from '$client/initMatrix';
import { useResolvedRoomIdOrAlias } from '$hooks/router/useResolvedRoomId';
import { useSpaces } from '$state/hooks/roomList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { getGlobalImagePackRoomIds } from '$plugins/custom-emoji';
import { ClientEvent } from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import {
  DIRECT_ROOM_PATH,
  DIRECT_ROOM_FORUM_PATH,
  HOME_ROOM_PATH,
  HOME_ROOM_FORUM_PATH,
  SPACE_LOBBY_PATH,
  SPACE_PATH,
  SPACE_ROOM_PATH,
  SPACE_ROOM_FORUM_PATH,
  SPACE_SEARCH_PATH,
} from '$pages/paths';
import { isRoomAlias, isRoomId } from '$utils/matrix';

type RouteRoomRefs = {
  roomIdOrAlias?: string;
  spaceIdOrAlias?: string;
};

const decodeRoomRef = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const decoded = decodeURIComponent(value);
  return isRoomId(decoded) || isRoomAlias(decoded) ? decoded : undefined;
};

const getRouteRoomRefs = (pathname: string): RouteRoomRefs => {
  const homeRoomMatch =
    matchPath(HOME_ROOM_FORUM_PATH, pathname) ?? matchPath(HOME_ROOM_PATH, pathname);
  const directRoomMatch =
    matchPath(DIRECT_ROOM_FORUM_PATH, pathname) ?? matchPath(DIRECT_ROOM_PATH, pathname);
  const nonSpaceRoomMatch = homeRoomMatch ?? directRoomMatch;
  if (nonSpaceRoomMatch) {
    return { roomIdOrAlias: decodeRoomRef(nonSpaceRoomMatch.params.roomIdOrAlias) };
  }

  const spaceRoomMatch =
    matchPath(SPACE_ROOM_FORUM_PATH, pathname) ?? matchPath(SPACE_ROOM_PATH, pathname);
  if (spaceRoomMatch) {
    return {
      roomIdOrAlias: decodeRoomRef(spaceRoomMatch.params.roomIdOrAlias),
      spaceIdOrAlias: decodeRoomRef(spaceRoomMatch.params.spaceIdOrAlias),
    };
  }

  const spaceMatch =
    matchPath(SPACE_LOBBY_PATH, pathname) ??
    matchPath(SPACE_SEARCH_PATH, pathname) ??
    matchPath(SPACE_PATH, pathname);
  return { spaceIdOrAlias: decodeRoomRef(spaceMatch?.params.spaceIdOrAlias) };
};

const useAvailableSlidingSyncManager = () => {
  const mx = useMatrixClient();
  const [manager, setManager] = useState(() => getSlidingSyncManager(mx));

  useEffect(() => {
    if (manager) return undefined;

    const checkForManager = () => {
      const nextManager = getSlidingSyncManager(mx);
      if (nextManager) setManager(nextManager);
    };

    const retryId = globalThis.setTimeout(checkForManager, 0);
    mx.on(ClientEvent.Sync, checkForManager);
    return () => {
      globalThis.clearTimeout(retryId);
      mx.removeListener(ClientEvent.Sync, checkForManager);
    };
  }, [manager, mx]);

  return manager;
};

const useSlidingSyncRouteRooms = (): void => {
  const manager = useAvailableSlidingSyncManager();
  const { pathname } = useLocation();
  const { roomIdOrAlias, spaceIdOrAlias } = getRouteRoomRefs(pathname);
  const { roomId, resolving: resolvingRoom } = useResolvedRoomIdOrAlias(roomIdOrAlias);
  const { roomId: spaceId, resolving: resolvingSpace } = useResolvedRoomIdOrAlias(spaceIdOrAlias);

  useEffect(() => {
    if (!manager || resolvingRoom || resolvingSpace) return undefined;

    const activeRoomIds = [...new Set([spaceId, roomId].filter(Boolean))] as string[];
    manager.setActiveRoomSubscriptions(activeRoomIds);

    return undefined;
  }, [manager, resolvingRoom, resolvingSpace, roomId, spaceId]);

  useEffect(() => {
    if (!manager) return undefined;
    return () => manager.setActiveRoomSubscriptions([]);
  }, [manager]);
};

const useSlidingSyncSpaceSubscriptions = (): void => {
  const manager = useAvailableSlidingSyncManager();
  const mx = useMatrixClient();
  const spaces = useSpaces(mx, allRoomsAtom);

  useEffect(() => {
    if (!manager) return undefined;
    manager.setSpaceSubscriptions(spaces);
    return undefined;
  }, [manager, spaces]);
};

// Subscribe pack rooms before the emoji board first opens so their
// pack state is already available.
const useSlidingSyncImagePackSubscriptions = (): void => {
  const manager = useAvailableSlidingSyncManager();
  const mx = useMatrixClient();

  useEffect(() => {
    if (!manager) return undefined;
    manager.setImagePackSubscriptions(getGlobalImagePackRoomIds(mx));
    return undefined;
  }, [manager, mx]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getType() === (CustomAccountDataEvent.ImagePackRooms as string) ||
          mEvent.getType() === (CustomAccountDataEvent.PoniesEmoteRooms as string)
        ) {
          manager?.setImagePackSubscriptions(getGlobalImagePackRoomIds(mx));
        }
      },
      [manager, mx]
    )
  );
};

export const useSlidingSyncRoomLoading = (roomId: string): boolean => {
  const manager = useAvailableSlidingSyncManager();
  const [loading, setLoading] = useState(() => manager?.isRoomSubscriptionLoading(roomId) ?? false);

  useEffect(() => {
    if (!manager) {
      setLoading(false);
      return undefined;
    }

    return manager.onRoomSubscriptionStatus(roomId, setLoading);
  }, [manager, roomId]);

  return loading;
};

export const useSlidingSyncActiveRoom = (): void => {
  useSlidingSyncRouteRooms();
  useSlidingSyncSpaceSubscriptions();
  useSlidingSyncImagePackSubscriptions();
};
