import { describe, expect, it, vi } from 'vitest';
import { EventType, MsgType, NotificationCountType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getRoomUnreadInfo } from './timeline';

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
  const liveTimeline = {
    getEvents: () => params.events,
    getNeighbouringTimeline: () => undefined,
  };

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
    getLiveTimeline: () => liveTimeline,
    getUnfilteredTimelineSet: () => ({
      getTimelineForEvent: (eventId: string) =>
        params.events.some((event) => event.getId() === eventId) ? liveTimeline : undefined,
    }),
    getUnreadNotificationCount: (type: NotificationCountType) =>
      type === NotificationCountType.Highlight ? (params.highlight ?? 0) : (params.total ?? 0),
    getRoomUnreadNotificationCount: () => params.total ?? 0,
    hasUserReadEvent: (_userId: string, eventId: string) => eventId === params.readUpToId,
    fixupNotifications: vi.fn<() => void>(),
  } as unknown as Room;
}

describe('getRoomUnreadInfo', () => {
  it('surfaces unread jump info when reconciled unread state exists without SDK counters', () => {
    const room = makeRoom({
      fullyReadId: '$event1',
      events: [makeEvent('$event1'), makeEvent('$event2')],
      total: 0,
      highlight: 0,
    });

    expect(getRoomUnreadInfo(room)).toEqual({
      readUptoEventId: '$event1',
      inLiveTimeline: true,
      scrollTo: false,
    });
  });

  it('returns undefined when the room has no unread state', () => {
    const room = makeRoom({
      fullyReadId: '$event2',
      events: [makeEvent('$event1'), makeEvent('$event2')],
      total: 0,
      highlight: 0,
    });

    expect(getRoomUnreadInfo(room)).toBeUndefined();
  });
});
