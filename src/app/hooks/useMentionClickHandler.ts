import { type ReactEventHandler, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isRoomId, isUserId } from '$utils/matrix';
import { getHomeRoomPath, withSearchParam } from '$pages/pathUtils';
import { type RoomSearchParams } from '$pages/paths';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useMatrixClient } from './useMatrixClient';
import { useRoomNavigate } from './useRoomNavigate';
import { useSpaceOptionally } from './useSpace';

export const useMentionClickHandler = (roomId: string): ReactEventHandler<HTMLElement> => {
  const mx = useMatrixClient();
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const navigate = useNavigate();
  const openProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();

  const handleClick: ReactEventHandler<HTMLElement> = useCallback(
    (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      const target = evt.currentTarget;
      const mentionId = target.getAttribute('data-mention-id');
      if (typeof mentionId !== 'string') return;

      if (isUserId(mentionId)) {
        openProfile(roomId, space?.roomId, mentionId, target.getBoundingClientRect());
        return;
      }

      const eventId = target.getAttribute('data-mention-event-id') || undefined;
      if (isRoomId(mentionId) && mx.getRoom(mentionId)) {
        if (mx.getRoom(mentionId)?.isSpaceRoom()) navigateSpace(mentionId);
        else navigateRoom(mentionId, eventId);
        return;
      }

      const viaServers = target.getAttribute('data-mention-via') || undefined;
      const path = getHomeRoomPath(mentionId, eventId);

      navigate(viaServers ? withSearchParam<RoomSearchParams>(path, { viaServers }) : path);
    },
    [mx, navigate, navigateRoom, navigateSpace, roomId, space, openProfile]
  );

  return handleClick;
};
