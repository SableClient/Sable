import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { SyncState, ClientEvent, Room, RoomEvent, RoomEventHandlerMap } from '$types/matrix-sdk';
import { activeSessionIdAtom, pendingNotificationAtom } from '../state/sessions';
import { mDirectAtom } from '../state/mDirectList';
import { useSyncState } from './useSyncState';
import { useMatrixClient } from './useMatrixClient';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import { getDirectRoomPath, getHomeRoomPath, getSpaceRoomPath } from '../pages/pathUtils';
import { getOrphanParents, guessPerfectParent } from '../utils/room';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { createLogger } from '../utils/debug';

export function NotificationJumper() {
  const [pending, setPending] = useAtom(pendingNotificationAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
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
      // If the notification event is already in the room's live timeline (i.e.
      // sliding sync has already delivered it), open the room at the live bottom
      // rather than using the eventId URL path.  The eventId path triggers
      // loadEventTimeline → roomInitialSync which loads a historical slice that
      // (a) may look like a brand-new chat if the event is the only one in the
      // slice, and (b) makes the room appear empty when the user navigates away
      // and returns without the eventId, because the sliding-sync live timeline
      // hasn't been populated yet.  Omitting the eventId for events already in
      // the live timeline lets the room open normally at the bottom where the
      // new message is visible.  Historical events (not in live timeline) still
      // use the eventId so loadEventTimeline can jump to the right context.
      const liveEvents =
        room?.getUnfilteredTimelineSet?.()?.getLiveTimeline?.()?.getEvents?.() ?? [];
      const eventInLive = pending.eventId
        ? liveEvents.some((e) => e.getId() === pending.eventId)
        : false;
      // If the live timeline is empty the room hasn't been populated by sliding
      // sync yet.  Defer navigation and let the RoomEvent.Timeline listener below
      // retry once events arrive — by then the notification event will almost
      // certainly be in the live timeline and we can skip loadEventTimeline.
      if (!eventInLive && liveEvents.length === 0) {
        log.log('live timeline empty, deferring jump...', { roomId: pending.roomId });
        return;
      }
      const resolvedEventId = eventInLive ? undefined : pending.eventId;
      log.log('jumping to:', pending.roomId, resolvedEventId, { eventInLive });
      jumpingRef.current = true;
      // Navigate directly to home or direct path — bypasses space routing which
      // on mobile shows the space-nav panel first instead of the room timeline.
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, pending.roomId);
      if (mDirects.has(pending.roomId)) {
        navigate(getDirectRoomPath(roomIdOrAlias, resolvedEventId));
      } else {
        // If the room lives inside a space, route through the space path so
        // SpaceRouteRoomProvider can resolve it — HomeRouteRoomProvider only
        // knows orphan rooms and would show JoinBeforeNavigate otherwise.
        // Use getOrphanParents + guessPerfectParent (same as useRoomNavigate) so
        // we always navigate to a root-level space, not a subspace — subspace
        // paths are not recognised by the router and land on JoinBeforeNavigate.
        const orphanParents = getOrphanParents(roomToParents, pending.roomId);
        if (orphanParents.length > 0) {
          const parentSpace =
            guessPerfectParent(mx, pending.roomId, orphanParents) ?? orphanParents[0];
          navigate(
            getSpaceRoomPath(
              getCanonicalAliasOrRoomId(mx, parentSpace),
              roomIdOrAlias,
              resolvedEventId
            )
          );
        } else {
          navigate(getHomeRoomPath(roomIdOrAlias, resolvedEventId));
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
  }, [pending, activeSessionId, mx, mDirects, roomToParents, navigate, setPending, log]);

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
    // Re-check once events arrive in the target room — this fires shortly after
    // the initial sync populates the live timeline, letting us verify whether
    // the notification event is already there before falling back to
    // loadEventTimeline (which creates a sparse historical slice that may make
    // the room appear empty on subsequent visits without the eventId).
    const onTimeline = (_evt: unknown, eventRoom: Room | undefined) => {
      if (eventRoom?.roomId === pending.roomId) performJumpRef.current();
    };
    mx.on(ClientEvent.Room, onRoom);
    mx.on(RoomEvent.Timeline, onTimeline as RoomEventHandlerMap[RoomEvent.Timeline]);
    performJumpRef.current();

    return () => {
      mx.removeListener(ClientEvent.Room, onRoom);
      mx.removeListener(RoomEvent.Timeline, onTimeline as RoomEventHandlerMap[RoomEvent.Timeline]);
    };
  }, [pending, mx]); // performJump intentionally omitted — use ref above

  return null;
}
