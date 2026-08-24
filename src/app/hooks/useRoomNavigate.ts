import { useCallback } from 'react';
import type { NavigateOptions } from 'react-router';
import { useNavigate } from 'react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import {
  getDirectForumPath,
  getDirectRoomPath,
  getHomeForumPath,
  getHomeRoomPath,
  getSpaceForumPath,
  getSpacePath,
  getSpaceRoomPath,
  resolveSection,
} from '$pages/pathUtils';
import { CustomRoomType } from '$types/matrix/room';
import { getOrphanParents, guessPerfectParent } from '$utils/room/hierarchy';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
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
  const setLastRoom = useSetAtom(lastVisitedRoomAtom);

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
      let destPath: string;
      let roomPart: string;
      if (orphanParents.length > 0) {
        let parentSpace: string;
        if (spaceSelectedId && orphanParents.includes(spaceSelectedId)) {
          parentSpace = spaceSelectedId;
        } else {
          parentSpace = guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0] ?? roomId;
        }

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);
        roomPart = openSpaceTimeline ? roomId : roomIdOrAlias;
        destPath = isForum
          ? getSpaceForumPath(pSpaceIdOrAlias, roomPart, eventId)
          : getSpaceRoomPath(pSpaceIdOrAlias, roomPart, eventId);
      } else if (mDirects.has(roomId)) {
        roomPart = roomIdOrAlias;
        destPath = isForum
          ? getDirectForumPath(roomPart, eventId)
          : getDirectRoomPath(roomPart, eventId);
      } else {
        roomPart = roomIdOrAlias;
        destPath = isForum
          ? getHomeForumPath(roomPart, eventId)
          : getHomeRoomPath(roomPart, eventId);
      }

      const section = resolveSection(destPath);
      if (section?.getRoomPath) {
        setLastRoom((prev) => ({ ...prev, [section.key]: roomPart }));
      }

      navigate(destPath, opts);
    },
    [mx, navigate, spaceSelectedId, roomToParents, mDirects, developerTools, setLastRoom]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
