import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useSpaceOptionally } from '$hooks/useSpace';
import { getCanonicalAliasOrRoomId, isRoomAlias, removeRoomIdFromMDirect } from '$utils/matrix';
import { useRoomUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { markAsRead } from '$utils/notifications';
import { copyToClipboard } from '$utils/dom';
import { confirm } from '$components/confirm/confirm';
import { showToast } from '$state/toast';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { getMatrixToRoom } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { mDirectAtom } from '$state/mDirectList';
import { useRoomNavigate } from '$hooks/useRoomNavigate';

export function useRoomMenuActions(room: Room) {
  const mx = useMatrixClient();
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const mDirects = useAtomValue(mDirectAtom);
  const isDirectConversation = mDirects.has(room.roomId);

  const openSettingsFn = useOpenRoomSettings();
  const space = useSpaceOptionally();
  const { navigateRoom } = useRoomNavigate();

  const [invitePrompt, setInvitePrompt] = useState(false);
  const [directInvitePrompt, setDirectInvitePrompt] = useState(false);

  // Direct prompt's focus trap re-fires onCancel when it unmounts.
  const invitePromptRef = useRef(invitePrompt);
  invitePromptRef.current = invitePrompt;
  const cancelConsumedRef = useRef(false);

  const [convertState, convertToRoom] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await removeRoomIdFromMDirect(mx, room.roomId);
    }, [mx, room.roomId])
  );

  const handleMarkAsRead = useCallback(() => {
    markAsRead(mx, room.roomId, hideReads, true);
  }, [mx, room.roomId, hideReads]);

  const handleInvite = useCallback(() => {
    cancelConsumedRef.current = false;
    if (isDirectConversation) {
      setDirectInvitePrompt(true);
      return;
    }
    setInvitePrompt(true);
  }, [isDirectConversation]);

  const handleInviteDirect = useCallback(() => {
    setDirectInvitePrompt(false);
    setInvitePrompt(true);
  }, []);

  const handleDirectInviteCancel = useCallback((closeMenu: () => void) => {
    setDirectInvitePrompt(false);
    if (!invitePromptRef.current && !cancelConsumedRef.current) {
      cancelConsumedRef.current = true;
      closeMenu();
    }
  }, []);

  const handleConvertAndInvite = useCallback(() => {
    if (convertState.status === AsyncStatus.Loading) return;
    convertToRoom().catch(() => {});
  }, [convertState.status, convertToRoom]);

  useEffect(() => {
    if (convertState.status === AsyncStatus.Success) {
      setDirectInvitePrompt(false);
      setInvitePrompt(true);
    }
  }, [convertState.status]);

  const handleCopyLink = useCallback(() => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
  }, [mx, room]);

  const handleOpenSettings = useCallback(() => {
    openSettingsFn(room.roomId, space?.roomId);
  }, [openSettingsFn, room.roomId, space?.roomId]);

  /** Resolves true only when the room was actually left, so callers can keep the menu open otherwise. */
  const handleLeaveRoom = useCallback(async (): Promise<boolean> => {
    const ok = await confirm({
      title: 'Leave Room',
      description: 'Are you sure you want to leave this room?',
      action: 'Leave',
      variant: 'Critical',
    });
    if (!ok) return false;
    try {
      await mx.leave(room.roomId);
      return true;
    } catch (e) {
      showToast(`Failed to leave room: ${e instanceof Error ? e.message : 'unknown error'}`);
      return false;
    }
  }, [mx, room.roomId]);

  return {
    handleMarkAsRead,
    handleInvite,
    handleCopyLink,
    handleOpenSettings,
    handleLeaveRoom,
    canInvite,
    unread,
    invitePrompt,
    setInvitePrompt,
    directInvitePrompt,
    setDirectInvitePrompt,
    handleInviteDirect,
    handleDirectInviteCancel,
    handleConvertAndInvite,
    convertState,
    navigateRoom,
  };
}
