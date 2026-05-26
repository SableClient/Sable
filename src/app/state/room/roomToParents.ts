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
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from '../utils/atomWithLocalStorage';

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

// Strategy 2: Cache room hierarchy in localStorage to eliminate startup computation
const ROOM_TO_PARENTS_CACHE_KEY = 'roomToParents';

const baseCachedRoomToParents = atomWithLocalStorage<RoomToParents>(
  ROOM_TO_PARENTS_CACHE_KEY,
  (key: string) => {
    // Deserialize from localStorage: [roomId, [parent1, parent2, ...]][]
    const cached = getLocalStorageItem<[string, string[]][]>(key, []);
    return new Map(cached.map(([room, parents]: [string, string[]]) => [room, new Set(parents)]));
  },
  (key: string, value: RoomToParents) => {
    // Serialize to localStorage: convert Map<string, Set<string>> to array
    const serializable = Array.from(value.entries()).map(
      ([room, parents]: [string, Set<string>]) => [room, Array.from(parents)]
    );
    setLocalStorageItem(key, serializable);
  }
);

const baseRoomToParents = atom(new Map());
export const roomToParentsAtom = atom<RoomToParents, [RoomToParentsAction], undefined>(
  (get) => get(baseRoomToParents),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      set(baseRoomToParents, action.roomToParents);
      // Also update cache
      set(baseCachedRoomToParents, action.roomToParents);
      return;
    }
    if (action.type === 'PUT') {
      const newValue = produce(get(baseRoomToParents), (draftRoomToParents) => {
        mapParentWithChildren(draftRoomToParents, action.parent, action.children);
      });
      set(baseRoomToParents, newValue);
      // Also update cache
      set(baseCachedRoomToParents, newValue);
      return;
    }
    if (action.type === 'REMOVE_CHILD') {
      const newValue = produce(get(baseRoomToParents), (draftRoomToParents) => {
        const parents = draftRoomToParents.get(action.child);
        if (!parents) return;
        parents.delete(action.parent);
        if (parents.size === 0) {
          draftRoomToParents.delete(action.child);
        } else {
          draftRoomToParents.set(action.child, parents);
        }
      });
      set(baseRoomToParents, newValue);
      // Also update cache
      set(baseCachedRoomToParents, newValue);
      return;
    }
    if (action.type === 'DELETE') {
      const newValue = produce(get(baseRoomToParents), (draftRoomToParents) => {
        const noParentRooms: string[] = [];
        draftRoomToParents.delete(action.roomId);
        draftRoomToParents.forEach((parents, child) => {
          parents.delete(action.roomId);
          if (parents.size === 0) noParentRooms.push(child);
        });
        noParentRooms.forEach((room) => draftRoomToParents.delete(room));
      });
      set(baseRoomToParents, newValue);
      // Also update cache
      set(baseCachedRoomToParents, newValue);
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

  // Strategy 2: Initialize from cache immediately on mount
  useEffect(() => {
    const cached = getLocalStorageItem<[string, string[]][]>(ROOM_TO_PARENTS_CACHE_KEY, []);
    if (cached.length > 0) {
      const cachedMap = new Map(
        cached.map(([room, parents]: [string, string[]]) => [room, new Set(parents)])
      );
      setRoomToParents({ type: 'INITIALIZE', roomToParents: cachedMap });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
