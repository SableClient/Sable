import { useMemo, useState, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { SyncState } from '$types/matrix-sdk';
import { useDirects } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { factoryRoomIdByActivity } from '$utils/sort';
import { useSyncState } from '$hooks/useSyncState';

/** Maximum number of individual DM avatars shown in the sidebar. */
export const MAX_SIDEBAR_DMS = 3;

/**
 * Returns the room IDs of DMs currently displayed as individual avatars in the
 * sidebar `DirectDMsList`.  These are the first `MAX_SIDEBAR_DMS` unread DMs
 * sorted by recent activity, available only after initial sync completes.
 *
 * Used by `DirectDMsList` to decide which rooms to render, and by `DirectTab`
 * to exclude those rooms from its own badge count (prevents double-badging).
 */
export const useSidebarDirectRoomIds = (): string[] => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const roomToUnread = useAtomValue(roomToUnreadAtom);

  const [syncReady, setSyncReady] = useState(false);

  useSyncState(
    mx,
    useCallback((state, prevState) => {
      if (state === SyncState.Syncing && prevState !== SyncState.Syncing) {
        setSyncReady(true);
      }
      if (state === SyncState.Syncing || state === SyncState.Catchup) {
        setSyncReady(true);
      }
    }, [])
  );

  return useMemo(() => {
    if (!syncReady) return [];

    const withUnread = directs.filter((roomId) => {
      const unread = roomToUnread.get(roomId);
      return unread && (unread.total > 0 || unread.highlight > 0);
    });

    const sorted = withUnread.sort(factoryRoomIdByActivity(mx));
    return sorted.slice(0, MAX_SIDEBAR_DMS);
  }, [directs, mx, roomToUnread, syncReady]);
};
