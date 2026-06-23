import { EventEmitter } from 'events';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { ClientEvent, RoomEvent } from '$types/matrix-sdk';
import { appEvents } from '$utils/appEvents';
import { useTimelineSync } from './useTimelineSync';

vi.mock('@sentry/react', () => ({
  default: {},
  startSpan: vi.fn<(_options: unknown, fn: () => Promise<unknown>) => Promise<unknown>>(
    (_options, fn) => fn()
  ),
  addBreadcrumb: vi.fn<() => void>(),
  captureMessage: vi.fn<(msg: string) => void>(),
  metrics: {
    distribution: vi.fn<() => void>(),
    count: vi.fn<() => void>(),
  },
}));

type FakeTimeline = {
  getEvents: () => unknown[];
  getNeighbouringTimeline: (direction?: unknown) => FakeTimeline | undefined;
  getPaginationToken: (direction?: unknown) => string | undefined;
  getRoomId: () => string;
};

type FakeTimelineSet = {
  getLiveTimeline: () => FakeTimeline;
  getTimelineForEvent: (eventId?: string) => FakeTimeline | undefined;
  emit: EventEmitter['emit'];
};

type FakeRoom = {
  emit: EventEmitter['emit'];
  on: EventEmitter['on'];
  removeListener: EventEmitter['removeListener'];
  roomId: string;
  getUnfilteredTimelineSet: () => FakeTimelineSet;
  getLiveTimeline: () => FakeTimeline;
  getEventReadUpTo: () => null;
  getThread: () => null;
  getUnreadNotificationCount: () => number;
  client: {
    getUserId: () => string;
    getAccountData: () => null;
  };
};

function createTimeline(events: unknown[] = [{}]): FakeTimeline {
  return {
    getEvents: () => events,
    getNeighbouringTimeline: () => undefined,
    getPaginationToken: () => undefined,
    getRoomId: () => '!room:test',
  };
}

function linkTimelines(backward: FakeTimeline, forward: FakeTimeline) {
  backward.getNeighbouringTimeline = (direction?: unknown) =>
    direction === 'f' ? forward : undefined;
  forward.getNeighbouringTimeline = (direction?: unknown) =>
    direction === 'b' ? backward : undefined;
}

function createMx() {
  const mxEmitter = new EventEmitter();
  return {
    getUserId: () => '@alice:test',
    getRoom: () => null,
    paginateEventTimeline: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    on: mxEmitter.on.bind(mxEmitter),
    off: mxEmitter.off.bind(mxEmitter),
    emit: mxEmitter.emit.bind(mxEmitter),
  };
}

function createRoom(
  roomId = '!room:test',
  events: unknown[] = [{}]
): {
  room: FakeRoom;
  timelineSet: FakeTimelineSet;
  events: unknown[];
} {
  const timeline = {
    ...createTimeline(events),
    getRoomId: () => roomId,
  };
  const timelineSet = new EventEmitter() as FakeTimelineSet;
  timelineSet.getLiveTimeline = () => timeline;
  timelineSet.getTimelineForEvent = (eventId?: string) =>
    events.some((event) => (event as { getId?: () => string }).getId?.() === eventId)
      ? timeline
      : undefined;

  const roomEmitter = new EventEmitter();
  const room = {
    on: roomEmitter.on.bind(roomEmitter),
    removeListener: roomEmitter.removeListener.bind(roomEmitter),
    emit: roomEmitter.emit.bind(roomEmitter),
    roomId,
    getUnfilteredTimelineSet: () => timelineSet as never,
    getLiveTimeline: () => timeline,
    getEventReadUpTo: () => null,
    getThread: () => null,
    getUnreadNotificationCount: () => 0,
    client: {
      getUserId: () => '@alice:test',
      getAccountData: () => null,
    },
  } as unknown as FakeRoom;

  return { room, timelineSet, events };
}

describe('useTimelineSync', () => {
  it('renders a disconnected event context instead of falling back to live', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    const targetEvent = { getId: () => '$target:event' };
    const contextTimeline = createTimeline([targetEvent]);
    const scrollToBottom = vi.fn<() => void>();
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target:event');
    });

    expect(result.current.timeline.linkedTimelines).toEqual([contextTimeline]);
    expect(result.current.focusItem).toEqual({
      index: 0,
      eventId: '$target:event',
      scrollTo: true,
      highlight: true,
      align: 'center',
      jumpMode: 'history_context',
    });
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('resolves unread jumps to the next event when the first unread event is available', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    const contextEvents = [{ getId: () => '$read:event' }, { getId: () => '$unread:event' }];
    const contextTimeline = createTimeline(contextEvents);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: '$read:event' },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$read:event', undefined, {
        target: 'next',
      });
    });

    expect(result.current.timeline.linkedTimelines).toEqual([contextTimeline]);
    expect(result.current.focusItem).toEqual({
      index: 1,
      eventId: '$unread:event',
      scrollTo: true,
      highlight: true,
      align: 'center',
      jumpMode: 'history_context',
    });
  });

  it('keeps the unread event target when no newer event is loaded yet', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    const contextEvents = [{ getId: () => '$read:event' }];
    const contextTimeline = createTimeline(contextEvents);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: '$read:event' },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$read:event', undefined, {
        target: 'next',
      });
    });

    expect(result.current.focusItem).toEqual({
      index: 1,
      eventId: '$read:event',
      scrollTo: true,
      highlight: false,
      align: 'center',
      jumpMode: 'history_context',
    });
  });

  it('continues sparse forward pagination using the newest linked timeline token', async () => {
    const newerEvents: unknown[] = [{}];
    let paginationCalls = 0;
    let newerTimeline: FakeTimeline;
    const olderTimeline = {
      ...createTimeline(Array.from({ length: 10 }, () => ({}))),
      getNeighbouringTimeline: (direction?: unknown) =>
        direction === 'f' && paginationCalls > 0 ? newerTimeline : undefined,
      getPaginationToken: (direction?: unknown) =>
        direction === 'f' && paginationCalls === 0 ? 'old-forward-token' : undefined,
      getRoomId: () => '!older:test',
    };
    newerTimeline = {
      ...createTimeline(newerEvents),
      getRoomId: () => '!newer:test',
      getPaginationToken: (direction?: unknown) =>
        direction === 'f' && paginationCalls < 2 ? 'forward-token' : undefined,
    };
    newerTimeline.getNeighbouringTimeline = (direction?: unknown) =>
      direction === 'b' ? olderTimeline : undefined;

    const timelineSet = new EventEmitter() as FakeTimelineSet;
    timelineSet.getLiveTimeline = () => olderTimeline;
    timelineSet.getTimelineForEvent = () => undefined;

    const roomEmitter = new EventEmitter();
    const room = {
      on: roomEmitter.on.bind(roomEmitter),
      removeListener: roomEmitter.removeListener.bind(roomEmitter),
      emit: roomEmitter.emit.bind(roomEmitter),
      roomId: '!room:test',
      getUnfilteredTimelineSet: () => timelineSet as never,
      getLiveTimeline: () => olderTimeline,
      getEventReadUpTo: () => null,
      getThread: () => null,
      getUnreadNotificationCount: () => 0,
      client: {
        getUserId: () => '@alice:test',
        getAccountData: () => null,
      },
    } as unknown as FakeRoom;

    const paginatedRoomIds: string[] = [];
    const mx = {
      ...createMx(),
      getRoom: () => ({ hasEncryptionStateEvent: () => false }),
      paginateEventTimeline: vi.fn<(timeline: FakeTimeline) => Promise<boolean>>(
        async (timeline) => {
          paginatedRoomIds.push(timeline.getRoomId());
          paginationCalls += 1;
          newerEvents.push({});
          return true;
        }
      ),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.handleTimelinePagination(false);
    });

    expect(mx.paginateEventTimeline).toHaveBeenCalledTimes(2);
    expect(paginatedRoomIds).toEqual(['!older:test', '!newer:test']);
  });

  it('updates unread bridge state when forward pagination reconnects history to live', async () => {
    const readMarkerEvent = { getId: () => '$read:event' };
    const unreadEvent = { getId: () => '$unread:event' };
    const liveEvent = { getId: () => '$live:event' };
    let loadedContext = false;
    let paginationCalls = 0;

    const historyTimeline = {
      ...createTimeline([readMarkerEvent, unreadEvent]),
      getRoomId: () => '!room:test',
      getNeighbouringTimeline: (direction?: unknown) =>
        direction === 'f' && paginationCalls > 0 ? liveTimeline : undefined,
      getPaginationToken: (direction?: unknown) =>
        direction === 'f' && paginationCalls === 0 ? 'forward-token' : undefined,
    };
    const liveTimeline = {
      ...createTimeline([liveEvent]),
      getRoomId: () => '!room:test',
      getNeighbouringTimeline: (direction?: unknown) =>
        direction === 'b' && paginationCalls > 0 ? historyTimeline : undefined,
    };

    const timelineSet = new EventEmitter() as FakeTimelineSet;
    timelineSet.getLiveTimeline = () => liveTimeline;
    timelineSet.getTimelineForEvent = (eventId?: string) =>
      loadedContext && eventId === '$read:event' ? historyTimeline : undefined;

    const roomEmitter = new EventEmitter();
    const room = {
      on: roomEmitter.on.bind(roomEmitter),
      removeListener: roomEmitter.removeListener.bind(roomEmitter),
      emit: roomEmitter.emit.bind(roomEmitter),
      roomId: '!room:test',
      getUnfilteredTimelineSet: () => timelineSet as never,
      getLiveTimeline: () => liveTimeline,
      getEventReadUpTo: () => '$read:event',
      getThread: () => null,
      getUnreadNotificationCount: () => 1,
      client: {
        getUserId: () => '@alice:test',
        getAccountData: () => null,
      },
    } as unknown as FakeRoom;

    const setUnreadInfo = vi.fn<(arg: unknown) => void>();
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockImplementation(async () => {
        loadedContext = true;
        return historyTimeline;
      }),
      getRoom: () => ({ hasEncryptionStateEvent: () => false }),
      paginateEventTimeline: vi.fn<(timeline: FakeTimeline) => Promise<boolean>>(async () => {
        paginationCalls += 1;
        return true;
      }),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: {
          readUptoEventId: '$read:event',
          inLiveTimeline: false,
          scrollTo: false,
        },
        setUnreadInfo,
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: '$read:event' },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$read:event', undefined, { target: 'next' });
      await result.current.handleTimelinePagination(false);
    });

    const updater = setUnreadInfo.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === 'function');
    expect(updater).toBeTypeOf('function');
    expect(
      updater({
        readUptoEventId: '$read:event',
        inLiveTimeline: false,
        scrollTo: false,
      })
    ).toEqual({
      readUptoEventId: '$read:event',
      inLiveTimeline: true,
      scrollTo: false,
    });
  });

  it('reloads event context on TimelineReset when eventId is set', async () => {
    const { room, timelineSet } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    // mx.getEventTimeline is intentionally absent — loadEventTimeline will
    // reject silently (void), leaving the timeline state unchanged.
    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: createMx() as never,
        eventId: '$linked:event',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    const timelineBefore = result.current.timeline.linkedTimelines;

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    // The live timeline should NOT have replaced the event-context timeline —
    // the eventId branch in useLiveTimelineRefresh returns early after calling
    // loadEventTimeline and never calls setTimeline with the live timeline.
    expect(result.current.timeline.linkedTimelines).toBe(timelineBefore);
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('preserves a loaded event context when ClientEvent.Room fires', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    const targetEvent = { getId: () => '$target:event' };
    const contextTimeline = createTimeline([targetEvent]);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$target:event',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target:event');
    });

    await act(async () => {
      mx.emit(ClientEvent.Room, room);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toEqual([contextTimeline]);
  });

  it('does not replace an in-flight event context with the live timeline on ClientEvent.Room', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    let resolveTimeline: ((timeline: FakeTimeline) => void) | undefined;
    const pendingTimeline = new Promise<FakeTimeline>((resolve) => {
      resolveTimeline = resolve;
    });
    const targetEvent = { getId: () => '$target:event' };
    const contextTimeline = createTimeline([targetEvent]);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockReturnValue(pendingTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$target:event',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    expect(result.current.timeline.linkedTimelines).toEqual([]);

    const loadPromise = result.current.loadEventTimeline('$target:event');

    await act(async () => {
      mx.emit(ClientEvent.Room, room);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toEqual([]);

    await act(async () => {
      resolveTimeline?.(contextTimeline);
      await loadPromise;
    });

    expect(result.current.timeline.linkedTimelines).toEqual([contextTimeline]);
  });

  it('marks jump context pending immediately when eventId changes', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    let resolveTimeline: ((timeline: FakeTimeline) => void) | undefined;
    const pendingTimeline = new Promise<FakeTimeline>((resolve) => {
      resolveTimeline = resolve;
    });
    const targetEvent = { getId: () => '$target:event' };
    const contextTimeline = createTimeline([targetEvent]);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockReturnValue(pendingTimeline),
    };

    const { result, rerender } = renderHook(
      ({ eventId }: { eventId: string | undefined }) =>
        useTimelineSync({
          room: room as Room,
          mx: mx as never,
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom: vi.fn<() => void>(),
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      { initialProps: { eventId: undefined as string | undefined } }
    );

    expect(result.current.timeline.linkedTimelines).toHaveLength(1);

    rerender({ eventId: '$target:event' });
    const loadPromise = result.current.loadEventTimeline('$target:event');

    await act(async () => {
      mx.emit(ClientEvent.Room, room);
      appEvents.emitVisibilityChange(true);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toHaveLength(1);
    expect(result.current.timeline.linkedTimelines[0]).not.toBe(contextTimeline);

    await act(async () => {
      resolveTimeline?.(contextTimeline);
      await loadPromise;
    });

    expect(result.current.timeline.linkedTimelines).toEqual([contextTimeline]);
  });

  it('preserves a loaded event context when the app returns to foreground', async () => {
    const { room } = createRoom('!room:test', [{ getId: () => '$live:event' }]);
    const targetEvent = { getId: () => '$target:event' };
    const contextTimeline = createTimeline([targetEvent]);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$target:event',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target:event');
    });

    await act(async () => {
      appEvents.emitVisibilityChange(true);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toEqual([contextTimeline]);
  });

  it('keeps an active event-target jump anchored when live timeline refreshes', async () => {
    const targetEvent = { getId: () => '$target:event' };
    const liveEventsOne: unknown[] = [{ getId: () => '$live:one' }];
    const liveTimelineOne = createTimeline(liveEventsOne);
    const contextTimeline = createTimeline([targetEvent, { getId: () => '$older:event' }]);
    linkTimelines(contextTimeline, liveTimelineOne);

    const timelineSet = new EventEmitter() as FakeTimelineSet;
    let currentLiveTimeline = liveTimelineOne;
    timelineSet.getLiveTimeline = () => currentLiveTimeline;
    timelineSet.getTimelineForEvent = () => undefined;

    const roomEmitter = new EventEmitter();
    const room = {
      on: roomEmitter.on.bind(roomEmitter),
      removeListener: roomEmitter.removeListener.bind(roomEmitter),
      emit: roomEmitter.emit.bind(roomEmitter),
      roomId: '!room:test',
      getUnfilteredTimelineSet: () => timelineSet as never,
      getLiveTimeline: () => currentLiveTimeline,
      getEventReadUpTo: () => null,
      getThread: () => null,
      getUnreadNotificationCount: () => 0,
      client: {
        getUserId: () => '@alice:test',
        getAccountData: () => null,
      },
    } as unknown as FakeRoom;

    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$target:event',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target:event');
    });

    const timelineBeforeRefresh = result.current.timeline.linkedTimelines;

    const liveEventsTwo: unknown[] = [{ getId: () => '$live:two' }];
    const liveTimelineTwo = createTimeline(liveEventsTwo);
    linkTimelines(contextTimeline, liveTimelineTwo);
    currentLiveTimeline = liveTimelineTwo;

    await act(async () => {
      mx.emit(ClientEvent.Room, room);
      appEvents.emitVisibilityChange(true);
      await Promise.resolve();
    });

    expect(result.current.focusItem).toEqual({
      index: 0,
      eventId: '$target:event',
      scrollTo: true,
      highlight: true,
      align: 'center',
      jumpMode: 'history_context',
    });
    expect(result.current.timeline.linkedTimelines).toBe(timelineBeforeRefresh);
    expect(result.current.timeline.linkedTimelines.at(-1)).toBe(liveTimelineOne);
  });

  it('uses live-timeline anchoring for notification jumps near the tail', async () => {
    const liveEvents = [
      { getId: () => '$older:event' },
      { getId: () => '$target:event' },
      { getId: () => '$latest:event' },
    ];
    const { room } = createRoom('!room:test', liveEvents);
    const targetTimeline = createTimeline(liveEvents);
    const scrollToBottom = vi.fn<() => void>();
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(targetTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$target:event',
        jumpMode: 'notification_live',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target:event');
    });

    expect(result.current.timeline.linkedTimelines).toHaveLength(1);
    expect(result.current.timeline.linkedTimelines[0]).toBe(room.getLiveTimeline());
    expect(result.current.focusItem).toEqual({
      index: 1,
      eventId: '$target:event',
      scrollTo: true,
      highlight: true,
      align: 'end',
      jumpMode: 'notification_live',
    });
    expect(mx.getEventTimeline).not.toHaveBeenCalled();
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('re-evaluates notification jumps against the live tail after fetching context', async () => {
    const liveEvents = [
      { getId: () => '$older:event' },
      { getId: () => '$target:event' },
      { getId: () => '$latest:event' },
    ];
    const { room, timelineSet } = createRoom('!room:test', liveEvents);
    const targetTimeline = createTimeline(liveEvents);
    const scrollToBottom = vi.fn<() => void>();
    let eventTimelineAvailable = false;

    timelineSet.getTimelineForEvent = (eventId?: string) =>
      eventTimelineAvailable && eventId === '$target:event' ? room.getLiveTimeline() : undefined;

    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockImplementation(async () => {
        eventTimelineAvailable = true;
        return targetTimeline;
      }),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$target:event',
        jumpMode: 'notification_live',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target:event');
    });

    expect(mx.getEventTimeline).toHaveBeenCalledTimes(1);
    expect(result.current.timeline.linkedTimelines).toHaveLength(1);
    expect(result.current.timeline.linkedTimelines[0]).toBe(room.getLiveTimeline());
    expect(result.current.focusItem).toEqual({
      index: 1,
      eventId: '$target:event',
      scrollTo: true,
      highlight: true,
      align: 'end',
      jumpMode: 'notification_live',
    });
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('does not snap a non-bottom user to latest after TimelineReset', async () => {
    const { room, timelineSet, events } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: createMx() as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.LocalEchoUpdated, {}, room);
      await Promise.resolve();
    });

    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('preserves an off-bottom timeline when TimelineReset swaps the live timeline', async () => {
    const liveTimelineOne = createTimeline([{ getId: () => '$live:one' }]);
    const liveTimelineTwo = createTimeline([{ getId: () => '$live:two' }]);

    const timelineSet = new EventEmitter() as FakeTimelineSet;
    let currentLiveTimeline = liveTimelineOne;
    timelineSet.getLiveTimeline = () => currentLiveTimeline;
    timelineSet.getTimelineForEvent = () => undefined;

    const roomEmitter = new EventEmitter();
    const room = {
      on: roomEmitter.on.bind(roomEmitter),
      removeListener: roomEmitter.removeListener.bind(roomEmitter),
      emit: roomEmitter.emit.bind(roomEmitter),
      roomId: '!room:test',
      getUnfilteredTimelineSet: () => timelineSet as never,
      getLiveTimeline: () => currentLiveTimeline,
      getEventReadUpTo: () => null,
      getThread: () => null,
      getUnreadNotificationCount: () => 0,
      client: {
        getUserId: () => '@alice:test',
        getAccountData: () => null,
      },
    } as unknown as FakeRoom;

    const scrollToBottom = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: createMx() as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    const timelineBeforeReset = result.current.timeline.linkedTimelines;

    await act(async () => {
      currentLiveTimeline = liveTimelineTwo;
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toBe(timelineBeforeReset);
    expect(result.current.timeline.linkedTimelines[0]).toBe(liveTimelineOne);
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('keeps a bottom-pinned user anchored after TimelineReset', async () => {
    const { room, timelineSet } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: createMx() as never,
        isAtBottom: true,
        isAtBottomRef: { current: true },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('retargets Jump to Latest to the live tail in one action', async () => {
    const liveEvents = [{ getId: () => '$older:event' }, { getId: () => '$latest:event' }];
    const { room } = createRoom('!room:test', liveEvents);
    const contextTimeline = createTimeline([{ getId: () => '$context:event' }]);
    const mx = {
      ...createMx(),
      getEventTimeline: vi.fn<() => Promise<FakeTimeline>>().mockResolvedValue(contextTimeline),
    };

    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        eventId: '$context:event',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$context:event');
    });

    await act(async () => {
      result.current.jumpToLatest();
    });

    expect(result.current.timeline.linkedTimelines).toHaveLength(1);
    expect(result.current.timeline.linkedTimelines[0]).toBe(room.getLiveTimeline());
    expect(result.current.focusItem).toEqual({
      index: 1,
      scrollTo: true,
      highlight: false,
      align: 'end',
      tail: 'live',
    });
  });

  it('resets timeline state when room.roomId changes and eventId is not set', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: createMx() as never,
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      {
        initialProps: {
          room: roomOne.room as Room,
          eventId: undefined as string | undefined,
        },
      }
    );

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomOne.timelineSet.getLiveTimeline());

    await act(async () => {
      rerender({ room: roomTwo.room as Room, eventId: undefined });
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomTwo.timelineSet.getLiveTimeline());
  });

  it('does not reset timeline when eventId is set during a room change', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: createMx() as never,
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      {
        initialProps: {
          room: roomOne.room as Room,
          eventId: undefined as string | undefined,
        },
      }
    );

    await act(async () => {
      rerender({ room: roomTwo.room as Room, eventId: '$event:one' });
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomOne.timelineSet.getLiveTimeline());
  });

  it('does not reset timeline when the roomId stays the same', async () => {
    const roomOne = createRoom('!room:one');
    const sameRoomId = createRoom('!room:one');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room }) =>
        useTimelineSync({
          room,
          mx: createMx() as never,
          eventId: undefined,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        }),
      {
        initialProps: {
          room: roomOne.room as Room,
        },
      }
    );

    await act(async () => {
      rerender({ room: sameRoomId.room as Room });
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomOne.timelineSet.getLiveTimeline());
  });

  it('recovers timeline when ClientEvent.Room fires after initial:true bulk load', async () => {
    // Simulate the pull-to-refresh blank-timeline bug: the live timeline is
    // reset to empty (T1) by scheduleForceReset(), events are bulk-injected
    // by the SDK with num_live=0 (all fromCache:true / liveEvent:false), and
    // ClientEvent.Room is emitted once all events are in place.
    // useLiveEventArrive won't fire for any of those old events, so the only
    // recovery path is the ClientEvent.Room listener added in this fix.
    const emptyTimeline = {
      getEvents: () => [] as unknown[],
      getNeighbouringTimeline: () => undefined,
      getPaginationToken: () => undefined,
      getRoomId: () => '!room:test',
    };
    const populatedEvents: unknown[] = [{}, {}, {}];
    const populatedTimeline = {
      getEvents: () => populatedEvents,
      getNeighbouringTimeline: () => undefined,
      getPaginationToken: () => undefined,
      getRoomId: () => '!room:test',
    };

    const timelineSet = new EventEmitter() as FakeTimelineSet;
    // Start with empty live timeline (post-reset state)
    let currentTimeline: typeof emptyTimeline | typeof populatedTimeline = emptyTimeline;
    timelineSet.getLiveTimeline = () => currentTimeline;
    timelineSet.getTimelineForEvent = () => undefined;

    const roomEmitter = new EventEmitter();
    const room = {
      on: roomEmitter.on.bind(roomEmitter),
      removeListener: roomEmitter.removeListener.bind(roomEmitter),
      emit: roomEmitter.emit.bind(roomEmitter),
      roomId: '!room:test',
      getUnfilteredTimelineSet: () => timelineSet as never,
      getEventReadUpTo: () => null,
      getThread: () => null,
      client: { getUserId: () => '@alice:test' },
    } as unknown as FakeRoom;

    const mx = createMx();
    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: mx as never,
        isAtBottom: true,
        isAtBottomRef: { current: true },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    // Initially empty — timeline renders nothing
    expect(result.current.eventsLength).toBe(0);

    // SDK injects events into the live timeline (num_live=0: no liveEvent fires)
    currentTimeline = populatedTimeline;

    // SDK emits ClientEvent.Room after injectRoomEvents completes
    await act(async () => {
      mx.emit(ClientEvent.Room, room);
      await Promise.resolve();
    });

    // The hook must now reflect the populated timeline
    expect(result.current.eventsLength).toBe(3);
  });
});
