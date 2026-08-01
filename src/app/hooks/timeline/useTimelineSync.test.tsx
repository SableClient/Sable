import { EventEmitter } from 'events';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import type { Room } from '$types/matrix-sdk';
import { Direction, MatrixEventEvent, RoomEvent } from '$types/matrix-sdk';
import { countVisibleAmongNewest, useTimelineSync } from './useTimelineSync';
import { getRoomUnreadInfo } from '$utils/timeline';
import type * as TimelineUtils from '$utils/timeline';

vi.mock('@sentry/react', () => ({
  default: {},
  startSpan: vi.fn<(options: unknown, fn: () => Promise<unknown>) => Promise<unknown>>(
    (_options, fn) => fn()
  ),
  addBreadcrumb: vi.fn<() => void>(),
  captureMessage: vi.fn<(msg: string) => void>(),
  metrics: {
    distribution: vi.fn<() => void>(),
  },
}));

vi.mock('$utils/timeline', async (importOriginal) => {
  const actual = await importOriginal<typeof TimelineUtils>();
  return {
    ...actual,
    getRoomUnreadInfo: vi.fn<typeof TimelineUtils.getRoomUnreadInfo>(),
  };
});

vi.mock('$utils/notifications', () => ({
  markAsRead: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

type FakeTimeline = {
  getEvents: () => unknown[];
  getNeighbouringTimeline: () => undefined;
  getPaginationToken: () => undefined;
  getRoomId: () => string;
};

type FakeTimelineSet = EventEmitter & {
  getLiveTimeline: () => FakeTimeline;
  getTimelineForEvent: () => undefined;
};

type FakeRoom = Room &
  EventEmitter & {
    emit: EventEmitter['emit'];
  };

function createTimeline(events: unknown[] = [{}]): FakeTimeline {
  return {
    getEvents: () => events,
    getNeighbouringTimeline: () => undefined,
    getPaginationToken: () => undefined,
    getRoomId: () => '!room:test',
  };
}

function createRoom(
  roomId = '!room:test',
  events: unknown[] = [{}]
): {
  room: FakeRoom;
  timelineSet: FakeTimelineSet;
  events: unknown[];
  timeline: FakeTimeline;
} {
  const timeline = {
    ...createTimeline(events),
    getRoomId: () => roomId,
  };
  const timelineSet = new EventEmitter() as FakeTimelineSet;
  timelineSet.getLiveTimeline = () => timeline;
  timelineSet.getTimelineForEvent = () => undefined;

  const roomEmitter = new EventEmitter();
  const room = {
    on: roomEmitter.on.bind(roomEmitter),
    removeListener: roomEmitter.removeListener.bind(roomEmitter),
    emit: roomEmitter.emit.bind(roomEmitter),
    roomId,
    getUnfilteredTimelineSet: () => timelineSet as never,
    getEventReadUpTo: () => null,
    getThread: () => null,
    getLiveTimeline: () => timeline,
    getUnreadNotificationCount: () => 0,
    getMyMembership: () => 'join',
    getMember: () => null,
    hasEncryptionStateEvent: () => false,
    client: {
      getUserId: () => '@alice:test',
    },
  } as unknown as FakeRoom;

  return { room, timelineSet, events, timeline };
}

function createPaginableRoom(roomId = '!room:test') {
  const events: unknown[] = [{}];
  const timeline = {
    getEvents: () => events,
    getNeighbouringTimeline: () => undefined,
    getPaginationToken: () => 'tok' as string | undefined,
    getTimelineSet: () => undefined,
    getRoomId: () => roomId,
  };
  const timelineSet = new EventEmitter() as FakeTimelineSet;
  timelineSet.getLiveTimeline = () => timeline as unknown as FakeTimeline;
  timelineSet.getTimelineForEvent = () => undefined;

  const roomEmitter = new EventEmitter();
  const room = {
    on: roomEmitter.on.bind(roomEmitter),
    removeListener: roomEmitter.removeListener.bind(roomEmitter),
    emit: roomEmitter.emit.bind(roomEmitter),
    roomId,
    getUnfilteredTimelineSet: () => timelineSet as never,
    getEventReadUpTo: () => null,
    getThread: () => null,
    getLiveTimeline: () => timeline,
    getUnreadNotificationCount: () => 0,
    getMyMembership: () => 'join',
    getMember: () => null,
    hasEncryptionStateEvent: () => false,
    client: {
      getUserId: () => '@alice:test',
    },
  } as unknown as FakeRoom;

  return { room, timelineSet, events };
}

const mxEmitter = new EventEmitter();
const makeMx = (extra: Record<string, unknown> = {}) =>
  ({
    getUserId: () => '@alice:test',
    on: mxEmitter.on.bind(mxEmitter),
    removeListener: mxEmitter.removeListener.bind(mxEmitter),
    ...extra,
  }) as never;

function makeEvent(sender: string, roomId: string) {
  return {
    threadRootId: undefined,
    getSender: () => sender,
    getRoomId: () => roomId,
    getTs: () => Date.now(),
    getRelation: () => undefined,
  };
}

function emitLiveTimelineEvent(
  room: FakeRoom,
  timeline: FakeTimeline,
  events: unknown[],
  sender: string
) {
  events.push({});
  room.emit(RoomEvent.Timeline, makeEvent(sender, room.roomId), room, false, false, {
    liveEvent: true,
    timeline,
  });
}

const makeTimeline = (ids: string[]) => {
  const timelineSet = { id: `set-${ids.join('')}` };
  return {
    getEvents: () => ids.map((id) => ({ id })),
    getTimelineSet: () => timelineSet,
  };
};

const count = (timelines: unknown[], n: number, backwards: boolean, visibleIds: string[]) => {
  const isVisible = (ev: { id: string }) => visibleIds.includes(ev.id);
  return countVisibleAmongNewest(timelines as never, n, backwards, isVisible as never);
};

describe('countVisibleAmongNewest', () => {
  it('counts only the newest events at the head when paginating backwards', () => {
    const timelines = [makeTimeline(['a', 'b', 'c']), makeTimeline(['d', 'e'])];

    expect(count(timelines, 3, true, ['a', 'c', 'e'])).toBe(2);
  });

  it('counts only the newest events at the tail when paginating forwards', () => {
    const timelines = [makeTimeline(['a', 'b', 'c']), makeTimeline(['d', 'e'])];

    expect(count(timelines, 3, false, ['a', 'c', 'e'])).toBe(2);
  });

  it('spans timeline boundaries when the fetched count exceeds one timeline', () => {
    const timelines = [makeTimeline(['a', 'b']), makeTimeline(['c', 'd'])];
    expect(count(timelines, 4, true, ['a', 'b', 'c', 'd'])).toBe(4);
  });

  it('returns zero when nothing fetched is rendered', () => {
    const timelines = [makeTimeline(['a', 'b', 'c'])];
    expect(count(timelines, 3, true, [])).toBe(0);
  });

  it('does not over-count when fetched exceeds the number of loaded events', () => {
    const timelines = [makeTimeline(['a', 'b'])];
    expect(count(timelines, 10, true, ['a', 'b'])).toBe(2);
  });

  it('handles empty timelines', () => {
    expect(count([], 5, true, ['a'])).toBe(0);
  });

  it('fuzz: matches a naive flatten-then-slice reference over random inputs', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      faker.seed(seed);
      const timelines = Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, (_t, t) =>
        makeTimeline(
          Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, (_e, e) => `t${t}e${e}`)
        )
      );
      const allIds = timelines.flatMap((t) => t.getEvents().map((ev: { id: string }) => ev.id));
      const visible = allIds.filter(() => faker.datatype.boolean({ probability: 0.5 }));
      const n = faker.number.int({ min: 0, max: allIds.length + 2 });
      const backwards = faker.datatype.boolean();

      const ordered = backwards ? allIds : allIds.toReversed();
      const expected = ordered.slice(0, n).filter((id) => visible.includes(id)).length;

      expect(count(timelines, n, backwards, visible), `seed ${seed}`).toBe(expected);
    }
  });
});

describe('useTimelineSync', () => {
  it('does not snap a non-bottom user to latest after TimelineReset', async () => {
    const { room, timelineSet, events } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
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

  it('keeps a bottom-pinned user anchored after TimelineReset', async () => {
    const { room, timelineSet } = createRoom();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
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

  it('resets timeline state when room.roomId changes and eventId is not set', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: { getUserId: () => '@alice:test' } as never,
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
          mx: { getUserId: () => '@alice:test' } as never,
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
          mx: { getUserId: () => '@alice:test' } as never,
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

  describe('auto-follow on live message', () => {
    it('scrolls to bottom with smooth behavior for an incoming message from another user', async () => {
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
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
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await Promise.resolve();
      });

      expect(scrollToBottom).toHaveBeenCalledWith('smooth');
      hasFocus.mockRestore();
    });

    it('scrolls to bottom with instant behavior for an own message', async () => {
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
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
        emitLiveTimelineEvent(room, timeline, events, '@alice:test');
        await Promise.resolve();
      });

      expect(scrollToBottom).toHaveBeenCalledWith('instant');
    });

    it('keeps following instantly and re-anchors the unread divider while unfocused', async () => {
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      const unread = { readUptoEventId: '$read:test', inLiveTimeline: true, scrollTo: false };
      vi.mocked(getRoomUnreadInfo).mockReturnValueOnce(unread);
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();
      const setUnreadInfo = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo,
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await Promise.resolve();
      });

      expect(setUnreadInfo).toHaveBeenCalledWith(unread);
      expect(scrollToBottom).toHaveBeenCalledWith('instant');
      hasFocus.mockRestore();
    });

    it('does not scroll when the user is not at the bottom', async () => {
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
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
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await Promise.resolve();
      });

      expect(scrollToBottom).not.toHaveBeenCalled();
    });

    it('ignores non-live (historical) timeline events', async () => {
      const { room, timeline } = createRoom();
      const scrollToBottom = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      const mEvent = makeEvent('@bob:test', room.roomId);
      await act(async () => {
        room.emit(RoomEvent.Timeline, mEvent, room, true, false, {
          liveEvent: false,
          timeline,
        });
        await Promise.resolve();
      });

      expect(scrollToBottom).not.toHaveBeenCalled();
    });

    it('ignores thread reply events', async () => {
      const { room, timeline } = createRoom();
      const scrollToBottom = vi.fn<() => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: { getUserId: () => '@alice:test' } as never,
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
        })
      );

      const mEvent = {
        threadRootId: '$thread-root:test',
        getSender: () => '@bob:test',
        getRoomId: () => room.roomId,
        getTs: () => Date.now(),
      };
      await act(async () => {
        room.emit(RoomEvent.Timeline, mEvent, room, false, false, {
          liveEvent: true,
          timeline,
        });
        await Promise.resolve();
      });

      expect(scrollToBottom).not.toHaveBeenCalled();
    });
  });
});

const syncOpts = (
  room: FakeRoom,
  paginateEventTimeline: ReturnType<typeof vi.fn>,
  isEventVisible?: () => boolean
) => ({
  room: room as Room,
  mx: { getUserId: () => '@alice:test', paginateEventTimeline } as never,
  isAtBottom: true,
  isAtBottomRef: { current: true },
  scrollToBottom: vi.fn<() => void>(),
  unreadInfo: undefined,
  setUnreadInfo: vi.fn<() => void>(),
  hideReadsRef: { current: false },
  readUptoEventIdRef: { current: undefined },
  isEventVisible,
});

describe('back-pagination', () => {
  describe('normal sync', () => {
    it('auto-continues over hidden-only pages, then settles back to idle', async () => {
      const { room, events } = createPaginableRoom();
      const paginateEventTimeline = vi.fn<() => Promise<boolean>>(async () => {
        events.push({});
        return true;
      });
      const { result } = renderHook(() =>
        useTimelineSync(syncOpts(room, paginateEventTimeline, () => false))
      );

      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });

      // Nothing rendered, so the loader keeps going up to MAX_AUTO_CONTINUATIONS.
      expect(paginateEventTimeline).toHaveBeenCalledTimes(4);
      expect(result.current.backwardStatus).toBe('idle');
    });

    it('keeps paginating while a page renders fewer than 5 events, and stops at 5', async () => {
      const thinPage = createPaginableRoom();
      const thinPaginate = vi.fn<() => Promise<boolean>>(async () => {
        thinPage.events.push({}, {}, {}, {});
        return true;
      });
      const thin = renderHook(() =>
        useTimelineSync(syncOpts(thinPage.room, thinPaginate, () => true))
      );
      await act(async () => {
        await thin.result.current.handleTimelinePagination(true);
      });
      expect(thinPaginate).toHaveBeenCalledTimes(4);

      const fullPage = createPaginableRoom();
      const fullPaginate = vi.fn<() => Promise<boolean>>(async () => {
        fullPage.events.push({}, {}, {}, {}, {});
        return true;
      });
      const full = renderHook(() =>
        useTimelineSync(syncOpts(fullPage.room, fullPaginate, () => true))
      );
      await act(async () => {
        await full.result.current.handleTimelinePagination(true);
      });
      expect(fullPaginate).toHaveBeenCalledTimes(1);
    });

    it('never reports idle before the fetched page is committed', async () => {
      // The sdk puts a fetched page in a fresh EventTimeline linked behind the
      // live one, so the new events only become visible once setTimeline commits.
      const { room, timelineSet } = createRoom();
      const live = timelineSet.getLiveTimeline() as unknown as {
        getEvents: () => unknown[];
        getPaginationToken: (d?: Direction) => string | undefined;
        getNeighbouringTimeline: (d: Direction) => unknown;
        getTimelineSet: () => unknown;
      };
      live.getPaginationToken = () => 'tok';
      live.getTimelineSet = () => timelineSet;
      let older: unknown;
      live.getNeighbouringTimeline = (direction: Direction) =>
        direction === Direction.Backward ? older : undefined;

      const paginateEventTimeline = vi.fn<() => Promise<boolean>>(async () => {
        live.getPaginationToken = () => undefined;
        older = {
          getEvents: () => [{}, {}, {}, {}, {}],
          getPaginationToken: () => undefined,
          getRoomId: () => room.roomId,
          getTimelineSet: () => timelineSet,
          getNeighbouringTimeline: (direction: Direction) =>
            direction === Direction.Forward ? live : undefined,
        };
        return true;
      });

      const commits: { eventsLength: number; backwardStatus: string }[] = [];
      const { result } = renderHook(() => {
        const sync = useTimelineSync(syncOpts(room as FakeRoom, paginateEventTimeline, () => true));
        commits.push({
          eventsLength: sync.eventsLength,
          backwardStatus: sync.backwardStatus,
        });
        return sync;
      });

      const lengthBefore = commits[0]!.eventsLength;
      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });

      // RoomTimeline releases the virtua scroll shift on the loading -> idle edge,
      // so idle without the rows would jump a scrolled-up user.
      const afterLoading = commits.slice(
        commits.findIndex((commit) => commit.backwardStatus === 'loading')
      );
      expect(afterLoading.length).toBeGreaterThan(0);
      expect(
        afterLoading.filter(
          (commit) => commit.backwardStatus === 'idle' && commit.eventsLength === lengthBefore
        )
      ).toEqual([]);
    });

    it('ignores overlapping pagination requests while one is in flight', async () => {
      const { room } = createPaginableRoom();
      const paginateEventTimeline = vi.fn<() => Promise<boolean>>(async () => false);
      const { result } = renderHook(() =>
        useTimelineSync(syncOpts(room, paginateEventTimeline, () => false))
      );

      await act(async () => {
        await Promise.all([
          result.current.handleTimelinePagination(true),
          result.current.handleTimelinePagination(true),
        ]);
      });

      // The page fetched nothing new, so no continuation either.
      expect(paginateEventTimeline).toHaveBeenCalledTimes(1);
      expect(result.current.backwardStatus).toBe('idle');
    });

    it('marks a failed backfill as error and recovers on retry', async () => {
      const { room, events } = createPaginableRoom();
      const paginateEventTimeline = vi
        .fn<() => Promise<boolean>>()
        .mockRejectedValueOnce(new Error('homeserver unavailable'))
        .mockImplementation(async () => {
          // A fully visible page: 5 rendered events, no continuation needed.
          events.push({}, {}, {}, {}, {});
          return true;
        });
      const { result } = renderHook(() =>
        useTimelineSync(syncOpts(room, paginateEventTimeline, () => true))
      );

      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });
      expect(result.current.backwardStatus).toBe('error');

      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });
      expect(result.current.backwardStatus).toBe('idle');
      expect(paginateEventTimeline).toHaveBeenCalledTimes(2);
    });
  });

  describe('sliding sync', () => {
    it('settles to idle when a TimelineReset lands mid-pagination', async () => {
      const { room, timelineSet } = createPaginableRoom();
      let resolvePaginate: ((value: boolean) => void) | undefined;
      const paginateEventTimeline = vi.fn<() => Promise<boolean>>(
        () =>
          new Promise<boolean>((resolve) => {
            resolvePaginate = resolve;
          })
      );
      const { result } = renderHook(() =>
        useTimelineSync(syncOpts(room, paginateEventTimeline, () => false))
      );

      let paginatePromise: Promise<void> | undefined;
      await act(async () => {
        paginatePromise = result.current.handleTimelinePagination(true);
        await Promise.resolve();
      });
      expect(result.current.backwardStatus).toBe('loading');

      // Sliding sync resets the live window while /messages is in flight.
      await act(async () => {
        timelineSet.emit(RoomEvent.TimelineReset);
        await Promise.resolve();
      });

      await act(async () => {
        resolvePaginate?.(true);
        await paginatePromise;
      });

      expect(result.current.backwardStatus).toBe('idle');
      expect(paginateEventTimeline).toHaveBeenCalledTimes(1);
    });
  });
});

const renderSyncHook = (
  room: FakeRoom,
  options: {
    isAtBottom?: boolean;
    mx?: Record<string, unknown>;
    readUptoEventId?: string;
  } = {}
) => {
  const scrollToBottom = vi.fn<() => void>();
  const isAtBottom = options.isAtBottom ?? true;
  const { result } = renderHook(() =>
    useTimelineSync({
      room: room as Room,
      mx: (options.mx ?? makeMx()) as never,
      isAtBottom,
      isAtBottomRef: { current: isAtBottom },
      scrollToBottom,
      unreadInfo: undefined,
      setUnreadInfo: vi.fn<() => void>(),
      hideReadsRef: { current: false },
      readUptoEventIdRef: { current: options.readUptoEventId },
    })
  );
  return { result, scrollToBottom };
};

const makeLiveEvent = (roomId: string, ts: number) => ({
  threadRootId: undefined,
  getSender: () => '@bob:test',
  getRoomId: () => roomId,
  getTs: () => ts,
  getRelation: () => undefined,
});

describe('live-arrive edge cases', () => {
  it('ignores timeline events emitted for a different room', async () => {
    const { room, timeline, events } = createRoom();
    const otherRoom = createRoom('!other:test');
    const { scrollToBottom } = renderSyncHook(room);

    await act(async () => {
      events.push({});
      room.emit(
        RoomEvent.Timeline,
        makeLiveEvent(otherRoom.room.roomId, Date.now()),
        otherRoom.room,
        false,
        false,
        {
          liveEvent: true,
          timeline,
        }
      );
      await Promise.resolve();
    });

    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('ignores removed events arriving with non-live data', async () => {
    const { room, timeline, events } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, true, {
        liveEvent: false,
        timeline,
      });
      await Promise.resolve();
    });

    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('treats only recent non-live events as part of the reconnect backfill window', async () => {
    const { room, timeline, events } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);

    // A reconnect pages events onto the live timeline without liveEvent: true;
    // anything older than the 60 s grace window is history, not an arrival.
    await act(async () => {
      events.push({});
      room.emit(
        RoomEvent.Timeline,
        makeLiveEvent(room.roomId, Date.now() - 120_000),
        room,
        false,
        false,
        { liveEvent: false, timeline }
      );
      await Promise.resolve();
    });
    expect(scrollToBottom).not.toHaveBeenCalled();

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: false,
        timeline,
      });
      await Promise.resolve();
    });
    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('ignores events emitted on a non-live timeline of the same room', async () => {
    const { room, events } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);
    // A detached window (permalink jump / search result) backfilling in the
    // background must not pull the view to the bottom of the live timeline.
    const detached = createTimeline([{}]);

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: false,
        timeline: detached,
      });
      await Promise.resolve();
    });

    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('re-anchors after a sliding sync reset and ignores events on the detached timeline', async () => {
    const { room, timelineSet } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);
    const oldTimeline = timelineSet.getLiveTimeline();
    const freshEvents: unknown[] = [];
    const freshTimeline = createTimeline(freshEvents);
    timelineSet.getLiveTimeline = () => freshTimeline;

    // An event arriving on the OLD timeline is dropped even though the live
    // timeline did grow — pushing to `events` instead would pass either way.
    await act(async () => {
      freshEvents.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: false,
        timeline: oldTimeline,
      });
      await Promise.resolve();
    });
    expect(scrollToBottom).not.toHaveBeenCalled();

    await act(async () => {
      freshEvents.push({});
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });
    expect(scrollToBottom).toHaveBeenCalledWith('instant');

    scrollToBottom.mockClear();
    await act(async () => {
      freshEvents.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: false,
        timeline: freshTimeline,
      });
      await Promise.resolve();
    });
    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('updates the unread marker for a live event while scrolled up, without scrolling', async () => {
    const { room, timeline, events } = createRoom();
    const unread = { readUptoEventId: '$read:test', inLiveTimeline: true, scrollTo: false };
    vi.mocked(getRoomUnreadInfo).mockReturnValue(unread);
    const setUnreadInfo = vi.fn<() => void>();
    const scrollToBottom = vi.fn<() => void>();

    renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: { getUserId: () => '@alice:test' } as never,
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo,
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
      })
    );

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: true,
        timeline,
      });
      await Promise.resolve();
    });

    expect(setUnreadInfo).toHaveBeenCalledWith(unread);
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('re-renders when a late local echo updates (slow send acknowledgement)', async () => {
    const { room } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timeline;

    await act(async () => {
      room.emit(RoomEvent.LocalEchoUpdated, {}, room);
      await Promise.resolve();
    });

    expect(result.current.timeline).not.toBe(before);
  });
});

describe('event jump recovery', () => {
  // A room where the target event is nowhere in the loaded window, so the loader
  // has to pull a fresh window from the homeserver before it can jump.
  const setupUnloadedTarget = (targetId: string) => {
    const { room, timelineSet } = createRoom();
    timelineSet.getTimelineForEvent = () => undefined;

    const olderEvents = [{ getId: () => '$older:test' }, { getId: () => '$older2:test' }];
    const olderTimeline = {
      getEvents: () => olderEvents,
      getPaginationToken: () => undefined,
      getRoomId: () => room.roomId,
      getNeighbouringTimeline: (direction: Direction) =>
        direction === Direction.Forward ? targetTimeline : undefined,
    };
    const targetTimeline = {
      getEvents: () => [{ getId: () => targetId }],
      getPaginationToken: () => undefined,
      getRoomId: () => room.roomId,
      getNeighbouringTimeline: (direction: Direction) =>
        direction === Direction.Backward ? olderTimeline : undefined,
    };

    const roomInitialSync = vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined));
    const getLatestTimeline = vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined));
    return {
      room,
      olderTimeline,
      targetTimeline,
      roomInitialSync,
      getLatestTimeline,
      mx: {
        getUserId: () => '@alice:test',
        roomInitialSync,
        getLatestTimeline,
        getEventTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(targetTimeline)),
      },
    };
  };

  it('backfills and jumps to a permalink target that is not in the loaded history', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const { result, scrollToBottom } = renderSyncHook(fixture.room, {
      isAtBottom: false,
      mx: fixture.mx,
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });

    expect(fixture.roomInitialSync).toHaveBeenCalled();
    expect(fixture.getLatestTimeline).toHaveBeenCalled();
    // The whole linked chain is adopted, not just the timeline holding the event.
    expect(result.current.timeline.linkedTimelines).toEqual([
      fixture.olderTimeline,
      fixture.targetTimeline,
    ]);
    // Absolute index across the chain: 2 older events precede the target.
    expect(result.current.focusItem).toEqual({ index: 2, scrollTo: true, highlight: true });
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('jumps without highlighting when the target is the read marker itself', async () => {
    const fixture = setupUnloadedTarget('$read:test');
    const { result } = renderSyncHook(fixture.room, {
      isAtBottom: false,
      mx: fixture.mx,
      readUptoEventId: '$read:test',
    });

    await act(async () => {
      await result.current.loadEventTimeline('$read:test');
    });

    expect(result.current.focusItem).toEqual({ index: 2, scrollTo: true, highlight: false });
  });

  it('falls back to the initial timeline when a jump load times out', async () => {
    vi.useFakeTimers();
    try {
      const { room } = createRoom();
      const mx = {
        getUserId: () => '@alice:test',
        roomInitialSync: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
        getLatestTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
        // The homeserver never answers /context: hit the 12 s timeout.
        getEventTimeline: () => new Promise(() => {}),
      };
      const { result, scrollToBottom } = renderSyncHook(room, { isAtBottom: false, mx });

      await act(async () => {
        const pending = result.current.loadEventTimeline('$missing:test');
        await vi.advanceTimersByTimeAsync(13_000);
        await pending;
      });

      expect(scrollToBottom).toHaveBeenCalledWith('instant');
      expect(result.current.timeline.linkedTimelines).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('sliding sync chain relink', () => {
  it('re-links a grown timeline chain without fetching when the token is gone', async () => {
    const { room, timelineSet } = createRoom();
    const first = timelineSet.getLiveTimeline();
    (first as { getEvents: () => unknown[] }).getEvents = () => [{}];
    (first as { getPaginationToken: () => string | undefined }).getPaginationToken = () =>
      undefined;
    const paginateEventTimeline = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
    const { result } = renderSyncHook(room, {
      mx: { getUserId: () => '@alice:test', paginateEventTimeline },
    });

    expect(result.current.eventsLength).toBe(1);

    // A sliding sync limited response re-linked the chain server-side: the
    // live timeline now has a forward neighbour we never saw.
    const second = {
      getEvents: () => [{}],
      getPaginationToken: () => undefined as string | undefined,
      getRoomId: () => room.roomId,
      getNeighbouringTimeline: (direction: Direction) =>
        direction === Direction.Backward ? first : undefined,
    };
    (first as { getNeighbouringTimeline: (d: Direction) => unknown }).getNeighbouringTimeline = (
      direction
    ) => (direction === Direction.Forward ? second : undefined);

    await act(async () => {
      await result.current.handleTimelinePagination(true);
    });

    expect(paginateEventTimeline).not.toHaveBeenCalled();
    expect(result.current.eventsLength).toBe(2);
    expect(result.current.backwardStatus).toBe('idle');
  });
});

describe('sync transport fuzz', () => {
  it.each([
    // sliding sync additionally injects TimelineReset (limited windows)
    ['normal sync', false],
    ['sliding sync', true],
  ])(
    '%s: random op sequences never scroll a scrolled-up user and settle statuses',
    async (_label, withResets) => {
      for (let seed = 1; seed <= 30; seed += 1) {
        faker.seed(seed * 55_440_491);
        const { room, timelineSet, events } = createPaginableRoom();
        const paginateEventTimeline = vi.fn<() => Promise<boolean>>(() => {
          // 15% transient homeserver failure; otherwise 1..3 events land.
          if (faker.number.float() < 0.15) return Promise.reject(new Error('hs down'));
          const n = faker.number.int({ min: 1, max: 3 });
          for (let i = 0; i < n; i += 1)
            events.push({ hidden: faker.datatype.boolean({ probability: 0.4 }) });
          return Promise.resolve(true);
        });
        const scrollToBottom = vi.fn<() => void>();
        const { result, unmount } = renderHook(() =>
          useTimelineSync({
            room: room as Room,
            mx: { getUserId: () => '@alice:test', paginateEventTimeline } as never,
            isAtBottom: false,
            isAtBottomRef: { current: false },
            scrollToBottom,
            unreadInfo: undefined,
            setUnreadInfo: vi.fn<() => void>(),
            hideReadsRef: { current: false },
            readUptoEventIdRef: { current: undefined },
            isEventVisible: (ev) => !(ev as unknown as { hidden?: boolean }).hidden,
          })
        );

        for (let i = 0; i < 30; i += 1) {
          const op = faker.number.int({ min: 0, max: withResets ? 4 : 3 });
          // eslint-disable-next-line no-await-in-loop -- ops must be sequential
          await act(async () => {
            if (op === 0) {
              // live message
              events.push({});
              room.emit(
                RoomEvent.Timeline,
                makeLiveEvent(room.roomId, Date.now()),
                room,
                false,
                false,
                { liveEvent: true, timeline: timelineSet.getLiveTimeline() }
              );
            } else if (op === 1) {
              // reconnect backfill (old timestamp, not flagged live)
              events.push({});
              room.emit(
                RoomEvent.Timeline,
                makeLiveEvent(room.roomId, Date.now() - 120_000),
                room,
                false,
                false,
                { liveEvent: false, timeline: timelineSet.getLiveTimeline() }
              );
            } else if (op === 2) {
              void result.current.handleTimelinePagination(true);
            } else if (op === 3) {
              void result.current.handleTimelinePagination(false);
            } else {
              // sliding sync limited window wipes and re-links the chain
              timelineSet.emit(RoomEvent.TimelineReset);
            }
            await Promise.resolve();
          });

          // A user reading old history is never scrolled, and neither
          // pagination direction ever wedges outside a known status.
          expect(scrollToBottom).not.toHaveBeenCalled();
          expect(['idle', 'loading', 'error']).toContain(result.current.backwardStatus);
          expect(['idle', 'loading', 'error']).toContain(result.current.forwardStatus);
        }

        unmount();
      }
    }
  );
});
