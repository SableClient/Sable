import { describe, expect, it, vi } from 'vitest';
import { EventType, MsgType, NotificationCountType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import {
  getRoomReadMarkerId,
  getUnreadInfo,
  resolveSpaceNavigationRoot,
  roomHaveUnread,
} from './room';

const USER_ID = '@alice:example.com';

function makeClient(): MatrixClient {
  return {
    getUserId: () => USER_ID,
    getAccountData: () => undefined,
    getRoomPushRule: vi.fn<() => undefined>(),
  } as unknown as MatrixClient;
}

function makeEvent(eventId: string, sender = '@bob:example.com'): MatrixEvent {
  return {
    getId: () => eventId,
    getSender: () => sender,
    getType: () => EventType.RoomMessage,
    getContent: () => ({ msgtype: MsgType.Text, body: 'hello' }),
    getRelation: () => undefined,
    isRedacted: () => false,
    isSending: () => false,
  } as unknown as MatrixEvent;
}

function makeReactionEvent(
  eventId: string,
  relatedEventId: string,
  sender = '@bob:example.com'
): MatrixEvent {
  return {
    getId: () => eventId,
    getSender: () => sender,
    getType: () => EventType.Reaction,
    getContent: () => ({ 'm.relates_to': { rel_type: 'm.annotation', event_id: relatedEventId } }),
    getRelation: () => ({ rel_type: 'm.annotation', event_id: relatedEventId }),
    isRedacted: () => false,
    isSending: () => false,
  } as unknown as MatrixEvent;
}

function makeRoom(params: {
  readUpToId?: string;
  fullyReadId?: string;
  events: MatrixEvent[];
  total?: number;
  highlight?: number;
}): Room {
  const client = makeClient();
  return {
    roomId: '!room:example.com',
    client,
    getEventReadUpTo: () => params.readUpToId,
    getAccountData: (eventType: string) =>
      eventType === EventType.FullyRead && params.fullyReadId
        ? ({
            getContent: () => ({ event_id: params.fullyReadId }),
          } as unknown as MatrixEvent)
        : undefined,
    getLiveTimeline: () => ({
      getEvents: () => params.events,
    }),
    findEventById: (eventId: string) => params.events.find((event) => event.getId() === eventId),
    getUnreadNotificationCount: (type: NotificationCountType) =>
      type === NotificationCountType.Highlight ? (params.highlight ?? 0) : (params.total ?? 0),
    getRoomUnreadNotificationCount: () => params.total ?? 0,
    hasUserReadEvent: (_userId: string, eventId: string) => eventId === params.readUpToId,
    fixupNotifications: vi.fn<() => void>(),
  } as unknown as Room;
}

function makeSpaceRoom(
  roomId: string,
  options?: { membership?: string; childIds?: string[] }
): Room {
  return {
    roomId,
    isSpaceRoom: () => true,
    getMyMembership: () => options?.membership ?? 'join',
    getLiveTimeline: () => ({
      getState: () => ({
        getStateEvents: (eventType: string) => {
          if (eventType === EventType.RoomCreate) {
            return {
              getContent: () => ({ type: 'm.space' }),
            };
          }
          if (eventType === EventType.SpaceChild) {
            return (options?.childIds ?? []).map((childId) => ({
              getType: () => EventType.SpaceChild,
              getStateKey: () => childId,
              getContent: () => ({ via: ['example.com'] }),
            }));
          }
          return [];
        },
      }),
    }),
  } as unknown as Room;
}

describe('room read markers', () => {
  it('falls back to m.fully_read when a receipt is not available', () => {
    const room = makeRoom({ fullyReadId: '$event1', events: [makeEvent('$event1')] });

    expect(getRoomReadMarkerId(room, USER_ID)).toBe('$event1');
  });

  it('prefers m.fully_read when it is newer than the receipt in the live timeline', () => {
    const room = makeRoom({
      readUpToId: '$event1',
      fullyReadId: '$event3',
      events: [makeEvent('$event1'), makeEvent('$event2'), makeEvent('$event3')],
    });

    expect(getRoomReadMarkerId(room, USER_ID)).toBe('$event3');
  });

  it('keeps the receipt when it is newer than m.fully_read in the live timeline', () => {
    const room = makeRoom({
      readUpToId: '$event3',
      fullyReadId: '$event1',
      events: [makeEvent('$event1'), makeEvent('$event2'), makeEvent('$event3')],
    });

    expect(getRoomReadMarkerId(room, USER_ID)).toBe('$event3');
  });

  it('does not treat non-live hydrated events before m.fully_read as unread', () => {
    const room = makeRoom({
      fullyReadId: '$event2',
      events: [makeEvent('$event1'), makeEvent('$event2')],
    });

    expect(roomHaveUnread(room.client, room)).toBe(false);
    expect(getUnreadInfo(room, { applyFixup: false })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 0,
    });
  });

  it('treats hydrated events after m.fully_read as unread', () => {
    const room = makeRoom({
      fullyReadId: '$event1',
      events: [makeEvent('$event1'), makeEvent('$event2')],
    });

    expect(roomHaveUnread(room.client, room)).toBe(true);
    expect(getUnreadInfo(room, { applyFixup: false })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 1,
    });
  });

  it('does not infer unread state from hydrated timeline events without a read marker', () => {
    const room = makeRoom({
      events: [makeEvent('$event1')],
    });

    expect(roomHaveUnread(room.client, room)).toBe(false);
    expect(getUnreadInfo(room, { applyFixup: false })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 0,
    });
  });

  it('clamps stale SDK counts when m.fully_read is the only read marker', () => {
    const room = makeRoom({
      fullyReadId: '$event2',
      events: [makeEvent('$event1'), makeEvent('$event2')],
      total: 1,
    });

    expect(getUnreadInfo(room, { applyFixup: false })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 0,
    });
  });

  it('suppresses stale counts when the current user sent the latest hydrated event', () => {
    const room = makeRoom({
      fullyReadId: '$event1',
      events: [makeEvent('$event1'), makeEvent('$event2', USER_ID)],
      total: 1,
    });

    expect(getUnreadInfo(room, { applyFixup: false })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 0,
    });
  });

  it('clamps inflated sliding-sync counts to unread events visible after the read marker', () => {
    const room = makeRoom({
      fullyReadId: '$event1',
      events: [makeEvent('$event1'), makeEvent('$event2'), makeEvent('$event3')],
      total: 30,
    });

    expect(getUnreadInfo(room, { applyFixup: true })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 2,
    });
  });

  it('does not synthesize a phantom dot when only a non-notifying reaction is unread', () => {
    const room = makeRoom({
      fullyReadId: '$event1',
      events: [makeEvent('$event1', USER_ID), makeReactionEvent('$event2', '$event1')],
    });

    expect(roomHaveUnread(room.client, room)).toBe(false);
    expect(getUnreadInfo(room, { applyFixup: false })).toEqual({
      roomId: '!room:example.com',
      highlight: 0,
      total: 0,
    });
  });
});

describe('resolveSpaceNavigationRoot', () => {
  it('rejects stale stored roots that are not joined in the live client graph', () => {
    const joinedRoot = makeSpaceRoom('!joined-space:example.com', {
      childIds: ['!room:example.com'],
    });
    const staleRoot = makeSpaceRoom('!stale-space:example.com', {
      membership: 'leave',
    });

    const mx = {
      getRoom: (roomId: string) =>
        roomId === joinedRoot.roomId ? joinedRoot : roomId === staleRoot.roomId ? staleRoot : null,
      getRooms: () => [joinedRoot, staleRoot],
    } as unknown as MatrixClient;

    const cachedRoomToParents = new Map<string, Set<string>>([
      ['!room:example.com', new Set([staleRoot.roomId])],
    ]);

    expect(
      resolveSpaceNavigationRoot(mx, cachedRoomToParents, '!room:example.com', {
        storedRootSpaceId: staleRoot.roomId,
      })
    ).toEqual({
      rootSpaceId: joinedRoot.roomId,
      source: 'preferred_chain',
    });
  });

  it('prefers the shortest sidebar-pinned ancestor path over a longer fallback chain', () => {
    const roomId = '!room:example.com';
    const groupingSpaceId = '!grouping-space:example.com';
    const shortcutRootSpaceId = '!shortcut-root:example.com';
    const longRootSpaceId = '!long-root:example.com';

    const groupingSpace = makeSpaceRoom(groupingSpaceId, { childIds: [roomId] });
    const shortcutRoot = makeSpaceRoom(shortcutRootSpaceId, { childIds: [groupingSpaceId] });
    const longRoot = makeSpaceRoom(longRootSpaceId, { childIds: [shortcutRootSpaceId] });

    const mx = {
      getRoom: (targetRoomId: string) => {
        if (targetRoomId === groupingSpaceId) return groupingSpace;
        if (targetRoomId === shortcutRootSpaceId) return shortcutRoot;
        if (targetRoomId === longRootSpaceId) return longRoot;
        return null;
      },
      getRooms: () => [groupingSpace, shortcutRoot, longRoot],
      getAccountData: (eventType: string) =>
        eventType === CustomAccountDataEvent.CinnySpaces
          ? ({
              getContent: () => ({
                sidebar: [longRootSpaceId, shortcutRootSpaceId],
              }),
            } as unknown as MatrixEvent)
          : undefined,
    } as unknown as MatrixClient;

    const roomToParents = new Map<string, Set<string>>([
      [roomId, new Set([groupingSpaceId])],
      [groupingSpaceId, new Set([shortcutRootSpaceId])],
      [shortcutRootSpaceId, new Set([longRootSpaceId])],
    ]);

    expect(resolveSpaceNavigationRoot(mx, roomToParents, roomId)).toEqual({
      rootSpaceId: shortcutRootSpaceId,
      source: 'sidebar_shortcut',
    });
  });

  it('treats spaces pinned inside sidebar folders as valid sidebar roots', () => {
    const roomId = '!room:example.com';
    const groupingSpaceId = '!grouping-space:example.com';
    const folderPinnedSpaceId = '!folder-pinned-space:example.com';
    const longRootSpaceId = '!long-root:example.com';

    const groupingSpace = makeSpaceRoom(groupingSpaceId, { childIds: [roomId] });
    const folderPinnedSpace = makeSpaceRoom(folderPinnedSpaceId, { childIds: [groupingSpaceId] });
    const longRoot = makeSpaceRoom(longRootSpaceId, { childIds: [folderPinnedSpaceId] });

    const mx = {
      getRoom: (targetRoomId: string) => {
        if (targetRoomId === groupingSpaceId) return groupingSpace;
        if (targetRoomId === folderPinnedSpaceId) return folderPinnedSpace;
        if (targetRoomId === longRootSpaceId) return longRoot;
        return null;
      },
      getRooms: () => [groupingSpace, folderPinnedSpace, longRoot],
      getAccountData: (eventType: string) =>
        eventType === CustomAccountDataEvent.CinnySpaces
          ? ({
              getContent: () => ({
                sidebar: [
                  {
                    id: 'folder-1',
                    content: [folderPinnedSpaceId],
                  },
                  longRootSpaceId,
                ],
              }),
            } as unknown as MatrixEvent)
          : undefined,
    } as unknown as MatrixClient;

    const roomToParents = new Map<string, Set<string>>([
      [roomId, new Set([groupingSpaceId])],
      [groupingSpaceId, new Set([folderPinnedSpaceId])],
      [folderPinnedSpaceId, new Set([longRootSpaceId])],
    ]);

    expect(resolveSpaceNavigationRoot(mx, roomToParents, roomId)).toEqual({
      rootSpaceId: folderPinnedSpaceId,
      source: 'sidebar_shortcut',
    });
  });
});
