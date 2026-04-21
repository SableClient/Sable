import { useCallback } from 'react';
import { NavigateOptions, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import {
  getDirectRoomPath,
  getHomeRoomPath,
  getSpacePath,
  getSpaceRoomPath,
} from '$pages/pathUtils';
import { getOrphanParents, guessPerfectParent } from '$utils/room';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
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
      navigate(getSpacePath(roomIdOrAlias));
    },
    [mx, navigate]
  );

  const navigateRoom = useCallback(
    (roomId: string, eventId?: string, opts?: NavigateOptions) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      const openSpaceTimeline = developerTools && spaceSelectedId === roomId;

      // Developer-mode: view the space's own timeline (must be checked first).
      if (openSpaceTimeline) {
        navigate(getSpaceRoomPath(roomIdOrAlias, roomId, eventId), opts);
        return;
      }

      // DMs take priority over space membership so direct chats always open
      // via the direct route, even when the room also belongs to a space.
      if (mDirects.has(roomId)) {
        navigate(getDirectRoomPath(roomIdOrAlias, eventId), opts);
        return;
      }

      const orphanParents = getOrphanParents(roomToParents, roomId);
      if (orphanParents.length > 0) {
        let parentSpace: string;
        if (spaceSelectedId && orphanParents.includes(spaceSelectedId)) {
          parentSpace = spaceSelectedId;
        } else {
          parentSpace = guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];
        }

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);

        navigate(getSpaceRoomPath(pSpaceIdOrAlias, roomIdOrAlias, eventId), opts);
        return;
      }

      navigate(getHomeRoomPath(roomIdOrAlias, eventId), opts);
    },
    [mx, navigate, spaceSelectedId, roomToParents, mDirects, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
