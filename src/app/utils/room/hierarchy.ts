import type {
  AccountDataEvents,
  IPowerLevelsContent,
  MatrixClient,
  MatrixEvent,
  Room,
  StateEvents,
} from '$types/matrix-sdk';
import { EventTimeline, EventType, KnownMembership, RoomType } from '$types/matrix-sdk';

import type { IRoomCreateContent, RoomToParents } from '$types/matrix/room';

export const getStateEvent = (
  room: Room,
  eventType: keyof StateEvents,
  stateKey = ''
): MatrixEvent | undefined =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType, stateKey) ??
  undefined;

export const getStateEvents = (room: Room, eventType: keyof StateEvents): MatrixEvent[] =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType) ?? [];

export const getAccountData = (
  mx: MatrixClient,
  eventType: keyof AccountDataEvents
): MatrixEvent | undefined => mx.getAccountData(eventType);

export const isSpace = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, EventType.RoomCreate);
  if (!event) return false;
  return event.getContent().type === RoomType.Space;
};

export const isRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, EventType.RoomCreate);
  if (!event) return true;
  return event.getContent().type !== RoomType.Space;
};

export const isUnsupportedRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, EventType.RoomCreate);
  if (!event) return true; // Consider room unsupported if m.room.create event doesn't exist
  return event.getContent().type !== undefined && event.getContent().type !== RoomType.Space;
};

export function isValidChild(mEvent: MatrixEvent): boolean {
  return (
    mEvent.getType() === (EventType.SpaceChild as string) &&
    Array.isArray(mEvent.getContent<{ via: string[] }>().via)
  );
}

export const getAllParents = (roomToParents: RoomToParents, roomId: string): Set<string> => {
  const allParents = new Set<string>();

  const addAllParentIds = (rId: string) => {
    if (allParents.has(rId)) return;
    allParents.add(rId);

    const parents = roomToParents.get(rId);
    parents?.forEach((id) => addAllParentIds(id));
  };
  addAllParentIds(roomId);
  allParents.delete(roomId);
  return allParents;
};

export const getSpaceChildren = (room: Room) =>
  getStateEvents(room, EventType.SpaceChild).reduce<string[]>((filtered, mEvent) => {
    const stateKey = mEvent.getStateKey();
    if (isValidChild(mEvent) && stateKey) {
      filtered.push(stateKey);
    }
    return filtered;
  }, []);

export const getJoinedSpaceChildrenLeaveOrder = (
  mx: MatrixClient,
  rootSpaceId: string
): string[] => {
  const leaveOrder: string[] = [];
  const visited = new Set<string>();

  const isJoinedChild = (room: Room): boolean =>
    room.getMyMembership() === (KnownMembership.Join as string) &&
    !getStateEvent(room, EventType.RoomTombstone);

  const visitSpace = (spaceId: string) => {
    if (visited.has(spaceId)) return;
    visited.add(spaceId);

    const space = mx.getRoom(spaceId);
    if (!space || !isJoinedChild(space)) return;

    getSpaceChildren(space).forEach((childId) => {
      if (visited.has(childId)) return;

      const child = mx.getRoom(childId);
      if (!child || !isJoinedChild(child)) return;

      if (child.isSpaceRoom()) {
        visitSpace(childId);
        return;
      }

      visited.add(childId);
      leaveOrder.push(childId);
    });

    if (spaceId !== rootSpaceId) {
      leaveOrder.push(spaceId);
    }
  };

  visitSpace(rootSpaceId);

  return leaveOrder.filter((id) => id !== rootSpaceId);
};

export type JoinedSpaceChildrenSummary = {
  leaveOrder: string[];
  roomCount: number;
  subspaceCount: number;
};

export const getJoinedSpaceChildrenSummary = (
  mx: MatrixClient,
  rootSpaceId: string
): JoinedSpaceChildrenSummary => {
  const leaveOrder = getJoinedSpaceChildrenLeaveOrder(mx, rootSpaceId);
  let roomCount = 0;
  let subspaceCount = 0;

  leaveOrder.forEach((id) => {
    const room = mx.getRoom(id);
    if (room?.isSpaceRoom()) {
      subspaceCount += 1;
    } else {
      roomCount += 1;
    }
  });

  return { leaveOrder, roomCount, subspaceCount };
};

export const getRecursiveSpaceLeaveOrder = (mx: MatrixClient, rootSpaceId: string): string[] => [
  ...getJoinedSpaceChildrenLeaveOrder(mx, rootSpaceId),
  rootSpaceId,
];

export const mapParentWithChildren = (
  roomToParents: RoomToParents,
  roomId: string,
  children: string[]
) => {
  const allParents = getAllParents(roomToParents, roomId);
  children.forEach((childId) => {
    if (allParents.has(childId)) {
      // Space cycle detected.
      return;
    }
    const parents = roomToParents.get(childId) ?? new Set<string>();
    parents.add(roomId);
    roomToParents.set(childId, parents);
  });
};

export const getRoomToParents = (mx: MatrixClient): RoomToParents => {
  const map: RoomToParents = new Map();
  mx.getRooms()
    .filter((room) => isSpace(room) && room.getMyMembership() === (KnownMembership.Join as string))
    .forEach((room) => mapParentWithChildren(map, room.roomId, getSpaceChildren(room)));

  return map;
};

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  return Array.from(parents).filter((parentRoomId) => !roomToParents.has(parentRoomId));
};

const getAllVersionsRoomCreator = (room: Room): Set<string> => {
  const creators = new Set<string>();

  const createEvent = getStateEvent(room, EventType.RoomCreate);
  const createContent = createEvent?.getContent<IRoomCreateContent>();
  const creator = createEvent?.getSender();
  if (typeof creator === 'string') creators.add(creator);

  if (createContent && Array.isArray(createContent.additional_creators)) {
    createContent.additional_creators.forEach((c) => {
      creators.add(c);
    });
  }

  return creators;
};

export const guessPerfectParent = (
  mx: MatrixClient,
  roomId: string,
  parents: string[]
): string | undefined => {
  if (parents.length === 1) {
    return parents[0];
  }

  const getSpecialUsers = (rId: string): string[] => {
    const specialUsers: Set<string> = new Set();

    const r = mx.getRoom(rId);
    if (!r) return [];

    getAllVersionsRoomCreator(r).forEach((c) => specialUsers.add(c));

    const powerLevels = getStateEvent(
      r,
      EventType.RoomPowerLevels
    )?.getContent<IPowerLevelsContent>();

    const { users_default: usersDefault, users } = powerLevels ?? {};
    const defaultPower = typeof usersDefault === 'number' ? usersDefault : 0;

    if (typeof users === 'object')
      Object.keys(users).forEach((userId) => {
        if (users[userId]! > defaultPower) {
          specialUsers.add(userId);
        }
      });

    return Array.from(specialUsers);
  };

  let perfectParent: string | undefined;
  let score = 0;

  const roomSpecialUsers = getSpecialUsers(roomId);
  parents.forEach((parentId) => {
    const parentSpecialUsers = getSpecialUsers(parentId);
    const matchedUsersCount = parentSpecialUsers.filter((userId) =>
      roomSpecialUsers.includes(userId)
    ).length;

    if (matchedUsersCount > score) {
      score = matchedUsersCount;
      perfectParent = parentId;
    }
  });

  return perfectParent;
};
