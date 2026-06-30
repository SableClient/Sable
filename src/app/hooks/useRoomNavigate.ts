import { useCallback } from 'react';
import type { NavigateOptions } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import {
  getDirectRoomPath,
  getDirectForumPath,
  getHomeRoomPath,
  getHomeForumPath,
  getSpacePath,
  getSpaceRoomPath,
  getSpaceForumPath,
} from '$pages/pathUtils';
import { getOrphanParents, guessPerfectParent } from '$utils/room';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useSelectedSpace } from './router/useSelectedSpace';
import { useMatrixClient } from './useMatrixClient';
import { CustomRoomType } from '$types/matrix/room';

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
      const isForum = mx.getRoom(roomId)?.getType() === CustomRoomType.Forum;

      const orphanParents = openSpaceTimeline ? [roomId] : getOrphanParents(roomToParents, roomId);
      if (orphanParents.length > 0) {
        let parentSpace: string;
        if (spaceSelectedId && orphanParents.includes(spaceSelectedId)) {
          parentSpace = spaceSelectedId;
        } else {
          parentSpace = guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0] ?? roomId;
        }

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);

        if (isForum && !openSpaceTimeline) {
          navigate(getSpaceForumPath(pSpaceIdOrAlias, roomIdOrAlias), opts);
        } else {
          navigate(
            getSpaceRoomPath(pSpaceIdOrAlias, openSpaceTimeline ? roomId : roomIdOrAlias, eventId),
            opts
          );
        }
        return;
      }

      if (mDirects.has(roomId)) {
        if (isForum) {
          navigate(getDirectForumPath(roomIdOrAlias), opts);
        } else {
          navigate(getDirectRoomPath(roomIdOrAlias, eventId), opts);
        }
        return;
      }

      if (isForum) {
        navigate(getHomeForumPath(roomIdOrAlias), opts);
      } else {
        navigate(getHomeRoomPath(roomIdOrAlias, eventId), opts);
      }
    },
    [mx, navigate, spaceSelectedId, roomToParents, mDirects, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
