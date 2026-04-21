import type { ReactEventHandler } from 'react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isRoomId, isUserId } from '$utils/matrix';
import { getHomeRoomPath, withSearchParam } from '$pages/pathUtils';
import { isSettingsSectionId } from '$features/settings/routes';
import { normalizeSettingsFocusId } from '$features/settings/settingsLink';
import { useOpenSettings } from '$features/settings/useOpenSettings';
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
  const openSettings = useOpenSettings();

  const handleClick: ReactEventHandler<HTMLElement> = useCallback(
    (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      const target = evt.currentTarget;
      const settingsSection = target.getAttribute('data-settings-link-section') || undefined;
      if (isSettingsSectionId(settingsSection)) {
        const settingsFocus = normalizeSettingsFocusId(
          target.getAttribute('data-settings-link-focus') || undefined
        );
        openSettings(settingsSection, settingsFocus);
        return;
      }

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

      navigate(viaServers ? withSearchParam(path, { viaServers }) : path);
    },
    [mx, navigate, navigateRoom, navigateSpace, openProfile, openSettings, roomId, space]
  );

  return handleClick;
};
