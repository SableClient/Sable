import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { SyncState, ClientEvent, RoomEvent, Room, MatrixEvent } from '$types/matrix-sdk';
import { activeSessionIdAtom, pendingNotificationAtom } from '../state/sessions';
import { mDirectAtom } from '../state/mDirectList';
import { useSyncState } from './useSyncState';
import { useMatrixClient } from './useMatrixClient';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import { getDirectRoomPath, getHomeRoomPath, getSpaceRoomPath } from '../pages/pathUtils';
import { getOrphanParents, guessPerfectParent } from '../utils/room';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { createLogger } from '../utils/debug';

// How long to wait for the notification event to appear in the live timeline
// before navigating with the eventId anyway (triggers historical context load).
const JUMP_TIMEOUT_MS = 30_000;

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
  // Tracks when we first started waiting for the target event to appear in the
  // live timeline. Reset whenever `pending` changes.
  const jumpStartTimeRef = useRef<number | null>(null);
  const jumpTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearJumpTimeout = useCallback(() => {
    if (jumpTimeoutRef.current !== undefined) {
      clearTimeout(jumpTimeoutRef.current);
      jumpTimeoutRef.current = undefined;
    }
  }, []);

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
      const liveEvents =
        room?.getUnfilteredTimelineSet?.()?.getLiveTimeline?.()?.getEvents?.() ?? [];
      const eventInLive = pending.eventId
        ? liveEvents.some((event) => event.getId() === pending.eventId)
        : false;

      // Defer while the target event hasn't arrived in the live timeline yet.
      // Navigating with an eventId not in the live timeline triggers a sparse
      // historical context load — the room appears empty or shows only one message.
      // Retry on each RoomEvent.Timeline until the event appears, then navigate
      // with the eventId so the room scrolls to and highlights it in full context.
      // After JUMP_TIMEOUT_MS fall back to opening the room at the live bottom.
      if (pending.eventId && !eventInLive) {
        if (jumpStartTimeRef.current === null) {
          jumpStartTimeRef.current = Date.now();
        }
        const elapsedMs = Date.now() - jumpStartTimeRef.current;
        if (elapsedMs < JUMP_TIMEOUT_MS) {
          if (jumpTimeoutRef.current === undefined) {
            jumpTimeoutRef.current = setTimeout(() => {
              jumpTimeoutRef.current = undefined;
              performJumpRef.current();
            }, JUMP_TIMEOUT_MS - elapsedMs);
          }
          log.log('event not yet in live timeline, deferring jump...', {
            roomId: pending.roomId,
            eventId: pending.eventId,
          });
          return;
        }
        log.log('timed out waiting for event in live; falling back to live bottom', {
          roomId: pending.roomId,
          eventId: pending.eventId,
        });
      }

      // Pass eventId when confirmed in the live timeline (best case — scrolls to
      // and highlights the event in full room context), OR when the timeout fires
      // (triggers a historical context load so the user at least sees the message
      // they tapped). Only omit eventId when we never had one in the first place.
      const targetEventId = pending.eventId ?? undefined;
      log.log('jumping to:', pending.roomId, targetEventId);
      jumpingRef.current = true;
      clearJumpTimeout();
      // Navigate directly to home or direct path — bypasses space routing which
      // on mobile shows the space-nav panel first instead of the room timeline.
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, pending.roomId);
      if (mDirects.has(pending.roomId)) {
        navigate(getDirectRoomPath(roomIdOrAlias, targetEventId));
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
              targetEventId
            )
          );
        } else {
          navigate(getHomeRoomPath(roomIdOrAlias, targetEventId));
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
  }, [
    pending,
    activeSessionId,
    mx,
    mDirects,
    roomToParents,
    navigate,
    setPending,
    log,
    clearJumpTimeout,
  ]);

  // Reset guards only when pending is replaced (new notification or cleared).
  useEffect(() => {
    clearJumpTimeout();
    jumpingRef.current = false;
    jumpStartTimeRef.current = null;
  }, [pending, clearJumpTimeout]);

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
    const onTimeline = (_event: MatrixEvent, eventRoom: Room | undefined) => {
      if (eventRoom?.roomId === pending.roomId) performJumpRef.current();
    };
    mx.on(ClientEvent.Room, onRoom);
    mx.on(RoomEvent.Timeline, onTimeline);
    performJumpRef.current();

    return () => {
      mx.removeListener(ClientEvent.Room, onRoom);
      mx.removeListener(RoomEvent.Timeline, onTimeline);
    };
  }, [pending, mx]); // performJump intentionally omitted — use ref above

  useEffect(
    () => () => {
      clearJumpTimeout();
    },
    [clearJumpTimeout]
  );

  return null;
}
