import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { SyncState, ClientEvent } from '$types/matrix-sdk';
import * as Sentry from '@sentry/react';
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
import { DIRECT_ROOM_PATH, HOME_ROOM_PATH, SPACE_ROOM_PATH } from '../pages/paths';
import { getShallowParents, getRoomToParents, guessPerfectParent } from '../utils/room';
import { createLogger } from '../utils/debug';

export function NotificationJumper() {
  const [pending, setPending] = useAtom(pendingNotificationAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const location = useLocation();
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
      Sentry.addBreadcrumb({
        category: 'notification.restore',
        message: 'Waiting for target session before notification jump',
        level: 'info',
        data: {
          targetSessionId: pending.targetSessionId,
          activeSessionId,
          source: pending.source,
        },
      });
      log.log('waiting for target session atom...', {
        targetSessionId: pending.targetSessionId,
        activeSessionId,
      });
      return;
    }

    // The mx client context may lag one render behind the atom — wait until it catches up.
    if (pending.targetSessionId && mx.getUserId() !== pending.targetSessionId) {
      Sentry.addBreadcrumb({
        category: 'notification.restore',
        message: 'Waiting for Matrix client session switch before notification jump',
        level: 'info',
        data: {
          targetSessionId: pending.targetSessionId,
          currentUserId: mx.getUserId(),
          source: pending.source,
        },
      });
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
      Sentry.addBreadcrumb({
        category: 'notification.restore',
        message: 'Starting notification room jump',
        level: 'info',
        data: {
          roomId: pending.roomId,
          hasEventId: !!pending.eventId,
          source: pending.source,
        },
      });
      Sentry.metrics.count('sable.notification.jump_started', 1, {
        attributes: {
          has_event_id: !!pending.eventId,
          source: pending.source ?? 'unknown',
        },
      });
      // Navigate directly to home or direct path — bypasses space routing which
      // on mobile shows the space-nav panel first instead of the room timeline.
      // First replace the current history entry with the section overview so that
      // pressing back (including native iOS swipe-back) returns to the section list
      // rather than the room the user was in before the notification.
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, pending.roomId);

      // Compute target paths up-front so both branches can share them.
      let targetSectionPath: string;
      let targetRoomPath: string;
      if (mDirects.has(pending.roomId)) {
        targetSectionPath = getDirectPath();
        targetRoomPath = getDirectRoomPath(roomIdOrAlias, pending.eventId);
      } else {
        // Route through the immediate parent space so the user lands in the
        // most relevant context. getShallowParents returns direct parents —
        // the same strategy used by useRoomNavigate — which correctly prefers
        // a sub-space that is pinned at the top level (e.g. "Coven") over a
        // distant root ancestor (e.g. "Bridges") that contains it transitively.
        const shallowParents = getShallowParents(getRoomToParents(mx), pending.roomId);
        if (shallowParents.length > 0) {
          const parentSpace =
            guessPerfectParent(mx, pending.roomId, shallowParents) ?? shallowParents[0];
          const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace ?? pending.roomId);
          targetSectionPath = getSpacePath(spaceIdOrAlias);
          targetRoomPath = getSpaceRoomPath(spaceIdOrAlias, roomIdOrAlias, pending.eventId);
        } else {
          targetSectionPath = getHomePath();
          targetRoomPath = getHomeRoomPath(roomIdOrAlias, pending.eventId);
        }
      }

      // eventId is an optional param in the same route segment (:roomIdOrAlias/:eventId?/),
      // so navigating from /direct/!room/ to /direct/!room/$event/ is a re-render of the
      // existing Room component — not an unmount. loadEventTimeline() picks up the new
      // eventId and fetches the event from the server if it isn't in the local cache yet.
      // Skipping the section→room two-step avoids an unnecessary unmount that would:
      //   a) reset isAtBottomRef so live events don't auto-scroll, and
      //   b) lose the current scroll position for the "back" gesture.
      const roomMatch =
        matchPath(DIRECT_ROOM_PATH, location.pathname) ??
        matchPath(HOME_ROOM_PATH, location.pathname) ??
        matchPath(SPACE_ROOM_PATH, location.pathname);
      const currentRoomIdOrAlias = roomMatch?.params.roomIdOrAlias
        ? decodeURIComponent(roomMatch.params.roomIdOrAlias)
        : undefined;
      const alreadyInRoom =
        currentRoomIdOrAlias !== undefined &&
        (currentRoomIdOrAlias === roomIdOrAlias || currentRoomIdOrAlias === pending.roomId);

      if (alreadyInRoom) {
        navigate(targetRoomPath, { replace: true });
      } else {
        // First replace the current history entry with the section overview so
        // that pressing back returns to the section list rather than the previous room.
        navigate(targetSectionPath, { replace: true });
        navigate(targetRoomPath);
      }
      const restoreLatencyMs =
        typeof pending.requestedAt === 'number' ? Date.now() - pending.requestedAt : undefined;
      Sentry.addBreadcrumb({
        category: 'notification.restore',
        message: 'Completed notification room jump',
        level: 'info',
        data: {
          roomId: pending.roomId,
          hasEventId: !!pending.eventId,
          source: pending.source,
          restoreLatencyMs,
          alreadyInRoom,
        },
      });
      Sentry.metrics.count('sable.notification.jump_completed', 1, {
        attributes: {
          has_event_id: !!pending.eventId,
          source: pending.source ?? 'unknown',
          already_in_room: alreadyInRoom,
        },
      });
      if (restoreLatencyMs !== undefined) {
        Sentry.metrics.distribution('sable.notification.restore_ms', restoreLatencyMs, {
          attributes: {
            source: pending.source ?? 'unknown',
            already_in_room: alreadyInRoom,
          },
        });
      }
      setPending(null);
      // jumpingRef stays true until pending changes — see effect below.
    } else {
      Sentry.addBreadcrumb({
        category: 'notification.restore',
        message: 'Waiting for room data before notification jump',
        level: 'info',
        data: {
          roomId: pending.roomId,
          isSyncing,
          hasRoom: !!room,
          membership: room?.getMyMembership(),
          source: pending.source,
        },
      });
      log.log('still waiting for room data...', {
        isSyncing,
        hasRoom: !!room,
        membership: room?.getMyMembership(),
      });
    }
  }, [pending, activeSessionId, mx, mDirects, navigate, location, setPending, log]);

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
