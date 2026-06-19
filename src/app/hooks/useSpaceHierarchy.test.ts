import { describe, expect, it } from 'vitest';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { EventTimeline, EventType } from '$types/matrix-sdk';
import { getSpaceJoinedHierarchy } from './useSpaceHierarchy';

const makeChildEvent = (stateKey: string, ts = 1): MatrixEvent =>
  ({
    getType: () => EventType.SpaceChild as string,
    getContent: () => ({ via: ['example.org'] }),
    getStateKey: () => stateKey,
    getTs: () => ts,
  }) as unknown as MatrixEvent;

const makeRoom = (roomId: string, opts: { space: boolean; children?: MatrixEvent[] }): Room =>
  ({
    roomId,
    isSpaceRoom: () => opts.space,
    getLiveTimeline: () => ({
      getState: (direction: unknown) =>
        direction === EventTimeline.FORWARDS
          ? {
              getStateEvents: (eventType: string) =>
                eventType === EventType.SpaceChild ? (opts.children ?? []) : [],
            }
          : undefined,
    }),
  }) as unknown as Room;

describe('getSpaceJoinedHierarchy', () => {
  it('keeps collapsed space headers visible even when their child rooms are hidden', () => {
    const rootRoomId = '!root:example.org';
    const subspaceRoomId = '!subspace:example.org';
    const leafRoomId = '!leaf:example.org';

    const rooms = new Map<string, Room>([
      [
        rootRoomId,
        makeRoom(rootRoomId, { space: true, children: [makeChildEvent(subspaceRoomId)] }),
      ],
      [
        subspaceRoomId,
        makeRoom(subspaceRoomId, { space: true, children: [makeChildEvent(leafRoomId)] }),
      ],
      [leafRoomId, makeRoom(leafRoomId, { space: false })],
    ]);

    const hierarchy = getSpaceJoinedHierarchy(
      rootRoomId,
      (roomId) => rooms.get(roomId),
      (_parentId, roomId) => roomId === leafRoomId,
      () => false,
      (_parentId, items) => items
    );

    expect(hierarchy.map((item) => item.roomId)).toEqual([rootRoomId, subspaceRoomId]);
  });

  it('prunes branches whose only descendants are permanently excluded', () => {
    const rootRoomId = '!root:example.org';
    const subspaceRoomId = '!subspace:example.org';
    const dmRoomId = '!dm:example.org';

    const rooms = new Map<string, Room>([
      [
        rootRoomId,
        makeRoom(rootRoomId, { space: true, children: [makeChildEvent(subspaceRoomId)] }),
      ],
      [
        subspaceRoomId,
        makeRoom(subspaceRoomId, { space: true, children: [makeChildEvent(dmRoomId)] }),
      ],
      [dmRoomId, makeRoom(dmRoomId, { space: false })],
    ]);

    const hierarchy = getSpaceJoinedHierarchy(
      rootRoomId,
      (roomId) => rooms.get(roomId),
      (_parentId, roomId) => roomId === dmRoomId,
      (_parentId, roomId) => roomId === dmRoomId,
      (_parentId, items) => items
    );

    expect(hierarchy).toEqual([]);
  });
});
