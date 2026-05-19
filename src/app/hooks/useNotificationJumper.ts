import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { SyncState, ClientEvent } from '$types/matrix-sdk';
import { activeSessionIdAtom, pendingNotificationAtom } from '../state/sessions';
import { mDirectAtom } from '../state/mDirectList';
import { useSyncState } from './useSyncState';
import { useMatrixClient } from './useMatrixClient';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import {
  getDirectRoomPath,
  getHomeRoomPath,
  getSpaceRoomPath,
  getDirectPath,
  getHomePath,
  getSpacePath,
} from '../pages/pathUtils';
import { getOrphanParents, getRoomToParents, guessPerfectParent } from '../utils/room';
import { createLogger } from '../utils/debug';

export function NotificationJumper() {
  const [pending, setPending] = useAtom(pendingNotificationAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const log = createLogger('NotificationJumper');

  // Set true the moment we fire navigateRoom. Only reset when `pending` changes
  // to a new value (via the effect below). Do NOT reset inside performJump itself:
  // setPending(null) is async — resetting here creates a window where atom/render
  // churn re-calls performJump (from the ClientEvent.Room listener or effect
  // re-runs) before React has committed the null, causing repeated navigation.
  const jumpingRef = useRef(false);

  const performJump = useCallback(() => {
    if (!pending || jumpingRef.current) return;
    if (pending.targetSessionId && pending.targetSessionId !== activeSessionId) {
      log.log('waiting for target session atom...', {
        targetSessionId: pending.targetSessionId,
        activeSessionId,
      });
      return;
    }

    // The mx client context may lag one render behind the atom — wait until it catches up.
    if (pending.targetSessionId && mx.getUserId() !== pending.targetSessionId) {
      log.log('waiting for mx client to switch to target session...', {
        targetSessionId: pending.targetSessionId,
        currentUserId: mx.getUserId(),
      });
      return;
    }

    const isSyncing = mx.getSyncState() === SyncState.Syncing;
    const room = mx.getRoom(pending.roomId);
    const isJoined = room?.getMyMembership() === 'join';

    if (isSyncing && isJoined) {
      log.log('jumping to:', pending.roomId, pending.eventId);
      jumpingRef.current = true;
      // Navigate directly to home or direct path — bypasses space routing which
      // on mobile shows the space-nav panel first instead of the room timeline.
      // First replace the current history entry with the section overview so that
      // pressing back (including native iOS swipe-back) returns to the section list
      // rather than the room the user was in before the notification.
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, pending.roomId);
      if (mDirects.has(pending.roomId)) {
        navigate(getDirectPath(), { replace: true });
        navigate(getDirectRoomPath(roomIdOrAlias, pending.eventId));
      } else {
        // If the room lives inside a space, route through the space path so
        // SpaceRouteRoomProvider can resolve it — HomeRouteRoomProvider only
        // knows orphan rooms and would show JoinBeforeNavigate otherwise.
        // Use getOrphanParents + guessPerfectParent (same as useRoomNavigate) so
        // we always navigate to a root-level space, not a subspace — subspace
        // paths are not recognised by the router and land on JoinBeforeNavigate.
        const orphanParents = getOrphanParents(getRoomToParents(mx), pending.roomId);
        if (orphanParents.length > 0) {
          const parentSpace =
            guessPerfectParent(mx, pending.roomId, orphanParents) ?? orphanParents[0];
          const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace ?? pending.roomId);
          navigate(getSpacePath(spaceIdOrAlias), { replace: true });
          navigate(getSpaceRoomPath(spaceIdOrAlias, roomIdOrAlias, pending.eventId));
        } else {
          navigate(getHomePath(), { replace: true });
          navigate(getHomeRoomPath(roomIdOrAlias, pending.eventId));
        }
      }
      setPending(null);
      // jumpingRef stays true until pending changes — see effect below.
    } else {
      log.log('still waiting for room data...', {
        isSyncing,
        hasRoom: !!room,
        membership: room?.getMyMembership(),
      });
    }
  }, [pending, activeSessionId, mx, mDirects, navigate, setPending, log]);

  // Reset the guard only when pending is replaced (new notification or cleared).
  useEffect(() => {
    jumpingRef.current = false;
  }, [pending]);

  // Keep a stable ref to the latest performJump so that the listeners below
  // always invoke the current version without adding performJump to their dep
  // arrays. Adding performJump as a dep causes the effect to re-run (and call
  // performJump again) on every atom change during an account switch — that is
  // the second source of repeated navigation.
  const performJumpRef = useRef(performJump);
  performJumpRef.current = performJump;

  useSyncState(
    mx,
    // Stable callback — reads from ref, so useSyncState never re-registers.
    useCallback((current) => {
      if (current === SyncState.Syncing) performJumpRef.current();
    }, [])
  );

  useEffect(() => {
    if (!pending) return undefined;

    const onRoom = () => performJumpRef.current();
    mx.on(ClientEvent.Room, onRoom);
    performJumpRef.current();

    return () => {
      mx.removeListener(ClientEvent.Room, onRoom);
    };
  }, [pending, mx]); // performJump intentionally omitted — use ref above

  return null;
}
