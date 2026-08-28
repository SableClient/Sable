import { describe, expect, it, vi } from 'vitest';
import { ReceiptType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { UnreadCountResolver, type UnreadResolutionUpdate } from './room/unreadResolver';

const ROOM_ID = '!room:example.com';
const ME = '@user:example.com';
const OTHER = '@other:example.com';

const createEvent = (id: string, sender = OTHER, type = 'm.room.message'): MatrixEvent =>
  ({
    getId: () => id,
    getSender: () => sender,
    getType: () => type,
    isRedacted: () => false,
    getRelation: () => undefined,
  }) as unknown as MatrixEvent;

type FakeRoomOptions = {
  initialEvents?: MatrixEvent[];
  history?: MatrixEvent[];
  receiptTargetId?: string | null;
  fullyReadId?: string;
  rawReceipt?: boolean;
  lastActiveTs?: number;
  scrollbackError?: boolean;
};

const createFakeRoom = (roomId: string, opts: FakeRoomOptions = {}): Room => {
  const {
    initialEvents = [createEvent('$latest')],
    history = [],
    receiptTargetId = null,
    fullyReadId,
    rawReceipt = false,
    lastActiveTs = 1000,
  } = opts;

  const events = [...initialEvents];
  const remaining = [...history];

  const room = {
    roomId,
    events,
    remaining,
    getMyMembership: () => 'join',
    getLastActiveTimestamp: () => lastActiveTs,
    getLiveTimeline: () => ({
      getEvents: () => events,
      getPaginationToken: () => (remaining.length > 0 ? `tok${remaining.length}` : null),
    }),
    getEventReadUpTo: () =>
      receiptTargetId && events.some((event) => event.getId() === receiptTargetId)
        ? receiptTargetId
        : null,
    getReadReceiptForUserId: (_userId: string, _ignore?: boolean, type?: ReceiptType) => {
      if (!rawReceipt) return null;
      if (type && type !== ReceiptType.Read) return null;
      return { eventId: receiptTargetId ?? '$receipt-target' };
    },
    getAccountData: (type: string) =>
      fullyReadId && type === 'm.fully_read'
        ? { getContent: () => ({ event_id: fullyReadId }) }
        : undefined,
    findEventById: (eventId: string) => events.find((event) => event.getId() === eventId),
    getUnreadNotificationCount: () => 0,
    client: { pushProcessor: undefined },
  };
  return room as unknown as Room & FakeRoomInternals;
};

type FakeRoomInternals = {
  events: MatrixEvent[];
  remaining: MatrixEvent[];
};

const createFakeClient = (room: Room, opts: { scrollbackError?: boolean } = {}): MatrixClient =>
  ({
    getUserId: () => ME,
    getRoom: (roomId: string) => (roomId === room.roomId ? room : undefined),
    scrollback: vi.fn<MatrixClient['scrollback']>(async () => {
      if (opts.scrollbackError) throw new Error('network');
      const fake = room as unknown as FakeRoomInternals;
      const page = fake.remaining.splice(-50);
      fake.events.unshift(...page);
      return room;
    }),
  }) as unknown as MatrixClient;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

describe('UnreadCountResolver', () => {
  it('backfills until the receipt target is loaded, then reports the room', async () => {
    const history = [
      createEvent('$target'),
      ...Array.from({ length: 119 }, (_, i) => createEvent(`$h${i}`)),
    ];
    const room = createFakeRoom(ROOM_ID, { receiptTargetId: '$target', history });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    expect(onUpdate).toHaveBeenCalledWith(room, undefined);
    expect(mx.scrollback).toHaveBeenCalledTimes(3);
    expect(room.getEventReadUpTo(ME)).toBe('$target');
    resolver.dispose();
  });

  it('reports the room when the timeline is exhausted', async () => {
    const history = Array.from({ length: 30 }, (_, i) => createEvent(`$h${i}`));
    const room = createFakeRoom(ROOM_ID, { history });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    expect(onUpdate).toHaveBeenCalledWith(room, undefined);
    expect(mx.scrollback).toHaveBeenCalledTimes(1);
    resolver.dispose();
  });

  it('publishes a lower-bound count when the backfill budget runs out below a receipt', async () => {
    const history = [
      createEvent('$target'),
      ...Array.from({ length: 399 }, (_, i) => createEvent(`$h${i}`)),
    ];
    const room = createFakeRoom(ROOM_ID, { receiptTargetId: '$target', history, rawReceipt: true });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    expect(mx.scrollback).toHaveBeenCalledTimes(5);
    const [, unreadInfo] = onUpdate.mock.calls[0]!;
    expect(unreadInfo).toMatchObject({ roomId: ROOM_ID, total: 251, estimated: true });
    resolver.dispose();
  });

  it('settles silently at the budget when only a distant fully-read marker exists', async () => {
    const history = [
      createEvent('$marker'),
      ...Array.from({ length: 399 }, (_, i) => createEvent(`$h${i}`)),
    ];
    const room = createFakeRoom(ROOM_ID, { fullyReadId: '$marker', history });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(mx.scrollback).toHaveBeenCalledTimes(5));
    await flush();

    expect(onUpdate).not.toHaveBeenCalled();
    resolver.queue(ROOM_ID);
    await flush();
    expect(mx.scrollback).toHaveBeenCalledTimes(5);
    resolver.dispose();
  });

  it('settles silently when the fully-read marker loads', async () => {
    const history = [
      createEvent('$marker'),
      ...Array.from({ length: 60 }, (_, i) => createEvent(`$h${i}`)),
    ];
    const room = createFakeRoom(ROOM_ID, { fullyReadId: '$marker', history });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    expect(onUpdate).toHaveBeenCalledWith(room, undefined);
    resolver.dispose();
  });

  it('drops a room whose scrollback fails and does not retry it', async () => {
    const room = createFakeRoom(ROOM_ID, { history: [createEvent('$h0')] });
    const mx = createFakeClient(room, { scrollbackError: true });
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(mx.scrollback).toHaveBeenCalledTimes(1));
    await flush();

    expect(onUpdate).not.toHaveBeenCalled();
    resolver.queue(ROOM_ID);
    await flush();
    expect(mx.scrollback).toHaveBeenCalledTimes(1);
    resolver.dispose();
  });

  it('resolves a room queued multiple times only once', async () => {
    const history = Array.from({ length: 30 }, (_, i) => createEvent(`$h${i}`));
    const room = createFakeRoom(ROOM_ID, { history });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    resolver.queue(ROOM_ID);
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    resolver.dispose();
  });

  it('re-examines a settled room once new events arrive', async () => {
    const room = createFakeRoom(ROOM_ID, { history: [createEvent('$h0')] });
    const mx = createFakeClient(room, { scrollbackError: true });
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(mx.scrollback).toHaveBeenCalledTimes(1));

    (room as unknown as FakeRoomInternals).events.push(createEvent('$new'));
    resolver.queue(ROOM_ID);
    await vi.waitFor(() => expect(mx.scrollback).toHaveBeenCalledTimes(2));
    resolver.dispose();
  });

  it('resolves the most recently active room first within a batch', async () => {
    const slowRoom = createFakeRoom('!slow:example.com', {
      history: Array.from({ length: 60 }, (_, i) => createEvent(`$s${i}`)),
      lastActiveTs: 3000,
    });
    const quietRoom = createFakeRoom('!quiet:example.com', {
      history: Array.from({ length: 30 }, (_, i) => createEvent(`$q${i}`)),
      lastActiveTs: 1000,
    });
    const busyRoom = createFakeRoom('!busy:example.com', {
      history: Array.from({ length: 30 }, (_, i) => createEvent(`$b${i}`)),
      lastActiveTs: 2000,
    });
    const rooms = {
      [slowRoom.roomId]: slowRoom,
      [quietRoom.roomId]: quietRoom,
      [busyRoom.roomId]: busyRoom,
    };
    const mx = {
      getUserId: () => ME,
      getRoom: (roomId: string) => rooms[roomId],
      scrollback: vi.fn<MatrixClient['scrollback']>(async (room) => {
        const fake = room as unknown as FakeRoomInternals;
        fake.events.unshift(...fake.remaining.splice(-50));
        return room;
      }),
    } as unknown as MatrixClient;
    const order: string[] = [];
    const resolver = new UnreadCountResolver(mx, (room) => {
      order.push(room.roomId);
    });

    // The first queued room starts the pump synchronously, so queue the batch
    // pair while it is still backfilling.
    resolver.queue(slowRoom.roomId);
    resolver.queue(quietRoom.roomId);
    resolver.queue(busyRoom.roomId);
    await vi.waitFor(() => expect(order).toHaveLength(3));

    expect(order).toEqual([slowRoom.roomId, busyRoom.roomId, quietRoom.roomId]);
    resolver.dispose();
  });

  it('stops working after dispose', async () => {
    const room = createFakeRoom(ROOM_ID, { history: [createEvent('$h0')] });
    const mx = createFakeClient(room);
    const onUpdate = vi.fn<UnreadResolutionUpdate>();
    const resolver = new UnreadCountResolver(mx, onUpdate);

    resolver.dispose();
    resolver.queue(ROOM_ID);
    await flush();

    expect(mx.scrollback).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
