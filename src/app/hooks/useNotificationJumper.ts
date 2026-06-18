import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { SyncState, ClientEvent } from '$types/matrix-sdk';
import * as Sentry from '@sentry/react';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom, roomToParentsReadyAtom } from '$state/room/roomToParents';
import { getStoredRoomNavRoot } from '$state/room/roomNavRoots';
import { useSyncState } from './useSyncState';
import { useMatrixClient } from './useMatrixClient';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import {
  getDirectRoomPath,
  getHomeRoomPath,
  getSpaceRoomPath,
  getDirectPath,
  getHomePath,
  getSpacePath,
  withAdditionalSearchParams,
} from '$pages/pathUtils';
import { DIRECT_ROOM_PATH, HOME_ROOM_PATH, SPACE_ROOM_PATH } from '$pages/paths';
import { resolveSpaceNavigationRoot } from '$utils/room';
import { createLogger } from '$utils/debug';
import { clearLaunchContext } from '$app/../launch-context-persistence';
import {
  buildNotificationBreadcrumb,
  buildNotificationMetricAttributes,
} from '$utils/notificationTelemetry';

const NOTIFICATION_PARENT_GRAPH_WAIT_MAX_MS = 1_500;

function acknowledgeNotificationClick(clickId?: string) {
  if (!clickId || !('serviceWorker' in navigator)) return;

  const payload = {
    type: 'notificationClickHandled',
    clickId,
  };
  const posted = new Set<ServiceWorker>();
  const postToWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker || posted.has(worker)) return;
    posted.add(worker);
    worker.postMessage(payload);
  };

  postToWorker(navigator.serviceWorker.controller);
  navigator.serviceWorker.ready
    .then((registration) => {
      postToWorker(registration.active);
      postToWorker(registration.waiting);
      postToWorker(registration.installing);
    })
    .catch(() => undefined);

  void clearLaunchContext().catch(() => undefined);
}

export function NotificationJumper() {
  const [pending, setPending] = useAtom(pendingNotificationAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const roomToParentsReady = useAtomValue(roomToParentsReadyAtom);
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
  const parentGraphWaitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const performJump = useCallback(() => {
    if (!pending || jumpingRef.current) return;
    if (pending.targetSessionId && pending.targetSessionId !== activeSessionId) {
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_wait_target_session', {
          click_id: pending.swClickId,
          target_session_id: pending.targetSessionId,
          active_session_id: activeSessionId,
          source: pending.source,
        })
      );
      log.log('waiting for target session atom...', {
        targetSessionId: pending.targetSessionId,
        activeSessionId,
      });
      return;
    }

    // The mx client context may lag one render behind the atom — wait until it catches up.
    if (pending.targetSessionId && mx.getUserId() !== pending.targetSessionId) {
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_wait_client_session', {
          click_id: pending.swClickId,
          target_session_id: pending.targetSessionId,
          current_user_id: mx.getUserId(),
          source: pending.source,
        })
      );
      log.log('waiting for mx client to switch to target session...', {
        targetSessionId: pending.targetSessionId,
        currentUserId: mx.getUserId(),
      });
      return;
    }

    const isSyncing = mx.getSyncState() === SyncState.Syncing;
    const room = mx.getRoom(pending.roomId);
    const isJoined = room?.getMyMembership() === 'join';
    const restoreAgeMs =
      typeof pending.requestedAt === 'number' ? Date.now() - pending.requestedAt : undefined;
    const currentUserId = mx.getUserId() ?? undefined;
    const storedRootSpaceId =
      currentUserId !== undefined ? getStoredRoomNavRoot(currentUserId, pending.roomId) : undefined;
    const parentGraphReady = roomToParentsReady || roomToParents.size > 0;

    if (
      !mDirects.has(pending.roomId) &&
      !parentGraphReady &&
      storedRootSpaceId === undefined &&
      (restoreAgeMs === undefined || restoreAgeMs < NOTIFICATION_PARENT_GRAPH_WAIT_MAX_MS)
    ) {
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_wait_parent_graph', {
          click_id: pending.swClickId,
          room_id: pending.roomId,
          source: pending.source,
          restore_age_ms: restoreAgeMs,
          parent_graph_ready: parentGraphReady,
          wait_budget_ms: NOTIFICATION_PARENT_GRAPH_WAIT_MAX_MS,
        })
      );
      return;
    }

    if (isSyncing && isJoined) {
      log.log('jumping to:', pending.roomId, pending.eventId);
      jumpingRef.current = true;
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_jump_started', {
          click_id: pending.swClickId,
          room_id: pending.roomId,
          event_id: pending.eventId,
          has_event_id: !!pending.eventId,
          jump_mode: pending.jumpMode,
          source: pending.source,
        })
      );
      Sentry.metrics.count('sable.notification.jump_started', 1, {
        attributes: buildNotificationMetricAttributes({
          click_id: pending.swClickId,
          has_event_id: !!pending.eventId,
          jump_mode: pending.jumpMode,
          source: pending.source ?? 'unknown',
        }),
      });
      // Navigate directly to home or direct path — bypasses space routing which
      // on mobile shows the space-nav panel first instead of the room timeline.
      // First replace the current history entry with the section overview so that
      // pressing back (including native iOS swipe-back) returns to the section list
      // rather than the room the user was in before the notification.
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, pending.roomId);
      const { rootSpaceId: chosenRootSpaceId, source: rootSource } = resolveSpaceNavigationRoot(
        mx,
        roomToParents,
        pending.roomId,
        { storedRootSpaceId }
      );

      // Compute target paths up-front so both branches can share them.
      let targetSectionPath: string;
      let targetRoomPath: string;
      if (mDirects.has(pending.roomId)) {
        targetSectionPath = getDirectPath();
        targetRoomPath = getDirectRoomPath(roomIdOrAlias, pending.eventId);
      } else {
        const parentSpace = chosenRootSpaceId;
        if (parentSpace) {
          const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace ?? pending.roomId);
          targetSectionPath = getSpacePath(spaceIdOrAlias);
          targetRoomPath = getSpaceRoomPath(spaceIdOrAlias, roomIdOrAlias, pending.eventId);
        } else {
          targetSectionPath = getHomePath();
          targetRoomPath = getHomeRoomPath(roomIdOrAlias, pending.eventId);
        }
      }
      targetRoomPath = withAdditionalSearchParams(targetRoomPath, {
        joinCall: pending.joinCall ? 'true' : undefined,
        jumpMode: pending.jumpMode,
      });

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
      acknowledgeNotificationClick(pending.swClickId);
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_click_acknowledged', {
          click_id: pending.swClickId,
          room_id: pending.roomId,
          event_id: pending.eventId,
          source: pending.source,
          jump_mode: pending.jumpMode,
          chosen_root_space_id: chosenRootSpaceId,
          root_source: rootSource,
          parent_graph_ready: parentGraphReady,
        })
      );
      const restoreLatencyMs =
        typeof pending.requestedAt === 'number' ? Date.now() - pending.requestedAt : undefined;
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_jump_completed', {
          click_id: pending.swClickId,
          room_id: pending.roomId,
          event_id: pending.eventId,
          has_event_id: !!pending.eventId,
          source: pending.source,
          jump_mode: pending.jumpMode,
          restore_latency_ms: restoreLatencyMs,
          already_in_room: alreadyInRoom,
          chosen_root_space_id: chosenRootSpaceId,
          root_source: rootSource,
          parent_graph_ready: parentGraphReady,
        })
      );
      Sentry.metrics.count('sable.notification.jump_completed', 1, {
        attributes: buildNotificationMetricAttributes({
          click_id: pending.swClickId,
          has_event_id: !!pending.eventId,
          source: pending.source ?? 'unknown',
          jump_mode: pending.jumpMode,
          already_in_room: alreadyInRoom,
          chosen_root_space_id: chosenRootSpaceId,
          root_source: rootSource,
          parent_graph_ready: parentGraphReady,
        }),
      });
      if (restoreLatencyMs !== undefined) {
        Sentry.metrics.distribution('sable.notification.restore_ms', restoreLatencyMs, {
          attributes: buildNotificationMetricAttributes({
            click_id: pending.swClickId,
            source: pending.source ?? 'unknown',
            jump_mode: pending.jumpMode,
            already_in_room: alreadyInRoom,
            chosen_root_space_id: chosenRootSpaceId,
            root_source: rootSource,
            parent_graph_ready: parentGraphReady,
          }),
        });
      }
      setPending(null);
      // jumpingRef stays true until pending changes — see effect below.
    } else {
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('restore', 'restore_wait_room_ready', {
          click_id: pending.swClickId,
          room_id: pending.roomId,
          is_syncing: isSyncing,
          has_room: !!room,
          membership: room?.getMyMembership(),
          source: pending.source,
          jump_mode: pending.jumpMode,
          parent_graph_ready: parentGraphReady,
          stored_root_space_id: storedRootSpaceId,
        })
      );
      log.log('still waiting for room data...', {
        isSyncing,
        hasRoom: !!room,
        membership: room?.getMyMembership(),
      });
    }
  }, [
    pending,
    activeSessionId,
    mx,
    mDirects,
    roomToParents,
    roomToParentsReady,
    navigate,
    location,
    setPending,
    log,
  ]);

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

  useEffect(() => {
    if (!pending || jumpingRef.current) return undefined;

    performJumpRef.current();

    const currentUserId = mx.getUserId() ?? undefined;
    const storedRootSpaceId =
      currentUserId !== undefined ? getStoredRoomNavRoot(currentUserId, pending.roomId) : undefined;
    const parentGraphReady = roomToParentsReady || roomToParents.size > 0;
    const restoreAgeMs =
      typeof pending.requestedAt === 'number' ? Date.now() - pending.requestedAt : undefined;

    const shouldWaitForParentGraph =
      !mDirects.has(pending.roomId) &&
      !parentGraphReady &&
      storedRootSpaceId === undefined &&
      (restoreAgeMs === undefined || restoreAgeMs < NOTIFICATION_PARENT_GRAPH_WAIT_MAX_MS);

    if (!shouldWaitForParentGraph) return undefined;

    const remainingWaitMs =
      typeof restoreAgeMs === 'number'
        ? Math.max(NOTIFICATION_PARENT_GRAPH_WAIT_MAX_MS - restoreAgeMs, 0)
        : NOTIFICATION_PARENT_GRAPH_WAIT_MAX_MS;

    parentGraphWaitTimerRef.current = setTimeout(() => {
      parentGraphWaitTimerRef.current = undefined;
      performJumpRef.current();
    }, remainingWaitMs);

    return () => {
      if (parentGraphWaitTimerRef.current !== undefined) {
        clearTimeout(parentGraphWaitTimerRef.current);
        parentGraphWaitTimerRef.current = undefined;
      }
    };
  }, [pending, roomToParentsReady, roomToParents.size, mDirects, mx]);

  return null;
}
