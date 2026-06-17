import { describe, expect, it } from 'vitest';
import { EventType, KnownMembership, RoomType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getJoinedSpaceChildrenLeaveOrder, getJoinedSpaceChildrenSummary } from './room';

/* oxlint-disable typescript/no-explicit-any */

const SPACE = '!space:example.com';
const SUBSPACE = '!subspace:example.com';
const ROOM_1 = '!room1:example.com';
const ROOM_2 = '!room2:example.com';
const TOMBSTONED = '!old:example.com';

const createSpaceChildEvent = (childId: string) =>
  ({
    getType: () => EventType.SpaceChild,
    getStateKey: () => childId,
    getContent: () => ({ via: [] }),
  }) as unknown as MatrixEvent;

const createRoom = (
  roomId: string,
  options: {
    isSpace?: boolean;
    membership?: string;
    tombstoned?: boolean;
    children?: string[];
  } = {}
): Room => {
  const {
    isSpace = false,
    membership = KnownMembership.Join,
    tombstoned = false,
    children = [],
  } = options;

  const stateEvents: MatrixEvent[] = [
    {
      getType: () => EventType.RoomCreate,
      getStateKey: () => '',
      getContent: () => ({ type: isSpace ? RoomType.Space : undefined }),
    } as unknown as MatrixEvent,
    ...children.map(createSpaceChildEvent),
  ];

  if (tombstoned) {
    stateEvents.push({
      getType: () => EventType.RoomTombstone,
      getStateKey: () => '',
      getContent: () => ({ body: 'Upgraded', replacement_room: '!new:example.com' }),
    } as unknown as MatrixEvent);
  }

  return {
    roomId,
    getMyMembership: () => membership,
    isSpaceRoom: () => isSpace,
    getLiveTimeline: () => ({
      getState: () => ({
        getStateEvents: (eventType: string, stateKey?: string) => {
          const events = stateEvents.filter((event) => event.getType() === eventType);
          if (stateKey !== undefined) {
            return events.find((event) => event.getStateKey?.() === stateKey);
          }
          return events;
        },
      }),
    }),
  } as unknown as Room;
};

const createClient = (rooms: Record<string, Room>): MatrixClient =>
  ({
    getRoom: (roomId: string) => rooms[roomId],
  }) as unknown as MatrixClient;

describe('getJoinedSpaceChildrenLeaveOrder', () => {
  it('returns only direct rooms for a flat space', () => {
    const mx = createClient({
      [SPACE]: createRoom(SPACE, { isSpace: true, children: [ROOM_1, ROOM_2] }),
      [ROOM_1]: createRoom(ROOM_1),
      [ROOM_2]: createRoom(ROOM_2),
    });

    expect(getJoinedSpaceChildrenLeaveOrder(mx, SPACE)).toEqual([ROOM_1, ROOM_2]);
  });

  it('does not include the root space itself', () => {
    const mx = createClient({
      [SPACE]: createRoom(SPACE, { isSpace: true, children: [SPACE, ROOM_1] }),
      [ROOM_1]: createRoom(ROOM_1),
    });

    expect(getJoinedSpaceChildrenLeaveOrder(mx, SPACE)).toEqual([ROOM_1]);
  });

  it('includes nested rooms and subspaces without counting the root space', () => {
    const mx = createClient({
      [SPACE]: createRoom(SPACE, { isSpace: true, children: [SUBSPACE] }),
      [SUBSPACE]: createRoom(SUBSPACE, { isSpace: true, children: [ROOM_1, ROOM_2] }),
      [ROOM_1]: createRoom(ROOM_1),
      [ROOM_2]: createRoom(ROOM_2),
    });

    expect(getJoinedSpaceChildrenLeaveOrder(mx, SPACE)).toEqual([ROOM_1, ROOM_2, SUBSPACE]);
  });

  it('skips tombstoned rooms', () => {
    const mx = createClient({
      [SPACE]: createRoom(SPACE, {
        isSpace: true,
        children: [ROOM_1, ROOM_2, TOMBSTONED],
      }),
      [ROOM_1]: createRoom(ROOM_1),
      [ROOM_2]: createRoom(ROOM_2),
      [TOMBSTONED]: createRoom(TOMBSTONED, { tombstoned: true }),
    });

    expect(getJoinedSpaceChildrenLeaveOrder(mx, SPACE)).toEqual([ROOM_1, ROOM_2]);
  });
});

describe('getJoinedSpaceChildrenSummary', () => {
  it('separates room and subspace counts', () => {
    const mx = createClient({
      [SPACE]: createRoom(SPACE, { isSpace: true, children: [SUBSPACE] }),
      [SUBSPACE]: createRoom(SUBSPACE, { isSpace: true, children: [ROOM_1, ROOM_2] }),
      [ROOM_1]: createRoom(ROOM_1),
      [ROOM_2]: createRoom(ROOM_2),
    });

    expect(getJoinedSpaceChildrenSummary(mx, SPACE)).toEqual({
      leaveOrder: [ROOM_1, ROOM_2, SUBSPACE],
      roomCount: 2,
      subspaceCount: 1,
    });
  });
});
