import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router';
import type { Room } from '$types/matrix-sdk';
import { SyncState, ClientEvent, Direction } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';
import { getEventTimeline, getFirstLinkedTimeline, getLiveTimeline } from '$utils/timeline';
import { activeSessionIdAtom, pendingNotificationAtom } from '../state/sessions';
import { mDirectAtom } from '../state/mDirectList';
import { useSyncState } from './useSyncState';
import { useMatrixClient } from './useMatrixClient';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import {
  getDirectForumPath,
  getDirectRoomPath,
  getHomeForumPath,
  getHomeRoomPath,
  getSpaceForumPath,
  getSpaceRoomPath,
} from '../pages/pathUtils';
import { getOrphanParents, guessPerfectParent } from '../utils/room/hierarchy';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { createLogger } from '../utils/debug';
import { CustomRoomType } from '$types/matrix/room';

const SUBSCRIPTION_WAIT_TIMEOUT_MS = 10000;

const log = createLogger('NotificationJumper');

const isEventInLiveTimelineChain = (room: Room | null, eventId: string | undefined): boolean => {
  if (!eventId) return true;
  if (!room) return false;
  const timeline = getEventTimeline(room, eventId);
  return (
    timeline !== undefined &&
    getFirstLinkedTimeline(timeline, Direction.Forward) === getLiveTimeline(room)
  );
};

export function NotificationJumper() {
  const [pending, setPending] = useAtom(pendingNotificationAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mx = useMatrixClient();
  const navigate = useNavigate();

  // Set true the moment we fire navigateRoom. Only reset when `pending` changes
  // to a new value (via the effect below). Do NOT reset inside performJump itself:
  // setPending(null) is async — resetting here creates a window where atom/render
  // churn re-calls performJump (from the ClientEvent.Room listener or effect
  // re-runs) before React has committed the null, causing repeated navigation.
  const jumpingRef = useRef(false);
  const routedRef = useRef(false);
  const waitingForTimelineRef = useRef(false);
  const timelineReadyRef = useRef(false);

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
    const targetInLiveTimeline = isEventInLiveTimelineChain(room, pending.eventId);
    const canJump =
      !pending.eventId ||
      timelineReadyRef.current ||
      (!waitingForTimelineRef.current && targetInLiveTimeline);

    if (isSyncing && isJoined && canJump) {
      log.log('jumping to:', pending.roomId, pending.eventId);
      jumpingRef.current = true;
      // Navigate directly to home or direct path — bypasses space routing which
      // on mobile shows the space-nav panel first instead of the room timeline.
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, pending.roomId);
      const isForum = room?.getType?.() === CustomRoomType.Forum;
      let path: string;
      if (mDirects.has(pending.roomId)) {
        path = isForum
          ? getDirectForumPath(roomIdOrAlias, pending.eventId)
          : getDirectRoomPath(roomIdOrAlias, pending.eventId);
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
          const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace ?? pending.roomId);
          path = isForum
            ? getSpaceForumPath(spaceIdOrAlias, roomIdOrAlias, pending.eventId)
            : getSpaceRoomPath(spaceIdOrAlias, roomIdOrAlias, pending.eventId);
        } else {
          path = isForum
            ? getHomeForumPath(roomIdOrAlias, pending.eventId)
            : getHomeRoomPath(roomIdOrAlias, pending.eventId);
        }
      }

      try {
        routedRef.current = true;
        navigate(path);
      } catch (error) {
        routedRef.current = false;
        jumpingRef.current = false;
        log.error('failed to navigate to notification:', error);
      }
      setPending(null);
      // jumpingRef stays true until pending changes — see effect below.
    } else {
      log.log('still waiting to jump...', {
        isSyncing,
        hasRoom: !!room,
        membership: room?.getMyMembership(),
        targetInLiveTimeline,
      });
    }
  }, [pending, activeSessionId, mx, mDirects, roomToParents, navigate, setPending]);

  // Reset the guard only when pending is replaced (new notification or cleared).
  useEffect(() => {
    jumpingRef.current = false;
    if (pending) routedRef.current = false;
    waitingForTimelineRef.current = false;
    timelineReadyRef.current = false;
  }, [pending]);

  // Keep a stable ref to the latest performJump so that the listeners below
  // always invoke the current version without adding performJump to their dep
  // arrays. Adding performJump as a dep causes the effect to re-run (and call
  // performJump again) on every atom change during an account switch — that is
  // the second source of repeated navigation.
  const performJumpRef = useRef(performJump);
  performJumpRef.current = performJump;

  useEffect(() => {
    if (!pending) return undefined;
    if (pending.targetSessionId && pending.targetSessionId !== activeSessionId) return undefined;
    if (pending.targetSessionId && mx.getUserId() !== pending.targetSessionId) return undefined;
    const manager = getSlidingSyncManager(mx);
    const targetInLiveTimeline = isEventInLiveTimelineChain(
      mx.getRoom(pending.roomId),
      pending.eventId
    );
    if (!manager && targetInLiveTimeline) return undefined;
    waitingForTimelineRef.current = true;

    if (!manager) {
      const onSync = (state: SyncState) => {
        if (state !== SyncState.Syncing) return;
        waitingForTimelineRef.current = false;
        timelineReadyRef.current = true;
        performJumpRef.current();
      };
      mx.on(ClientEvent.Sync, onSync);
      return () => mx.removeListener(ClientEvent.Sync, onSync);
    }

    const stopWaiting = manager.prepareRoomSubscription(pending.roomId, () => {
      waitingForTimelineRef.current = false;
      timelineReadyRef.current = true;
      performJumpRef.current();
    });
    const temporarySubscription = manager.isRoomSubscriptionTemporary(pending.roomId);

    const timeoutId = globalThis.setTimeout(() => {
      if (!waitingForTimelineRef.current) return;
      log.warn('subscription never confirmed, jumping without it');
      waitingForTimelineRef.current = false;
      timelineReadyRef.current = true;
      performJumpRef.current();
    }, SUBSCRIPTION_WAIT_TIMEOUT_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
      stopWaiting();
      if (!temporarySubscription) return;
      if (routedRef.current) manager.releaseRoomSubscriptionUnlessRouted(pending.roomId);
      else manager.unsubscribeFromRoom(pending.roomId);
    };
  }, [pending, activeSessionId, mx]);

  useSyncState(
    mx,
    // Stable callback — reads from ref, so useSyncState never re-registers.
    useCallback((current) => {
      if (current === SyncState.Syncing) performJumpRef.current();
    }, [])
  );

  useEffect(() => {
    if (!pending) return undefined;

    const retryJump = () => performJumpRef.current();
    mx.on(ClientEvent.Room, retryJump);
    performJumpRef.current();

    return () => {
      mx.removeListener(ClientEvent.Room, retryJump);
    };
  }, [pending, mx]); // performJump intentionally omitted — use ref above

  return null;
}
