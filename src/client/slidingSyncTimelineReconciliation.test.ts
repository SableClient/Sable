import { describe, expect, it, vi } from 'vitest';
import { SlidingSyncSdk } from 'matrix-js-sdk/lib/sliding-sync-sdk';
import type { MatrixClient, MSC3575RoomData, MSC3575SlidingSyncResponse } from '$types/matrix-sdk';
import type { Logger } from 'matrix-js-sdk/lib/logger';
import {
  createClient,
  EventStatus,
  EventTimeline,
  MatrixEvent,
  RoomEvent,
  SlidingSyncEvent,
  SlidingSyncState,
} from '$types/matrix-sdk';
import {
  prepareSlidingSyncTimelines,
  reconcileLocalEchoes,
  SlidingSyncManager,
} from './slidingSync';

const userId = '@me:example.com';
const roomId = '!dm:example.com';

type RoomDataHandler = (roomId: string, data: MSC3575RoomData) => Promise<void>;

type ContextCapableClient = MatrixClient & {
  getEventContext: (targetRoomId: string, eventId: string) => Promise<unknown>;
};

const silentLogger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  getChild: () => silentLogger,
};

const makeSdk = (): { mx: MatrixClient; sdk: SlidingSyncSdk; deliver: RoomDataHandler } => {
  const mx = createClient({
    baseUrl: 'https://example.com',
    userId,
    accessToken: 'token',
    timelineSupport: true,
  });

  let roomDataHandler: RoomDataHandler | undefined;
  const slidingSyncStub = {
    on: (event: string, handler: unknown) => {
      if (event === 'SlidingSync.RoomData') roomDataHandler = handler as RoomDataHandler;
    },
    registerExtension: () => {},
  };

  const sdk = new SlidingSyncSdk(slidingSyncStub as never, mx, {}, { logger: silentLogger });
  if (!roomDataHandler) throw new Error('SlidingSyncSdk did not subscribe to room data');

  return { mx, sdk, deliver: roomDataHandler };
};

const message = (id: string, ts: number, body: string = id) => ({
  type: 'm.room.message',
  event_id: id,
  sender: '@them:example.com',
  origin_server_ts: ts,
  content: { msgtype: 'm.text', body },
});

const initialRoomData = (newest: ReturnType<typeof message>): MSC3575RoomData =>
  ({
    initial: true,
    required_state: [],
    timeline: [newest],
    limited: true,
    prev_batch: 't1-0',
  }) as unknown as MSC3575RoomData;

const expandedResponse = (timeline: ReturnType<typeof message>[]): MSC3575SlidingSyncResponse =>
  ({
    pos: 'p2',
    rooms: {
      [roomId]: {
        unstable_expanded_timeline: true,
        required_state: [],
        timeline,
        prev_batch: 't1-5',
      },
    },
  }) as unknown as MSC3575SlidingSyncResponse;

const timelineIds = (mx: MatrixClient): string[] =>
  mx
    .getRoom(roomId)!
    .getLiveTimeline()
    .getEvents()
    .map((event) => event.getId()!);

const linkedTimelineIds = (timeline: EventTimeline): string[] => {
  let first = timeline;
  while (first.getNeighbouringTimeline(EventTimeline.BACKWARDS)) {
    first = first.getNeighbouringTimeline(EventTimeline.BACKWARDS)!;
  }

  const ids: string[] = [];
  let current: EventTimeline | null = first;
  while (current) {
    ids.push(...current.getEvents().map((event) => event.getId()!));
    current = current.getNeighbouringTimeline(EventTimeline.FORWARDS);
  }
  return ids;
};

const history = [message('$e1', 100), message('$e2', 200), message('$e3', 300)];
const newest = history[history.length - 1]!;

const ECHO_BODY = 'duplicate me';
const ECHO_TS = 1_700_000_000_000;

describe('timeline reconciliation in matrix-js-sdk', () => {
  it('appends the expanded history out of order when only Synapse flags it', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    expect(timelineIds(mx)).toEqual(['$e3']);

    const resp = expandedResponse(history);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(timelineIds(mx)).toEqual(['$e3', '$e1', '$e2']);
  });

  it('reconciles the gap into a correctly ordered timeline once marked limited', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse(history);
    prepareSlidingSyncTimelines(resp);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3']);
  });

  it('keeps a notification event newest when its room expands after resume', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse(history);
    delete (resp.rooms[roomId] as unknown as Record<string, unknown>).prev_batch;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    const ids = timelineIds(mx);
    expect(ids).toEqual(['$e1', '$e2', '$e3']);
    expect(ids.at(-1)).toBe('$e3');
  });

  it('keeps a resumed notification newest when the expansion flag is missing', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const notification = message('$e4', 400);
    await deliver(roomId, {
      required_state: [],
      timeline: [notification],
      num_live: 1,
    } as unknown as MSC3575RoomData);

    const resp = expandedResponse([...history, notification]);
    const roomData = resp.rooms[roomId]!;
    delete (roomData as unknown as Record<string, unknown>).unstable_expanded_timeline;
    roomData.num_live = 0;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3', '$e4']);
  });

  it.each(['expanded flag', 'num_live', 'overlap only'])(
    'replaces a sparse notification timeline using %s metadata',
    async (metadata) => {
      const { mx, deliver } = makeSdk();
      await deliver(roomId, initialRoomData(newest));

      const notification = message('$e6', 600);
      await deliver(roomId, {
        required_state: [],
        timeline: [notification],
        num_live: 1,
      } as unknown as MSC3575RoomData);
      const sparseLiveTimeline = mx.getRoom(roomId)!.getLiveTimeline();
      expect(timelineIds(mx)).toEqual(['$e3', '$e6']);

      const resp = expandedResponse([message('$e4', 400), message('$e5', 500), notification]);
      const roomData = resp.rooms[roomId]!;
      if (metadata !== 'expanded flag') {
        delete (roomData as unknown as Record<string, unknown>).unstable_expanded_timeline;
        if (metadata === 'num_live') roomData.num_live = 1;
        else delete roomData.num_live;
      }
      prepareSlidingSyncTimelines(resp, mx);
      await deliver(roomId, roomData);

      expect(mx.getRoom(roomId)!.getLiveTimeline()).not.toBe(sparseLiveTimeline);
      expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6']);
    }
  );

  it('keeps an in-app notification newest when expansion metadata is omitted', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const notification = message('$e4', 400);
    await deliver(roomId, {
      required_state: [],
      timeline: [notification],
      num_live: 1,
    } as unknown as MSC3575RoomData);

    const resp = expandedResponse([...history, notification]);
    const roomData = resp.rooms[roomId]!;
    delete (roomData as unknown as Record<string, unknown>).unstable_expanded_timeline;
    delete roomData.num_live;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3', '$e4']);
  });

  it('keeps the notification newest when both responses omit num_live', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const notification = message('$e4', 400);
    await deliver(roomId, {
      required_state: [],
      timeline: [notification],
    } as unknown as MSC3575RoomData);

    const resp = expandedResponse([...history, notification]);
    const roomData = resp.rooms[roomId]!;
    delete (roomData as unknown as Record<string, unknown>).unstable_expanded_timeline;
    delete roomData.num_live;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3', '$e4']);
  });

  it('keeps a notification jump on the live timeline after catch-up', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const notification = message('$e6', 600);
    const resp = {
      pos: 'p3',
      rooms: {
        [roomId]: {
          required_state: [],
          timeline: [message('$e4', 400), message('$e5', 500), notification],
        },
      },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    const timelineSet = mx.getRoom(roomId)!.getUnfilteredTimelineSet();
    const getEventContext = vi.spyOn(mx as ContextCapableClient, 'getEventContext');
    const notificationTimeline = await mx.getEventTimeline(timelineSet, '$e6');
    expect(getEventContext).not.toHaveBeenCalled();
    expect(notificationTimeline).toBe(timelineSet.getLiveTimeline());
    expect(linkedTimelineIds(notificationTimeline!)).toEqual(['$e3', '$e4', '$e5', '$e6']);
  });

  it('starts a new live timeline when a limited catch-up has no overlap', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const oldLiveTimeline = room.getLiveTimeline();

    const notification = message('$e6', 600);
    const resp = {
      pos: 'p3',
      rooms: {
        [roomId]: {
          required_state: [],
          timeline: [message('$e4', 400), message('$e5', 500), notification],
          limited: true,
          num_live: 1,
          prev_batch: 'gap-token',
        },
      },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    const liveTimeline = mx.getRoom(roomId)!.getLiveTimeline();
    expect(liveTimeline).not.toBe(oldLiveTimeline);
    expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6']);
    expect(liveTimeline.getPaginationToken(EventTimeline.BACKWARDS)).toBe('gap-token');
    expect(room.oldState).toBe(liveTimeline.getState(EventTimeline.BACKWARDS));
    expect(room.currentState).toBe(liveTimeline.getState(EventTimeline.FORWARDS));

    const localEcho = new MatrixEvent({
      ...message('~local', 700),
      room_id: roomId,
      sender: userId,
    });
    localEcho.setStatus(EventStatus.SENDING);
    mx.getRoom(roomId)!.addPendingEvent(localEcho, 'txn');
    await deliver(roomId, {
      required_state: [],
      timeline: [message('$e8', 800)],
      num_live: 1,
    } as unknown as MSC3575RoomData);

    expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6', '~local', '$e8']);
  });

  it('does not reset away a pending local echo', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const liveTimeline = room.getLiveTimeline();
    const localEcho = new MatrixEvent({
      ...message('~local', 700),
      room_id: roomId,
      sender: userId,
    });
    localEcho.setStatus(EventStatus.SENDING);
    room.addPendingEvent(localEcho, 'txn');

    const resp = expandedResponse([message('$e4', 400), message('$e5', 500), message('$e6', 600)]);
    const completeTimelineReset = prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);
    completeTimelineReset?.();

    expect(room.getLiveTimeline()).not.toBe(liveTimeline);
    expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6', '~local']);
  });

  it('does not duplicate a pending event whose remote echo arrives in the reset response', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const localEcho = new MatrixEvent({
      ...message('~local', 700),
      room_id: roomId,
      sender: userId,
    });
    localEcho.setStatus(EventStatus.SENDING);
    room.addPendingEvent(localEcho, 'txn');
    const remoteEcho = {
      ...message('$mine', 700),
      sender: userId,
      unsigned: { transaction_id: 'txn' },
    };

    const resp = expandedResponse([
      message('$e4', 400),
      message('$e5', 500),
      message('$e6', 600),
      remoteEcho,
    ]);
    const completeTimelineReset = prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);
    completeTimelineReset?.();

    expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6', '$mine']);
    expect(localEcho.status).toBeNull();
  });

  it('starts a new live timeline when an expanded catch-up has no overlap', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse([message('$e4', 400), message('$e5', 500), message('$e6', 600)]);
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6']);
  });

  it('keeps a usable back-pagination token when the gapped response omits prev_batch', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse([message('$e4', 400), message('$e5', 500)]);
    delete (resp.rooms[roomId] as unknown as Record<string, unknown>).prev_batch;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(
      mx.getRoom(roomId)!.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS)
    ).not.toBe(null);
  });

  it('keeps a limited response on the same timeline when it overlaps', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const oldLiveTimeline = mx.getRoom(roomId)!.getLiveTimeline();

    const roomData = {
      required_state: [],
      timeline: [newest, message('$e4', 400)],
      limited: true,
      num_live: 1,
      prev_batch: 't1-5',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p3',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(mx.getRoom(roomId)!.getLiveTimeline()).toBe(oldLiveTimeline);
    expect(timelineIds(mx)).toEqual(['$e3', '$e4']);
  });

  it('does not treat an event in a detached timeline as live overlap', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const detachedTimeline = room.getUnfilteredTimelineSet().addTimeline();
    room.addEventsToTimeline(
      [mx.getEventMapper()(message('$e4', 400) as never)],
      false,
      false,
      detachedTimeline
    );

    const roomData = {
      required_state: [],
      timeline: [message('$e4', 400), message('$e5', 500), message('$e6', 600)],
      limited: true,
      num_live: 1,
      prev_batch: 'gap-token',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p3',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e4', '$e5', '$e6']);
    expect(room.getUnfilteredTimelineSet().findEventById('$e4')).toBe(
      room.getLiveTimeline().getEvents()[0]
    );
  });

  it('updates old state while keeping current-state listeners attached', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const previousOldState = room.oldState;
    const previousCurrentState = room.currentState;
    const oldStateUpdated = vi.fn<() => void>();
    const currentStateUpdated = vi.fn<() => void>();
    room.on(RoomEvent.OldStateUpdated, oldStateUpdated);
    room.on(RoomEvent.CurrentStateUpdated, currentStateUpdated);

    const resp = expandedResponse([message('$e4', 400), message('$e5', 500)]);
    prepareSlidingSyncTimelines(resp, mx);

    expect(room.oldState).not.toBe(previousOldState);
    expect(oldStateUpdated).toHaveBeenCalledOnce();
    expect(room.currentState).toBe(previousCurrentState);
    expect(currentStateUpdated).not.toHaveBeenCalled();
  });

  it('keeps a cached timeline when an initial response has no events', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const oldLiveTimeline = mx.getRoom(roomId)!.getLiveTimeline();

    const roomData = {
      initial: true,
      required_state: [],
      timeline: [],
      prev_batch: 'empty-token',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p3',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(mx.getRoom(roomId)!.getLiveTimeline()).toBe(oldLiveTimeline);
    expect(timelineIds(mx)).toEqual(['$e3']);
  });

  it('resets a cached timeline when an initial response has no overlap', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const oldLiveTimeline = mx.getRoom(roomId)!.getLiveTimeline();

    const roomData = initialRoomData(message('$e6', 600));
    delete roomData.limited;
    const resp = {
      pos: 'p3',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(mx.getRoom(roomId)!.getLiveTimeline()).not.toBe(oldLiveTimeline);
    expect(timelineIds(mx)).toEqual(['$e6']);
  });

  it('keeps new events after the overlap in an unflagged expansion', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const next = message('$e4', 400);
    const resp = expandedResponse([...history, next]);
    const roomData = resp.rooms[roomId]!;
    delete (roomData as unknown as Record<string, unknown>).unstable_expanded_timeline;
    delete roomData.num_live;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3', '$e4']);
  });

  it('uses partial num_live metadata to split history from a new event', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const next = message('$e4', 400);
    const resp = expandedResponse([...history, next]);
    const roomData = resp.rooms[roomId]!;
    delete (roomData as unknown as Record<string, unknown>).unstable_expanded_timeline;
    roomData.num_live = 1;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3', '$e4']);
  });

  it('keeps the cached timeline when an initial response overlaps it', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const oldLiveTimeline = mx.getRoom(roomId)!.getLiveTimeline();

    const next = message('$e4', 400);
    const roomData = {
      initial: true,
      required_state: [],
      timeline: [newest, next],
      num_live: 1,
      prev_batch: 't1-5',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p2',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    expect(roomData.limited).toBeUndefined();

    await deliver(roomId, roomData);
    expect(mx.getRoom(roomId)!.getLiveTimeline()).toBe(oldLiveTimeline);
    expect(timelineIds(mx)).toEqual(['$e3', '$e4']);
  });

  it('keeps the existing back-pagination token when prev_batch is omitted', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const before = mx
      .getRoom(roomId)!
      .getLiveTimeline()
      .getPaginationToken(EventTimeline.BACKWARDS);
    expect(before).toBe('t1-0');

    const resp = expandedResponse(history);
    delete (resp.rooms[roomId] as unknown as Record<string, unknown>).prev_batch;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(mx.getRoom(roomId)!.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS)).toBe(
      't1-0'
    );
  });

  it('still orders the timeline when there is no token to carry forward', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, { ...initialRoomData(newest), prev_batch: undefined } as never);

    const resp = expandedResponse(history);
    delete (resp.rooms[roomId] as unknown as Record<string, unknown>).prev_batch;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3']);
  });

  it('leaves an ordinary incremental overlap untouched', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse([newest, message('$e4', 400)]);
    const rd = resp.rooms[roomId] as unknown as Record<string, unknown>;
    delete rd.unstable_expanded_timeline;
    prepareSlidingSyncTimelines(resp, mx);

    expect(rd.limited).toBeUndefined();
    expect(rd.prev_batch).toBe('t1-5');

    await deliver(roomId, resp.rooms[roomId]!);
    expect(timelineIds(mx)).toEqual(['$e3', '$e4']);
  });

  it('keeps the top-of-timeline token when a limited response overlaps mid-timeline', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, {
      initial: true,
      required_state: [],
      timeline: history,
      limited: true,
      prev_batch: 'top-token',
    } as unknown as MSC3575RoomData);
    const room = mx.getRoom(roomId)!;
    expect(room.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS)).toBe('top-token');

    const roomData = {
      required_state: [],
      timeline: [newest, message('$e4', 400)],
      limited: true,
      prev_batch: 'mid-token',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p4',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, roomData);

    expect(timelineIds(mx)).toEqual(['$e1', '$e2', '$e3', '$e4']);
    // 'mid-token' paginates back from $e3, so it would prepend above $e1 events
    // that belong below it.
    expect(room.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS)).toBe('top-token');
  });

  it('keeps a usable back-pagination token after reconciling', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));

    const resp = expandedResponse(history);
    prepareSlidingSyncTimelines(resp);
    await deliver(roomId, resp.rooms[roomId]!);

    expect(mx.getRoom(roomId)!.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS)).toBe(
      't1-5'
    );
  });
});

describe('a window from a room we just subscribed to', () => {
  const subscribed = new Set([roomId]);

  it('does not append older history below the live tail', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(message('$e9', 900)));
    expect(timelineIds(mx)).toEqual(['$e9']);

    const roomData = {
      required_state: [],
      timeline: [message('$e1', 100), message('$e2', 200)],
      prev_batch: 't1-5',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p9',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx, subscribed);
    await deliver(roomId, roomData);

    const liveTimeline = mx.getRoom(roomId)!.getLiveTimeline();
    expect(linkedTimelineIds(liveTimeline)).toEqual(['$e1', '$e2']);
    expect(liveTimeline.getPaginationToken(EventTimeline.BACKWARDS)).toBe('t1-5');
  });

  it('leaves an unsubscribed room to the overlap scan', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(message('$e9', 900)));

    const roomData = {
      required_state: [],
      timeline: [message('$e1', 100), message('$e2', 200)],
      prev_batch: 't1-5',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p9',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx, new Set());
    await deliver(roomId, roomData);

    expect(roomData.limited).not.toBe(true);
  });

  it('does not glue a newer window onto the live tail as if contiguous', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(message('$e1', 100)));

    const roomData = {
      required_state: [],
      timeline: [message('$e8', 800), message('$e9', 900)],
      prev_batch: 't1-9',
    } as unknown as MSC3575RoomData;
    const resp = {
      pos: 'p9',
      rooms: { [roomId]: roomData },
    } as unknown as MSC3575SlidingSyncResponse;
    prepareSlidingSyncTimelines(resp, mx, subscribed);
    await deliver(roomId, roomData);

    const liveTimeline = mx.getRoom(roomId)!.getLiveTimeline();
    expect(linkedTimelineIds(liveTimeline)).toEqual(['$e8', '$e9']);
    expect(liveTimeline.getPaginationToken(EventTimeline.BACKWARDS)).toBe('t1-9');
  });
});

describe('reconcileLocalEchoes', () => {
  const addPendingEcho = (
    mx: MatrixClient,
    txnId: string,
    body = ECHO_BODY,
    ts = ECHO_TS
  ): MatrixEvent => {
    const room = mx.getRoom(roomId)!;
    const echo = new MatrixEvent({
      type: 'm.room.message',
      event_id: `~${roomId}:${txnId}`,
      sender: userId,
      room_id: roomId,
      origin_server_ts: ts,
      content: { msgtype: 'm.text', body },
    });
    echo.setTxnId(txnId);
    echo.setStatus(EventStatus.SENDING);
    room.addPendingEvent(echo, txnId);
    return echo;
  };

  const confirmedCopy = (id: string, body = ECHO_BODY, ts = ECHO_TS): Record<string, unknown> => ({
    ...message(id, ts, body),
    sender: userId,
  });

  it('merges a pending echo with an unlinked remote copy after a gapped reset', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const echo = addPendingEcho(mx, 'm1700000000000000001');
    room.updatePendingEvent(echo, EventStatus.NOT_SENT);
    room.updatePendingEvent(echo, EventStatus.SENDING);

    const resp = {
      pos: 'p3',
      rooms: {
        [roomId]: {
          required_state: [],
          timeline: [confirmedCopy('$mine')],
          limited: true,
          num_live: 1,
          prev_batch: 'gap-token',
        },
      },
    } as unknown as MSC3575SlidingSyncResponse;
    const completeTimelineReset = prepareSlidingSyncTimelines(resp, mx);
    await deliver(roomId, resp.rooms[roomId]!);
    completeTimelineReset?.();

    expect(timelineIds(mx)).toContain('$mine');
    expect(timelineIds(mx)).toContain(echo.getId());

    reconcileLocalEchoes(room);

    expect(timelineIds(mx).filter((id) => id === '$mine')).toHaveLength(1);
    expect(timelineIds(mx)).not.toContain('~' + roomId + ':m1700000000000000001');
    expect(echo.getId()).toBe('$mine');
    expect(echo.status).toBeNull();
  });

  it('merges an echo delivered incrementally alongside the pending local echo', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const echo = addPendingEcho(mx, 'm1700000000000000002');

    await deliver(roomId, {
      required_state: [],
      timeline: [confirmedCopy('$mine')],
      num_live: 1,
    } as unknown as MSC3575RoomData);

    expect(timelineIds(mx)).toContain('$mine');
    expect(timelineIds(mx)).toContain(echo.getId());

    reconcileLocalEchoes(room);

    expect(timelineIds(mx).filter((id) => id === '$mine')).toHaveLength(1);
    expect(timelineIds(mx)).not.toContain('~' + roomId + ':m1700000000000000002');
    expect(echo.getId()).toBe('$mine');
    expect(echo.status).toBeNull();
  });

  it('prefers the transaction id over a same-body decoy', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const echo = addPendingEcho(mx, 'm1700000000000000003');

    const mapEvent = mx.getEventMapper();
    room.addEventsToTimeline(
      [
        mapEvent({ ...message('$decoy', ECHO_TS, ECHO_BODY), sender: userId } as never),
        mapEvent({
          ...message('$mine', ECHO_TS, 'something else entirely'),
          sender: userId,
          unsigned: { transaction_id: 'm1700000000000000003' },
        } as never),
      ],
      true,
      false,
      room.getLiveTimeline()
    );

    reconcileLocalEchoes(room);

    expect(timelineIds(mx)).toContain('$mine');
    expect(timelineIds(mx)).toContain('$decoy');
    expect(echo.getId()).toBe('$mine');
    expect(echo.status).toBeNull();
  });

  it('does not steal an older identical message for a pending echo', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;

    await deliver(roomId, {
      required_state: [],
      timeline: [confirmedCopy('$old', ECHO_BODY, ECHO_TS - 120_000)],
      num_live: 1,
    } as unknown as MSC3575RoomData);

    const echo = addPendingEcho(mx, 'm1700000000000000004');
    reconcileLocalEchoes(room);

    expect(timelineIds(mx)).toContain('$old');
    expect(timelineIds(mx)).toContain(echo.getId());
    expect(echo.status).toBe(EventStatus.SENDING);
  });

  it('leaves a pending echo alone when no confirmation was delivered', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const echo = addPendingEcho(mx, 'm1700000000000000005');

    reconcileLocalEchoes(room);

    expect(timelineIds(mx)).toContain(echo.getId());
    expect(echo.status).toBe(EventStatus.SENDING);
  });

  it('does not merge an echo into an identical message from a different send', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;

    await deliver(roomId, {
      required_state: [],
      timeline: [
        {
          ...message('$earlier', ECHO_TS, ECHO_BODY),
          sender: userId,
          unsigned: { transaction_id: 'mOTHER' },
        },
      ],
      num_live: 1,
    } as unknown as MSC3575RoomData);

    const echo = addPendingEcho(mx, 'm1700000000000000006');
    reconcileLocalEchoes(room);

    expect(timelineIds(mx)).toContain('$earlier');
    expect(timelineIds(mx)).toContain(echo.getId());
    expect(echo.status).toBe(EventStatus.SENDING);
  });
});

describe('sync-complete reconciliation wiring', () => {
  it('reconciles local echoes for every room in a completed response', async () => {
    const { mx, deliver } = makeSdk();
    await deliver(roomId, initialRoomData(newest));
    const room = mx.getRoom(roomId)!;
    const echo = new MatrixEvent({
      type: 'm.room.message',
      event_id: `~${roomId}:m1700000000000000006`,
      sender: userId,
      room_id: roomId,
      origin_server_ts: ECHO_TS,
      content: { msgtype: 'm.text', body: 'wired' },
    });
    echo.setTxnId('m1700000000000000006');
    echo.setStatus(EventStatus.SENDING);
    room.addPendingEvent(echo, 'm1700000000000000006');

    await deliver(roomId, {
      required_state: [],
      timeline: [{ ...message('$mine', ECHO_TS, 'wired'), sender: userId }],
      num_live: 1,
    } as unknown as MSC3575RoomData);
    expect(timelineIds(mx)).toContain('~' + roomId + ':m1700000000000000006');

    const manager = new SlidingSyncManager(mx, 'https://sliding.example.com');
    manager.attach();
    const resp = { pos: 'p9', rooms: { [roomId]: {} } } as unknown as MSC3575SlidingSyncResponse;
    manager.slidingSync.emit(SlidingSyncEvent.Lifecycle, SlidingSyncState.Complete, resp);

    expect(timelineIds(mx)).toContain('$mine');
    expect(timelineIds(mx)).not.toContain('~' + roomId + ':m1700000000000000006');
    expect(echo.getId()).toBe('$mine');
    manager.dispose();
  });
});
