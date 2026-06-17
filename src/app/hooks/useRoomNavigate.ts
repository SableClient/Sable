import { useCallback } from 'react';
import type { NavigateOptions } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import {
  getDirectRoomPath,
  getHomeRoomPath,
  getSpacePath,
  getSpaceRoomPath,
} from '$pages/pathUtils';
import { getShallowParents, guessPerfectParent } from '$utils/room';
import { beginRoomNavigation, beginSpaceNavigation } from '$utils/perfTelemetry';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { getSlidingSyncManager } from '$client/initMatrix';
import { useSelectedSpace } from './router/useSelectedSpace';
import { useMatrixClient } from './useMatrixClient';

export const useRoomNavigate = () => {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const spaceSelectedId = useSelectedSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  const navigateSpace = useCallback(
    (roomId: string) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      beginSpaceNavigation(roomId, 'space');
      getSlidingSyncManager(mx)?.setSpaceScope(roomId);
      navigate(getSpacePath(roomIdOrAlias));
    },
    [mx, navigate]
  );

  const navigateRoom = useCallback(
    (roomId: string, eventId?: string, opts?: NavigateOptions) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      const slidingSyncManager = getSlidingSyncManager(mx);

      // DM rooms always navigate to /direct, regardless of space membership.
      if (mDirects.has(roomId)) {
        beginRoomNavigation(roomId, 'dm');
        slidingSyncManager?.prefetchRoom(roomId);
        navigate(getDirectRoomPath(roomIdOrAlias, eventId), opts);
        return;
      }

      const openSpaceTimeline = developerTools && spaceSelectedId === roomId;

      const shallowParents = openSpaceTimeline
        ? [roomId]
        : getShallowParents(roomToParents, roomId);
      if (shallowParents.length > 0) {
        let parentSpace: string;
        if (spaceSelectedId && shallowParents.includes(spaceSelectedId)) {
          parentSpace = spaceSelectedId;
        } else {
          parentSpace =
            guessPerfectParent(mx, roomId, shallowParents) ?? shallowParents[0] ?? roomId;
        }

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);
        beginSpaceNavigation(parentSpace, 'room');
        beginRoomNavigation(roomId, 'space');
        slidingSyncManager?.setSpaceScope(parentSpace);
        slidingSyncManager?.prefetchRoom(roomId);

        navigate(
          getSpaceRoomPath(pSpaceIdOrAlias, openSpaceTimeline ? roomId : roomIdOrAlias, eventId),
          opts
        );
        return;
      }

      beginRoomNavigation(roomId, 'home');
      slidingSyncManager?.prefetchRoom(roomId);
      navigate(getHomeRoomPath(roomIdOrAlias, eventId), opts);
    },
    [mx, navigate, spaceSelectedId, roomToParents, mDirects, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
