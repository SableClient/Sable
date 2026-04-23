import { produce } from 'immer';
import { atom, useSetAtom } from 'jotai';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import {
  ClientEvent,
  RoomEvent,
  RoomStateEvent,
  SyncState,
  EventType,
  KnownMembership,
} from '$types/matrix-sdk';
import { useCallback, useEffect } from 'react';
import type { RoomToParents } from '$types/matrix/room';

import {
  getRoomToParents,
  getSpaceChildren,
  isSpace,
  isValidChild,
  mapParentWithChildren,
} from '$utils/room';
import { useSyncState } from '$hooks/useSyncState';

export type RoomToParentsAction =
  | {
      type: 'INITIALIZE';
      roomToParents: RoomToParents;
    }
  | {
      type: 'PUT';
      parent: string;
      children: string[];
    }
  | {
      type: 'REMOVE_CHILD';
      parent: string;
      child: string;
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

const baseRoomToParents = atom(new Map());
export const roomToParentsAtom = atom<RoomToParents, [RoomToParentsAction], undefined>(
  (get) => get(baseRoomToParents),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      set(baseRoomToParents, action.roomToParents);
      return;
    }
    if (action.type === 'PUT') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          mapParentWithChildren(draftRoomToParents, action.parent, action.children);
        })
      );
      return;
    }
    if (action.type === 'REMOVE_CHILD') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          const parents = draftRoomToParents.get(action.child);
          if (!parents) return;
          parents.delete(action.parent);
          if (parents.size === 0) {
            draftRoomToParents.delete(action.child);
          } else {
            draftRoomToParents.set(action.child, parents);
          }
        })
      );
      return;
    }
    if (action.type === 'DELETE') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          const noParentRooms: string[] = [];
          draftRoomToParents.delete(action.roomId);
          draftRoomToParents.forEach((parents, child) => {
            parents.delete(action.roomId);
            if (parents.size === 0) noParentRooms.push(child);
          });
          noParentRooms.forEach((room) => draftRoomToParents.delete(room));
        })
      );
    }
  }
);

export const useBindRoomToParentsAtom = (
  mx: MatrixClient,
  roomToParents: typeof roomToParentsAtom
) => {
  const setRoomToParents = useSetAtom(roomToParents);
  const resetRoomToParents = useCallback(
    () => setRoomToParents({ type: 'INITIALIZE', roomToParents: getRoomToParents(mx) }),
    [mx, setRoomToParents]
  );

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (
          (state === SyncState.Prepared && prevState === null) ||
          (state === SyncState.Syncing && prevState !== SyncState.Syncing)
        ) {
          resetRoomToParents();
        }
      },
      [resetRoomToParents]
    )
  );

  useEffect(() => {
    resetRoomToParents();

    const handleAddRoom = (room: Room) => {
      if (isSpace(room) && room.getMyMembership() === (KnownMembership.Join as string)) {
        setRoomToParents({
          type: 'PUT',
          parent: room.roomId,
          children: getSpaceChildren(room),
        });
      }
    };

    const handleMembershipChange = (room: Room, membership: string) => {
      if (isSpace(room) && membership !== (KnownMembership.Join as string)) {
        setRoomToParents({ type: 'DELETE', roomId: room.roomId });
        return;
      }
      if (isSpace(room) && membership === (KnownMembership.Join as string)) {
        setRoomToParents({
          type: 'PUT',
          parent: room.roomId,
          children: getSpaceChildren(room),
        });
      }
    };

    const handleStateChange = (mEvent: MatrixEvent) => {
      if (mEvent.getType() === (EventType.SpaceChild as string)) {
        const childId = mEvent.getStateKey();
        const roomId = mEvent.getRoomId();
        if (childId && roomId) {
          const parentRoom = mx.getRoom(roomId);
          if (!parentRoom || parentRoom.getMyMembership() !== (KnownMembership.Join as string))
            return;
          if (isValidChild(mEvent)) {
            setRoomToParents({ type: 'PUT', parent: roomId, children: [childId] });
          } else {
            setRoomToParents({ type: 'REMOVE_CHILD', parent: roomId, child: childId });
          }
        }
      }
    };

    const handleDeleteRoom = (roomId: string) => {
      setRoomToParents({ type: 'DELETE', roomId });
    };

    mx.on(ClientEvent.Room, handleAddRoom);
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    mx.on(RoomStateEvent.Events, handleStateChange);
    mx.on(ClientEvent.DeleteRoom, handleDeleteRoom);
    return () => {
      mx.removeListener(ClientEvent.Room, handleAddRoom);
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
      mx.removeListener(RoomStateEvent.Events, handleStateChange);
      mx.removeListener(ClientEvent.DeleteRoom, handleDeleteRoom);
    };
  }, [mx, setRoomToParents, resetRoomToParents]);
};
