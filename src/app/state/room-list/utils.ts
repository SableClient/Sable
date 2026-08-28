import type { WritableAtom } from 'jotai';
import { useSetAtom } from 'jotai';
import type { MatrixClient, Membership, Room } from '$types/matrix-sdk';
import { ClientEvent, RoomEvent } from '$types/matrix-sdk';
import { useEffect } from 'react';

export type RoomsAction =
  | {
      type: 'INITIALIZE';
      rooms: string[];
    }
  | {
      type: 'PUT';
      roomId: string;
    }
  | {
      type: 'DELETE';
      roomId: string;
    }
  | {
      type: 'BATCH';
      put: string[];
      delete: string[];
    };

export const applyRoomsAction = (ids: string[], action: RoomsAction): string[] => {
  if (action.type === 'INITIALIZE') return [...new Set(action.rooms)];

  if (action.type === 'PUT') {
    if (ids.includes(action.roomId)) return ids;
    return [...ids, action.roomId];
  }

  if (action.type === 'DELETE') {
    if (!ids.includes(action.roomId)) return ids;
    return ids.filter((id) => id !== action.roomId);
  }

  const deleted = new Set(action.delete);
  const next = deleted.size === 0 ? [...ids] : ids.filter((id) => !deleted.has(id));
  const known = new Set(next);
  action.put.forEach((roomId) => {
    if (known.has(roomId)) return;
    known.add(roomId);
    next.push(roomId);
  });

  const unchanged =
    next.length === ids.length && next.every((roomId, index) => roomId === ids[index]);
  return unchanged ? ids : next;
};

export const useBindRoomsWithMembershipsAtom = (
  mx: MatrixClient,
  roomsAtom: WritableAtom<string[], [RoomsAction], undefined>,
  memberships: Membership[]
) => {
  const setRoomsAtom = useSetAtom(roomsAtom);

  useEffect(() => {
    let flushTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const pendingRoomActions = new Map<string, 'PUT' | 'DELETE'>();

    const flushPendingRoomActions = () => {
      flushTimer = undefined;
      if (pendingRoomActions.size === 0) return;

      const put: string[] = [];
      const deleted: string[] = [];
      pendingRoomActions.forEach((action, roomId) => {
        if (action === 'PUT') put.push(roomId);
        else deleted.push(roomId);
      });
      pendingRoomActions.clear();
      setRoomsAtom({ type: 'BATCH', put, delete: deleted });
    };

    const queueRoomAction = (action: 'PUT' | 'DELETE', roomId: string) => {
      pendingRoomActions.set(roomId, action);
      if (flushTimer === undefined) {
        flushTimer = globalThis.setTimeout(flushPendingRoomActions, 0);
      }
    };

    const satisfyMembership = (room: Room): boolean =>
      !!memberships.find((membership) => membership === room.getMyMembership());
    setRoomsAtom({
      type: 'INITIALIZE',
      rooms: mx
        .getRooms()
        .filter(satisfyMembership)
        .map((room) => room.roomId),
    });

    const handleAddRoom = (room: Room) => {
      if (satisfyMembership(room)) {
        queueRoomAction('PUT', room.roomId);
      }
    };

    const handleMembershipChange = (room: Room) => {
      if (satisfyMembership(room)) {
        queueRoomAction('PUT', room.roomId);
      } else {
        queueRoomAction('DELETE', room.roomId);
      }
    };

    const handleDeleteRoom = (roomId: string) => {
      queueRoomAction('DELETE', roomId);
    };

    mx.on(ClientEvent.Room, handleAddRoom);
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    mx.on(ClientEvent.DeleteRoom, handleDeleteRoom);
    return () => {
      if (flushTimer !== undefined) globalThis.clearTimeout(flushTimer);
      pendingRoomActions.clear();
      mx.removeListener(ClientEvent.Room, handleAddRoom);
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
      mx.removeListener(ClientEvent.DeleteRoom, handleDeleteRoom);
    };
  }, [mx, memberships, setRoomsAtom]);
};

export const compareRoomsEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return a.every((roomId, roomIdIndex) => roomId === b[roomIdIndex]);
};
