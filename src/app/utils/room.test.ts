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
    hasUserReadEvent: (_userId: string, eventId: string) =>
      eventId === (params.readUpToId ?? params.fullyReadId),
  } as unknown as Room;
}

describe('room read markers', () => {
  it('falls back to m.fully_read when a receipt is not available', () => {
    const room = makeRoom({ fullyReadId: '$event1', events: [makeEvent('$event1')] });

    expect(getRoomReadMarkerId(room, USER_ID)).toBe('$event1');
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
});
