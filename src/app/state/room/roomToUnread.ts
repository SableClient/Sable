import { produce } from 'immer';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import {
  IRoomTimelineData,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomEvent,
  SyncState,
  ReceiptContent,
  ReceiptType,
  EventType,
  ClientEvent,
} from '$types/matrix-sdk';
import { useCallback, useEffect, useRef } from 'react';
import {
  Membership,
  NotificationType,
  RoomToUnread,
  UnreadInfo,
  Unread,
  StateEvent,
} from '$types/matrix/room';
import {
  getAllParents,
  getNotificationType,
  getUnreadInfo,
  getUnreadInfos,
  isNotificationEvent,
} from '$utils/room';
import { useStateEventCallback } from '$hooks/useStateEventCallback';
import { useSyncState } from '$hooks/useSyncState';
import { useRoomsNotificationPreferencesContext } from '$hooks/useRoomsNotificationPreferences';
import { getClientSyncDiagnostics } from '$client/initMatrix';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom } from './roomToParents';

export type RoomToUnreadAction =
  | {
      type: 'RESET';
      unreadInfos: UnreadInfo[];
    }
  | {
      type: 'PUT';
      unreadInfo: UnreadInfo;
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

export const unreadInfoToUnread = (unreadInfo: UnreadInfo): Unread => ({
  highlight: unreadInfo.highlight,
  total: unreadInfo.total,
  from: null,
});

const putUnreadInfo = (
  roomToUnread: RoomToUnread,
  allParents: Set<string>,
  unreadInfo: UnreadInfo
) => {
  const oldUnread = roomToUnread.get(unreadInfo.roomId) ?? { highlight: 0, total: 0, from: null };
  roomToUnread.set(unreadInfo.roomId, unreadInfoToUnread(unreadInfo));

  const newH = unreadInfo.highlight - oldUnread.highlight;
  const newT = unreadInfo.total - oldUnread.total;

  allParents.forEach((parentId) => {
    const oldParentUnread = roomToUnread.get(parentId) ?? { highlight: 0, total: 0, from: null };
    roomToUnread.set(parentId, {
      highlight: (oldParentUnread.highlight += newH),
      total: (oldParentUnread.total += newT),
      from: new Set([...(oldParentUnread.from ?? []), unreadInfo.roomId]),
    });
  });
};

const deleteUnreadInfo = (roomToUnread: RoomToUnread, allParents: Set<string>, roomId: string) => {
  const oldUnread = roomToUnread.get(roomId);
  if (!oldUnread) return;
  roomToUnread.delete(roomId);

  allParents.forEach((parentId) => {
    const oldParentUnread = roomToUnread.get(parentId);
    if (!oldParentUnread) return;
    const newFrom = new Set([...(oldParentUnread.from ?? roomId)]);
    newFrom.delete(roomId);
    if (newFrom.size === 0) {
      roomToUnread.delete(parentId);
      return;
    }
    roomToUnread.set(parentId, {
      highlight: oldParentUnread.highlight - oldUnread.highlight,
      total: oldParentUnread.total - oldUnread.total,
      from: newFrom,
    });
  });
};

export const unreadEqual = (u1: Unread, u2: Unread): boolean => {
  const countEqual = u1.highlight === u2.highlight && u1.total === u2.total;

  if (!countEqual) return false;

  const f1 = u1.from;
  const f2 = u2.from;
  if (f1 === null && f2 === null) return true;
  if (f1 === null || f2 === null) return false;

  if (f1.size !== f2.size) return false;

  let fromEqual = true;
  f1?.forEach((item) => {
    if (!f2?.has(item)) {
      fromEqual = false;
    }
  });

  return fromEqual;
};

const baseRoomToUnread = atom<RoomToUnread>(new Map());
export const roomToUnreadAtom = atom<RoomToUnread, [RoomToUnreadAction], undefined>(
  (get) => get(baseRoomToUnread),
  (get, set, action) => {
    const allParentsOf = (roomId: string): Set<string> =>
      getAllParents(get(roomToParentsAtom), roomId);

    if (action.type === 'RESET') {
      const draftRoomToUnread: RoomToUnread = new Map();
      action.unreadInfos.forEach((unreadInfo) => {
        putUnreadInfo(draftRoomToUnread, allParentsOf(unreadInfo.roomId), unreadInfo);
      });
      set(baseRoomToUnread, draftRoomToUnread);
      return;
    }
    if (action.type === 'PUT') {
      const { unreadInfo } = action;
      if (unreadInfo.total <= 0 && unreadInfo.highlight <= 0) {
        if (get(baseRoomToUnread).has(unreadInfo.roomId)) {
          set(
            baseRoomToUnread,
            produce(get(baseRoomToUnread), (draftRoomToUnread) =>
              deleteUnreadInfo(
                draftRoomToUnread,
                allParentsOf(unreadInfo.roomId),
                unreadInfo.roomId
              )
            )
          );
        }
        return;
      }
      const currentUnread = get(baseRoomToUnread).get(unreadInfo.roomId);
      if (currentUnread && unreadEqual(currentUnread, unreadInfoToUnread(unreadInfo))) {
        // Do not update if unread data has not changed
        // like total & highlight
        return;
      }
      set(
        baseRoomToUnread,
        produce(get(baseRoomToUnread), (draftRoomToUnread) =>
          putUnreadInfo(draftRoomToUnread, allParentsOf(unreadInfo.roomId), unreadInfo)
        )
      );
      return;
    }
    if (action.type === 'DELETE' && get(baseRoomToUnread).has(action.roomId)) {
      set(
        baseRoomToUnread,
        produce(get(baseRoomToUnread), (draftRoomToUnread) =>
          deleteUnreadInfo(draftRoomToUnread, allParentsOf(action.roomId), action.roomId)
        )
      );
    }
  }
);

export const useBindRoomToUnreadAtom = (mx: MatrixClient, unreadAtom: typeof roomToUnreadAtom) => {
  const setUnreadAtom = useSetAtom(unreadAtom);
  const roomsNotificationPreferences = useRoomsNotificationPreferencesContext();
  const mDirects = useAtomValue(mDirectAtom);
  const spaceChildResetTimerRef = useRef<number | null>(null);
  const shouldApplyUnreadFixup = useCallback(
    () => getClientSyncDiagnostics(mx).transport === 'sliding',
    [mx]
  );

  useEffect(() => {
    setUnreadAtom({
      type: 'RESET',
      unreadInfos: getUnreadInfos(mx, { applyFixup: shouldApplyUnreadFixup(), mDirects }),
    });
  }, [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]);

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (
          (state === SyncState.Prepared && prevState === null) ||
          (state === SyncState.Syncing && prevState !== SyncState.Syncing)
        ) {
          setUnreadAtom({
            type: 'RESET',
            unreadInfos: getUnreadInfos(mx, { applyFixup: shouldApplyUnreadFixup(), mDirects }),
          });
        }
      },
      [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]
    )
  );

  useEffect(() => {
    const handleTimelineEvent = (
      mEvent: MatrixEvent,
      room: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (!room || room.isSpaceRoom()) return;
      if (getNotificationType(mx, room.roomId) === NotificationType.Mute) {
        setUnreadAtom({
          type: 'DELETE',
          roomId: room.roomId,
        });
        return;
      }

      // Handle live events (new messages arriving in real-time)
      if (data.liveEvent && isNotificationEvent(mEvent)) {
        if (mEvent.getSender() === mx.getUserId()) return;
        const unreadInfo = getUnreadInfo(room, { applyFixup: shouldApplyUnreadFixup(), mDirects });
        setUnreadAtom({
          type: 'PUT',
          unreadInfo,
        });
        return;
      }

      // Handle non-live events (initial sync/sliding sync timeline population)
      // For rooms without read receipts (unvisited in sliding sync), check if they need badges
      const userId = mx.getUserId();
      if (!data.liveEvent && userId && !room.getEventReadUpTo(userId)) {
        // Room has no read receipt - check if timeline activity warrants a badge
        const unreadInfo = getUnreadInfo(room, { applyFixup: shouldApplyUnreadFixup(), mDirects });
        if (unreadInfo.total > 0 || unreadInfo.highlight > 0) {
          setUnreadAtom({
            type: 'PUT',
            unreadInfo,
          });
        }
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]);

  useEffect(() => {
    const handleReceipt = (mEvent: MatrixEvent, room: Room) => {
      const myUserId = mx.getUserId();
      if (!myUserId) return;
      if (room.isSpaceRoom()) return;
      const content = mEvent.getContent<ReceiptContent>();

      const isMyReceipt = Object.keys(content).find((eventId) =>
        (Object.keys(content[eventId]) as ReceiptType[]).find(
          (receiptType) => content[eventId][receiptType][myUserId]
        )
      );
      if (isMyReceipt) {
        const unreadInfo = getUnreadInfo(room, { applyFixup: shouldApplyUnreadFixup(), mDirects });
        if (unreadInfo.total === 0 && unreadInfo.highlight === 0) {
          setUnreadAtom({ type: 'DELETE', roomId: room.roomId });
          return;
        }
        setUnreadAtom({ type: 'PUT', unreadInfo });
      }
    };
    mx.on(RoomEvent.Receipt, handleReceipt);
    return () => {
      mx.removeListener(RoomEvent.Receipt, handleReceipt);
    };
  }, [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]);

  useEffect(() => {
    const handleUnreadNotifications = (
      _notification: unknown,
      _threadId: string | undefined,
      room: Room
    ) => {
      if (!room || room.isSpaceRoom()) return;
      if (room.getMyMembership() !== Membership.Join) return;

      const unreadInfo = getUnreadInfo(room, { applyFixup: shouldApplyUnreadFixup(), mDirects });
      if (unreadInfo.total === 0 && unreadInfo.highlight === 0) {
        setUnreadAtom({ type: 'DELETE', roomId: room.roomId });
        return;
      }
      setUnreadAtom({ type: 'PUT', unreadInfo });
    };
    (mx as any).on(RoomEvent.UnreadNotifications, handleUnreadNotifications);
    return () => {
      (mx as any).removeListener(RoomEvent.UnreadNotifications, handleUnreadNotifications);
    };
  }, [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]);

  useEffect(() => {
    const handleRoomAccountData = (mEvent: MatrixEvent, room: Room) => {
      if (room.isSpaceRoom()) return;
      if (mEvent.getType() !== EventType.FullyRead) return;

      const unreadInfo = getUnreadInfo(room, { applyFixup: shouldApplyUnreadFixup(), mDirects });
      if (unreadInfo.total === 0 && unreadInfo.highlight === 0) {
        setUnreadAtom({ type: 'DELETE', roomId: room.roomId });
        return;
      }
      setUnreadAtom({ type: 'PUT', unreadInfo });
    };
    mx.on(RoomEvent.AccountData, handleRoomAccountData);
    return () => {
      mx.removeListener(RoomEvent.AccountData, handleRoomAccountData);
    };
  }, [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]);

  useEffect(() => {
    setUnreadAtom({
      type: 'RESET',
      unreadInfos: getUnreadInfos(mx, { applyFixup: shouldApplyUnreadFixup(), mDirects }),
    });
  }, [mx, setUnreadAtom, roomsNotificationPreferences, shouldApplyUnreadFixup, mDirects]);

  useEffect(() => {
    const handleMembershipChange = (room: Room, membership: string) => {
      if (membership !== Membership.Join) {
        setUnreadAtom({
          type: 'DELETE',
          roomId: room.roomId,
        });
      }
    };
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    return () => {
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
    };
  }, [mx, setUnreadAtom]);

  // Seed badge state immediately when a room is first registered with the client
  // (e.g. after joining or receiving an invite that gets auto-accepted).
  // This avoids the brief window after refresh where badges are invisible until
  // the next timeline event arrives. Notifications are NOT triggered here —
  // ClientNonUIFeatures handles live notification pop-ups via its own listener.
  useEffect(() => {
    const handleRoomAdded = (room: Room) => {
      if (room.isSpaceRoom() || room.getMyMembership() !== Membership.Join) return;
      const unreadInfo = getUnreadInfo(room, { applyFixup: shouldApplyUnreadFixup(), mDirects });
      if (unreadInfo.total > 0 || unreadInfo.highlight > 0) {
        setUnreadAtom({ type: 'PUT', unreadInfo });
      }
    };
    mx.on(ClientEvent.Room, handleRoomAdded as (room: Room) => void);
    return () => {
      mx.removeListener(ClientEvent.Room, handleRoomAdded as (room: Room) => void);
    };
  }, [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]);

  useEffect(
    () => () => {
      if (spaceChildResetTimerRef.current !== null) {
        window.clearTimeout(spaceChildResetTimerRef.current);
        spaceChildResetTimerRef.current = null;
      }
    },
    []
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === StateEvent.SpaceChild) {
          const roomId = mEvent.getRoomId();
          if (!roomId) return;
          const parentRoom = mx.getRoom(roomId);
          if (!parentRoom || parentRoom.getMyMembership() !== Membership.Join) return;

          if (spaceChildResetTimerRef.current !== null) {
            window.clearTimeout(spaceChildResetTimerRef.current);
          }
          spaceChildResetTimerRef.current = window.setTimeout(() => {
            setUnreadAtom({
              type: 'RESET',
              unreadInfos: getUnreadInfos(mx, { applyFixup: shouldApplyUnreadFixup(), mDirects }),
            });
            spaceChildResetTimerRef.current = null;
          }, 150);
        }
      },
      [mx, setUnreadAtom, shouldApplyUnreadFixup, mDirects]
    )
  );
};
