import { describe, expect, it, vi } from 'vitest';
import { EventType, MsgType, NotificationCountType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getRoomReadMarkerId, getUnreadInfo, roomHaveUnread } from './room';

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
    getUnreadNotificationCount: (type: NotificationCountType) =>
      type === NotificationCountType.Highlight ? (params.highlight ?? 0) : (params.total ?? 0),
    getRoomUnreadNotificationCount: () => params.total ?? 0,
    hasUserReadEvent: (_userId: string, eventId: string) => eventId === params.readUpToId,
    fixupNotifications: vi.fn<() => void>(),
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
});
