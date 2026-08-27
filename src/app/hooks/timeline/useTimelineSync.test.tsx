import { EventEmitter } from 'events';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import type { EventTimelineSet, MatrixEvent, Room } from '$types/matrix-sdk';
import { Direction, MatrixEventEvent, RoomEvent } from '$types/matrix-sdk';
import { countVisibleAmongNewest, useTimelineSync } from './useTimelineSync';
import { getRoomUnreadInfo } from '$utils/timeline';
import { markAsRead } from '$utils/notifications';
import { isWindowFocused } from '$utils/dom';
import type * as TimelineUtils from '$utils/timeline';
import type * as DomUtils from '$utils/dom';

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

vi.mock('$utils/dom', async (importOriginal) => {
  const actual = await importOriginal<typeof DomUtils>();
  return {
    ...actual,
    isWindowFocused: vi.fn<typeof DomUtils.isWindowFocused>(actual.isWindowFocused),
  };
});

type FakeTimeline = {
  getEvents: () => unknown[];
  getNeighbouringTimeline: () => undefined;
  getPaginationToken: (direction?: Direction) => string | undefined;
  getRoomId: () => string;
  getTimelineSet: () => FakeTimelineSet | undefined;
};

type FakeTimelineSet = EventEmitter & {
  getLiveTimeline: () => FakeTimeline;
  getTimelineForEvent: (eventId?: string) => FakeTimeline | undefined;
  findEventById?: (eventId: string) => unknown;
};

type FakeRoom = Room &
  EventEmitter & {
    emit: EventEmitter['emit'];
  };

function createTimeline(events: unknown[] = [{}], timelineSet?: FakeTimelineSet): FakeTimeline {
  return {
    getEvents: () => events,
    getNeighbouringTimeline: () => undefined,
    getPaginationToken: () => undefined,
    getRoomId: () => '!room:test',
    getTimelineSet: () => timelineSet,
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
  const timelineSet = new EventEmitter() as FakeTimelineSet;
  const timeline = {
    ...createTimeline(events),
    getRoomId: () => roomId,
    getTimelineSet: () => timelineSet,
  };
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
    paginateEventTimeline: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
    ...extra,
  }) as never;

function makeEvent(sender: string, roomId: string) {
  return {
    threadRootId: undefined,
    getSender: () => sender,
    getRoomId: () => roomId,
    getTs: () => Date.now(),
    getRelation: () => undefined,
    isSending: () => sender === '@alice:test',
    isRelation: () => false,
    isRedaction: () => false,
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

const flushRaf = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

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
        mx: makeMx(),
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
        isInactivePanelRef: { current: false },
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
        mx: makeMx(),
        isAtBottom: true,
        isAtBottomRef: { current: true },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
        isInactivePanelRef: { current: false },
      })
    );

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('leaves a loaded jump window alone when the unfiltered set resets', async () => {
    const { room, timelineSet } = createRoom();
    const targetEvent = { getId: () => '$target' };
    const reloadedTimeline = createTimeline([targetEvent], timelineSet);
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>((set) => {
      reloadedTimeline.getTimelineSet = () => set as FakeTimelineSet;
      return Promise.resolve(reloadedTimeline);
    });
    const { result } = renderHook(() =>
      useTimelineSync({
        room: room as Room,
        mx: makeMx({ getEventTimeline }),
        eventId: '$target',
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
        isInactivePanelRef: { current: false },
      })
    );

    await act(async () => {
      await result.current.loadEventTimeline('$target');
    });
    const loadsBeforeReset = getEventTimeline.mock.calls.length;
    expect(loadsBeforeReset).toBe(1);

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(getEventTimeline.mock.calls.length).toBe(loadsBeforeReset);
    expect(result.current.timeline.linkedTimelines).toEqual([reloadedTimeline]);
  });

  it('resets timeline state when room.roomId changes and eventId is not set', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: makeMx(),
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
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

  it('restores the new room live timeline when eventId is set during a room change', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room, eventId }) =>
        useTimelineSync({
          room,
          mx: makeMx(),
          eventId,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
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

    expect(result.current.timeline.linkedTimelines[0]).toBe(roomTwo.timelineSet.getLiveTimeline());
  });

  it('does not reset timeline when the roomId stays the same', async () => {
    const roomOne = createRoom('!room:one');
    const sameRoomId = createRoom('!room:one');
    const scrollToBottom = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      ({ room }) =>
        useTimelineSync({
          room,
          mx: makeMx(),
          eventId: undefined,
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
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

  it('ignores a pending result for the previous room even when the event id is unchanged', async () => {
    const roomOne = createRoom('!room:one');
    const roomTwo = createRoom('!room:two');
    const targetId = '$same:test';
    const oldTargetTimeline = {
      ...createTimeline([{ getId: () => targetId }], roomOne.timelineSet),
      getNeighbouringTimeline: () => undefined,
    };
    roomOne.timelineSet.getTimelineForEvent = () => oldTargetTimeline as never;
    let resolveJump: ((timeline: unknown) => void) | undefined;
    const mx = makeMx({
      getEventTimeline: vi.fn<() => Promise<unknown>>(
        () =>
          new Promise((resolve) => {
            resolveJump = resolve;
          })
      ),
    });
    const options = {
      mx,
      eventId: targetId,
      isAtBottom: false,
      isAtBottomRef: { current: false },
      scrollToBottom: vi.fn<() => void>(),
      unreadInfo: undefined,
      setUnreadInfo: vi.fn<() => void>(),
      hideReadsRef: { current: false },
      readUptoEventIdRef: { current: undefined },
      isInactivePanelRef: { current: false },
    };
    const { result, rerender } = renderHook(({ room }) => useTimelineSync({ ...options, room }), {
      initialProps: { room: roomOne.room as Room },
    });

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.loadEventTimeline(targetId);
      await Promise.resolve();
    });
    rerender({ room: roomTwo.room as Room });
    await act(async () => {
      resolveJump?.(oldTargetTimeline);
      await pending;
    });

    expect(result.current.timeline.linkedTimelines).not.toContain(oldTargetTimeline);
    expect(result.current.focusItem).toBeUndefined();
  });

  describe('auto-follow on live message', () => {
    it('scrolls to bottom with smooth behavior for an incoming message from another user', async () => {
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const { room, timeline, events } = createRoom();
      const scrollToBottom = vi.fn<(behavior?: 'instant' | 'smooth') => void>();

      renderHook(() =>
        useTimelineSync({
          room: room as Room,
          mx: makeMx(),
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await flushRaf();
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
          mx: makeMx(),
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@alice:test');
        await flushRaf();
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
          mx: makeMx(),
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo,
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
        })
      );

      await act(async () => {
        emitLiveTimelineEvent(room, timeline, events, '@bob:test');
        await flushRaf();
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
          mx: makeMx(),
          isAtBottom: false,
          isAtBottomRef: { current: false },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
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
          mx: makeMx(),
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
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
          mx: makeMx(),
          isAtBottom: true,
          isAtBottomRef: { current: true },
          scrollToBottom,
          unreadInfo: undefined,
          setUnreadInfo: vi.fn<() => void>(),
          hideReadsRef: { current: false },
          readUptoEventIdRef: { current: undefined },
          isInactivePanelRef: { current: false },
        })
      );

      const mEvent = {
        threadRootId: '$thread-root:test',
        getSender: () => '@bob:test',
        getRoomId: () => room.roomId,
        getTs: () => Date.now(),
        isRedaction: () => false,
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
  mx: makeMx({ paginateEventTimeline }),
  isAtBottom: true,
  isAtBottomRef: { current: true },
  scrollToBottom: vi.fn<() => void>(),
  unreadInfo: undefined,
  setUnreadInfo: vi.fn<() => void>(),
  hideReadsRef: { current: false },
  readUptoEventIdRef: { current: undefined },
  isInactivePanelRef: { current: false },
  isEventVisible,
});

describe('back-pagination', () => {
  describe('a failed backfill leaves the gate open', () => {
    it('keeps the status idle so a later attempt is not blocked', async () => {
      const { room } = createPaginableRoom();
      const paginate = vi.fn<() => Promise<boolean>>(async () => {
        throw new Error('net::ERR_INTERNET_DISCONNECTED');
      });
      const { result } = renderHook(() => useTimelineSync(syncOpts(room, paginate, () => false)));

      await act(async () => {
        await result.current.handleTimelinePagination(true, true);
      });

      expect(result.current.backwardError).toBe(true);
      expect(result.current.backwardStatus).toBe('idle');
    });

    it('clears the error as soon as the next attempt starts', async () => {
      const { room, events } = createPaginableRoom();
      const paginate = vi
        .fn<() => Promise<boolean>>()
        .mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))
        .mockImplementation(async () => {
          events.push({}, {}, {}, {}, {});
          return true;
        });
      const { result } = renderHook(() => useTimelineSync(syncOpts(room, paginate, () => true)));

      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });
      expect(result.current.backwardError).toBe(true);

      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });
      expect(result.current.backwardError).toBe(false);
    });
  });

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
        await result.current.handleTimelinePagination(true, true);
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
        await thin.result.current.handleTimelinePagination(true, true);
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

    it('loads one sparse page for a user-driven scroll', async () => {
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

      expect(paginateEventTimeline).toHaveBeenCalledTimes(1);
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
      expect(result.current.backwardError).toBe(true);
      // The gate must not latch, or neither retry path can ever fire again.
      expect(result.current.backwardStatus).toBe('idle');

      await act(async () => {
        await result.current.handleTimelinePagination(true);
      });
      expect(result.current.backwardError).toBe(false);
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

    it('releases the lock after a reset so a later request still runs', async () => {
      const { room, timelineSet } = createPaginableRoom();
      const resolvers: ((value: boolean) => void)[] = [];
      const paginateEventTimeline = vi.fn<() => Promise<boolean>>(
        () => new Promise<boolean>((resolve) => resolvers.push(resolve))
      );
      const { result } = renderHook(() =>
        useTimelineSync(syncOpts(room, paginateEventTimeline, () => false))
      );

      let paginatePromise: Promise<void> | undefined;
      await act(async () => {
        paginatePromise = result.current.handleTimelinePagination(true);
        await Promise.resolve();
      });

      await act(async () => {
        timelineSet.emit(RoomEvent.TimelineReset);
        resolvers[0]?.(true);
        await paginatePromise;
      });
      expect(result.current.backwardStatus).toBe('idle');

      await act(async () => {
        const retry = result.current.handleTimelinePagination(true);
        await Promise.resolve();
        resolvers[1]?.(true);
        await retry;
      });

      expect(paginateEventTimeline).toHaveBeenCalledTimes(2);
      expect(result.current.backwardStatus).toBe('idle');
    });
  });
});

function createChainedRoom(roomId = '!room:test') {
  const olderEvents: unknown[] = [{}];
  const liveEvents: unknown[] = [{}];
  const tokens = {
    olderBackward: 'older-back' as string | undefined,
    olderForward: 'older-forward-stale' as string | undefined,
    liveBackward: undefined as string | undefined,
    liveForward: 'live-forward' as string | undefined,
  };

  const timelineSet = new EventEmitter() as FakeTimelineSet;
  const older = {
    getEvents: () => olderEvents,
    getPaginationToken: (d: Direction) =>
      d === Direction.Backward ? tokens.olderBackward : tokens.olderForward,
    getNeighbouringTimeline: (d: Direction) => (d === Direction.Forward ? live : undefined),
    getRoomId: () => roomId,
    getTimelineSet: () => timelineSet,
  };
  const live = {
    getEvents: () => liveEvents,
    getPaginationToken: (d: Direction) =>
      d === Direction.Backward ? tokens.liveBackward : tokens.liveForward,
    getNeighbouringTimeline: (d: Direction) => (d === Direction.Backward ? older : undefined),
    getRoomId: () => roomId,
    getTimelineSet: () => timelineSet,
  };
  timelineSet.getLiveTimeline = () => live as unknown as FakeTimeline;
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
    getLiveTimeline: () => live,
    getUnreadNotificationCount: () => 0,
    getMyMembership: () => 'join',
    getMember: () => null,
    hasEncryptionStateEvent: () => false,
    client: { getUserId: () => '@alice:test' },
  } as unknown as FakeRoom;

  return { room, timelineSet, older, live, olderEvents, liveEvents, tokens };
}

describe('pagination continuation bounds', () => {
  it('reads the newest timeline for the forward continuation token, not the oldest', async () => {
    const chain = createChainedRoom();
    const paginateEventTimeline = vi.fn<() => Promise<boolean>>(async () => {
      chain.liveEvents.push({});
      chain.tokens.liveForward = undefined;
      return true;
    });
    const { result } = renderHook(() =>
      useTimelineSync(syncOpts(chain.room, paginateEventTimeline, () => false))
    );

    await act(async () => {
      await result.current.handleTimelinePagination(false);
    });

    expect(chain.older.getPaginationToken(Direction.Forward)).toBe('older-forward-stale');
    expect(paginateEventTimeline).toHaveBeenCalledTimes(1);
    expect(result.current.forwardStatus).toBe('idle');
  });

  it('settles to idle when the continuation token disappears between iterations', async () => {
    const { room, events } = createPaginableRoom();
    const timeline = room.getUnfilteredTimelineSet().getLiveTimeline() as unknown as {
      getPaginationToken: () => string | undefined;
    };
    const paginateEventTimeline = vi.fn<() => Promise<boolean>>(async () => {
      events.push({});
      timeline.getPaginationToken = () => undefined;
      return true;
    });
    const { result } = renderHook(() =>
      useTimelineSync(syncOpts(room, paginateEventTimeline, () => false))
    );

    await act(async () => {
      await result.current.handleTimelinePagination(true);
    });

    expect(paginateEventTimeline).toHaveBeenCalledTimes(1);
    expect(result.current.backwardStatus).toBe('idle');
  });

  it('settles to idle when the timeline chain empties mid-flight', async () => {
    const { room, timelineSet, events } = createPaginableRoom();
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

    await act(async () => {
      events.length = 0;
      timelineSet.emit(RoomEvent.TimelineReset);
      resolvePaginate?.(true);
      await paginatePromise;
    });

    expect(paginateEventTimeline).toHaveBeenCalledTimes(1);
    expect(result.current.backwardStatus).toBe('idle');
  });

  it('deduplicates concurrent requests per direction', async () => {
    const chain = createChainedRoom();
    const paginateEventTimeline = vi.fn<() => Promise<boolean>>(async () => {
      chain.liveEvents.push({}, {}, {}, {}, {});
      return true;
    });
    const { result } = renderHook(() =>
      useTimelineSync(syncOpts(chain.room, paginateEventTimeline, () => true))
    );

    await act(async () => {
      await Promise.all([
        result.current.handleTimelinePagination(true),
        result.current.handleTimelinePagination(true),
        result.current.handleTimelinePagination(false),
        result.current.handleTimelinePagination(false),
      ]);
    });

    expect(paginateEventTimeline).toHaveBeenCalledTimes(2);
    expect(result.current.backwardStatus).toBe('idle');
    expect(result.current.forwardStatus).toBe('idle');
  });
});

const renderSyncHook = (
  room: FakeRoom,
  options: {
    isAtBottom?: boolean;
    mx?: Record<string, unknown>;
    readUptoEventId?: string;
    isInactivePanel?: boolean;
    eventId?: string;
    isEventVisible?: (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => boolean;
  } = {}
) => {
  const scrollToBottom = vi.fn<() => void>();
  const setUnreadInfo = vi.fn<() => void>();
  const onJumpError = vi.fn<() => void>();
  const onReturnToLive = vi.fn<() => void>();
  const initialIsAtBottom = options.isAtBottom ?? true;
  const { result, rerender } = renderHook(
    ({
      eventId,
      isAtBottom = initialIsAtBottom,
    }: {
      eventId: string | undefined;
      isAtBottom?: boolean;
    }) =>
      useTimelineSync({
        room: room as Room,
        mx: (options.mx ?? makeMx()) as never,
        eventId,
        isAtBottom,
        isAtBottomRef: { current: isAtBottom },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo,
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: options.readUptoEventId },
        isInactivePanelRef: { current: options.isInactivePanel ?? false },
        onJumpError,
        onReturnToLive,
        isEventVisible: options.isEventVisible,
      }),
    { initialProps: { eventId: options.eventId, isAtBottom: initialIsAtBottom } }
  );
  return { result, scrollToBottom, setUnreadInfo, onJumpError, onReturnToLive, rerender };
};

const redactionOf = (targetId: string) =>
  ({
    event: { redacts: targetId },
    isRedaction: () => true,
    getSender: () => '@bob:test',
    getRelation: () => undefined,
  }) as unknown as MatrixEvent;

const makeLiveEvent = (roomId: string, ts: number) => ({
  threadRootId: undefined,
  getSender: () => '@bob:test',
  getRoomId: () => roomId,
  getTs: () => ts,
  getRelation: () => undefined,
  isRedaction: () => false,
});

describe('live-arrive edge cases', () => {
  it('returns to the live end when an own message is sent while scrolled up', async () => {
    const { room, timeline, events } = createRoom();
    const { onReturnToLive, scrollToBottom } = renderSyncHook(room, { isAtBottom: false });
    const ownEvent = {
      ...makeEvent('@alice:test', room.roomId),
      isSending: () => true,
    };

    await act(async () => {
      events.push(ownEvent);
      room.emit(RoomEvent.Timeline, ownEvent, room, false, false, {
        liveEvent: true,
        timeline,
      });
      await Promise.resolve();
    });

    expect(onReturnToLive).toHaveBeenCalledOnce();
    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

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
      events.pop();
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, true, {
        liveEvent: false,
        timeline,
      });
      await Promise.resolve();
    });

    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('renders a stale non-live event appended to the live timeline', async () => {
    const { room, timeline, events } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timelineVersion;
    vi.mocked(isWindowFocused).mockReturnValue(true);
    await act(async () => {
      await flushRaf();
    });
    vi.mocked(markAsRead).mockClear();

    await act(async () => {
      events.push({});
      room.emit(
        RoomEvent.Timeline,
        makeLiveEvent(room.roomId, Date.now() - 29 * 60_000),
        room,
        false,
        false,
        { liveEvent: false, timeline }
      );
      await flushRaf();
    });

    expect(result.current.timelineVersion).toBeGreaterThan(before);
    expect(markAsRead).not.toHaveBeenCalled();
    vi.mocked(isWindowFocused).mockReturnValue(false);
  });

  it('renders a removal', async () => {
    const { room, timeline, events } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timelineVersion;

    await act(async () => {
      events.pop();
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, true, {
        liveEvent: false,
        timeline,
      });
      await flushRaf();
    });

    expect(result.current.timelineVersion).toBeGreaterThan(before);
  });

  it('ignores events emitted for a thread timeline set', async () => {
    const { room, events } = createRoom();
    const otherSet = new EventEmitter() as FakeTimelineSet;
    const threadTimeline = { ...createTimeline(events), getTimelineSet: () => otherSet };
    const { result, scrollToBottom } = renderSyncHook(room);
    const before = result.current.timelineVersion;

    await act(async () => {
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: true,
        timeline: threadTimeline,
      });
      await Promise.resolve();
    });

    expect(result.current.timelineVersion).toBe(before);
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('does not treat a threaded reply as an arrival when it lands on the main set', async () => {
    const { room, timeline, events } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timelineVersion;
    vi.mocked(isWindowFocused).mockReturnValue(true);
    await act(async () => {
      await flushRaf();
    });
    vi.mocked(markAsRead).mockClear();

    await act(async () => {
      events.push({});
      room.emit(
        RoomEvent.Timeline,
        {
          ...makeLiveEvent(room.roomId, Date.now()),
          threadRootId: '$root:test',
          getId: () => '$reply:test',
          getContent: () => ({ 'm.relates_to': { rel_type: 'm.thread', event_id: '$root:test' } }),
          getRelation: () => ({ rel_type: 'm.thread', event_id: '$root:test' }),
        },
        room,
        false,
        false,
        { liveEvent: true, timeline }
      );
      await flushRaf();
    });

    expect(result.current.timelineVersion).toBeGreaterThan(before);
    expect(markAsRead).not.toHaveBeenCalled();
    vi.mocked(isWindowFocused).mockReturnValue(false);
  });

  it('scrolls for a genuinely live event on the main timeline', async () => {
    const { room, timeline, events } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);

    await act(async () => {
      events.push({});
      room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
        liveEvent: true,
        timeline,
      });
      await flushRaf();
    });

    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('does not mark a room read while it sits behind the room list', async () => {
    vi.mocked(isWindowFocused).mockReturnValue(true);
    const emitLive = async (room: FakeRoom, timeline: FakeTimeline, events: unknown[]) => {
      await act(async () => {
        events.push({});
        room.emit(RoomEvent.Timeline, makeLiveEvent(room.roomId, Date.now()), room, false, false, {
          liveEvent: true,
          timeline,
        });
        await flushRaf();
      });
    };

    const active = createRoom();
    renderSyncHook(active.room);
    await emitLive(active.room, active.timeline, active.events);
    expect(markAsRead).toHaveBeenCalled();

    vi.mocked(markAsRead).mockClear();

    const inactive = createRoom('!behind:test');
    renderSyncHook(inactive.room, { isInactivePanel: true });
    await emitLive(inactive.room, inactive.timeline, inactive.events);
    expect(markAsRead).not.toHaveBeenCalled();

    vi.mocked(isWindowFocused).mockRestore();
  });

  it('ignores events emitted on a non-live timeline of the same room', async () => {
    const { room, events } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);
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

  it('re-anchors after a sliding sync reset without treating the old timeline as an arrival', async () => {
    const { room, timelineSet } = createRoom();
    const { scrollToBottom } = renderSyncHook(room);
    const oldTimeline = timelineSet.getLiveTimeline();
    const freshEvents: unknown[] = [];
    const freshTimeline = createTimeline(freshEvents, timelineSet);
    timelineSet.getLiveTimeline = () => freshTimeline;

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
      await flushRaf();
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
        mx: makeMx(),
        isAtBottom: false,
        isAtBottomRef: { current: false },
        scrollToBottom,
        unreadInfo: undefined,
        setUnreadInfo,
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
        isInactivePanelRef: { current: false },
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

  it('re-renders when an event finishes decrypting', async () => {
    const { room } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timelineVersion;

    await act(async () => {
      mxEmitter.emit(MatrixEventEvent.Decrypted, { getRoomId: () => room.roomId });
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
    });

    expect(result.current.timelineVersion).toBeGreaterThan(before);
  });

  it('ignores decryption of an event in another room', async () => {
    const { room } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timelineVersion;

    await act(async () => {
      mxEmitter.emit(MatrixEventEvent.Decrypted, { getRoomId: () => '!other:test' });
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
    });

    expect(result.current.timelineVersion).toBe(before);
  });

  it('re-renders when a late local echo updates (slow send acknowledgement)', async () => {
    const { room } = createRoom();
    const { result } = renderSyncHook(room);
    const before = result.current.timelineVersion;

    await act(async () => {
      room.emit(RoomEvent.LocalEchoUpdated, {}, room);
      await flushRaf();
    });

    expect(result.current.timelineVersion).toBeGreaterThan(before);
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
      getTimelineSet: () => timelineSet,
      getNeighbouringTimeline: (direction: Direction) =>
        direction === Direction.Forward ? targetTimeline : undefined,
    };
    const targetTimeline = {
      getEvents: () => [{ getId: () => targetId }],
      getPaginationToken: () => undefined,
      getRoomId: () => room.roomId,
      getTimelineSet: () => timelineSet,
      getNeighbouringTimeline: (direction: Direction) =>
        direction === Direction.Backward ? olderTimeline : undefined,
    };

    const getLatestTimeline = vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined));
    return {
      room,
      timelineSet,
      olderTimeline,
      targetTimeline,
      getLatestTimeline,
      mx: makeMx({
        getLatestTimeline,
        getEventTimeline: vi.fn<(set: unknown) => Promise<unknown>>((set) => {
          targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
          olderTimeline.getTimelineSet = () => set as FakeTimelineSet;
          return Promise.resolve(targetTimeline);
        }),
      }),
    };
  };

  it('backfills and jumps to a permalink target that is not in the loaded history', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const { result, scrollToBottom } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: fixture.mx,
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });

    expect(fixture.getLatestTimeline).not.toHaveBeenCalled();
    expect(fixture.targetTimeline.getTimelineSet()).not.toBe(
      fixture.room.getUnfilteredTimelineSet()
    );
    // The whole linked chain is adopted, not just the timeline holding the event.
    expect(result.current.timeline.linkedTimelines).toEqual([
      fixture.olderTimeline,
      fixture.targetTimeline,
    ]);
    expect(result.current.focusItem).toEqual({
      eventId: '$target:test',
      scrollTo: true,
      highlight: true,
    });
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('backfills a non-route jump target that is not in the loaded history', async () => {
    const fixture = setupUnloadedTarget('$reply:test');
    const { result } = renderSyncHook(fixture.room, {
      isAtBottom: false,
      mx: fixture.mx,
    });

    await act(async () => {
      await result.current.loadEventTimeline('$reply:test');
    });

    expect(result.current.timeline.linkedTimelines).toEqual([
      fixture.olderTimeline,
      fixture.targetTimeline,
    ]);
    expect(result.current.focusItem).toEqual({
      eventId: '$reply:test',
      scrollTo: true,
      highlight: true,
    });
  });

  it('keeps the newest result when the same target is loaded twice', async () => {
    const targetId = '$target:test';
    const fixture = setupUnloadedTarget(targetId);
    const newerTimeline = {
      ...createTimeline([{ getId: () => targetId }], fixture.timelineSet),
      getNeighbouringTimeline: () => undefined,
    };
    const resolvers: Array<(timeline: unknown) => void> = [];
    const jumpSets: unknown[] = [];
    const mx = makeMx({
      getEventTimeline: vi.fn<(set: unknown) => Promise<unknown>>((set) => {
        jumpSets.push(set);
        return new Promise((resolve) => resolvers.push(resolve));
      }),
      getLatestTimeline: fixture.getLatestTimeline,
    });
    const { result } = renderSyncHook(fixture.room, { isAtBottom: false, mx });

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    await act(async () => {
      first = result.current.loadEventTimeline(targetId);
      second = result.current.loadEventTimeline(targetId);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      newerTimeline.getTimelineSet = () => jumpSets[1] as FakeTimelineSet;
      resolvers[1]?.(newerTimeline);
      await second;
    });
    expect(result.current.timeline.linkedTimelines).toEqual([newerTimeline]);

    await act(async () => {
      fixture.targetTimeline.getTimelineSet = () => jumpSets[0] as FakeTimelineSet;
      resolvers[0]?.(fixture.targetTimeline);
      await first;
    });
    expect(result.current.timeline.linkedTimelines).toEqual([newerTimeline]);
  });

  it('fills context on both sides of the jump target before focusing it', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const paginateEventTimeline = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const mx = makeMx({
      getLatestTimeline: fixture.getLatestTimeline,
      paginateEventTimeline,
      getEventTimeline: vi.fn<(set: unknown) => Promise<unknown>>((set) => {
        fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
        return Promise.resolve(fixture.targetTimeline);
      }),
    });
    const { result } = renderSyncHook(fixture.room, { isAtBottom: false, mx });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });

    const directions = paginateEventTimeline.mock.calls.map(
      (call) => (call as unknown as [unknown, { backwards: boolean }])[1].backwards
    );
    expect(directions).toContain(true);
    expect(directions).toContain(false);
  });

  it('fails a jump rather than rendering a target without newer context', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const paginateEventTimeline = vi.fn<
      (timeline: unknown, options: { backwards: boolean }) => Promise<boolean>
    >((_timeline, { backwards }) =>
      backwards ? Promise.resolve(true) : Promise.reject(new Error('forward context failed'))
    );
    const { result, onJumpError } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: makeMx({
        getEventTimeline: vi.fn<(set: unknown) => Promise<unknown>>((set) => {
          fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
          return Promise.resolve(fixture.targetTimeline);
        }),
        paginateEventTimeline,
      }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });

    expect(result.current.focusItem).toBeUndefined();
    expect(result.current.jumpFailed).toBe(true);
    expect(onJumpError).toHaveBeenCalledOnce();
  });

  it('stays on the live chain only for the newest live event', async () => {
    const { room, timelineSet, timeline, events } = createRoom();
    events.length = 0;
    events.push({ getId: () => '$newest' });
    timelineSet.getTimelineForEvent = (eventId?: string) =>
      eventId === '$newest' ? timeline : undefined;
    const getEventTimeline = vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined));
    const { result } = renderSyncHook(room, {
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$newest');
    });

    expect(getEventTimeline).not.toHaveBeenCalled();
    expect(result.current.timeline.linkedTimelines).toEqual([timeline]);
    expect(result.current.focusItem).toMatchObject({ eventId: '$newest', scrollTo: true });
  });

  it('loads isolated context for a target that is not on the live chain', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>((set) => {
      fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
      return Promise.resolve(fixture.targetTimeline);
    });
    const { result } = renderSyncHook(fixture.room, {
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });

    expect(getEventTimeline).toHaveBeenCalledOnce();
    expect(getEventTimeline.mock.calls[0]?.[0]).not.toBe(fixture.room.getUnfilteredTimelineSet());
  });

  it('keeps a non-route jump window across a live timeline reset', async () => {
    const fixture = setupUnloadedTarget('$reply:test');
    const { result } = renderSyncHook(fixture.room, { isAtBottom: false, mx: fixture.mx });

    await act(async () => {
      await result.current.loadEventTimeline('$reply:test');
    });
    await act(async () => {
      fixture.timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toEqual([
      fixture.olderTimeline,
      fixture.targetTimeline,
    ]);
  });

  it('returns to the refreshed live snapshot when focused forward pagination is exhausted', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const replacementLive = createTimeline([{ getId: () => '$latest:test' }], fixture.timelineSet);
    const focusedTimeline = fixture.targetTimeline as unknown as {
      getPaginationToken: (direction: Direction) => string | undefined;
    };
    focusedTimeline.getPaginationToken = (direction: Direction) =>
      direction === Direction.Forward ? 'forward-token' : undefined;
    fixture.timelineSet.getLiveTimeline = () => replacementLive;
    const paginateEventTimeline = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const { result } = renderSyncHook(fixture.room, {
      isAtBottom: false,
      mx: {
        ...(fixture.mx as unknown as Record<string, unknown>),
        paginateEventTimeline,
      },
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });
    await act(async () => {
      await result.current.handleTimelinePagination(false);
    });

    expect(result.current.timeline.linkedTimelines).toEqual([replacementLive]);
    expect(result.current.liveTimelineLinked).toBe(true);
  });

  it('focus live invalidates a pending focused load', async () => {
    const { room, timeline } = createRoom();
    const focused = createTimeline([{ getId: () => '$target:test' }]);
    let resolveLoad: ((value: unknown) => void) | undefined;
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>(
      (set) =>
        new Promise((resolve) => {
          focused.getTimelineSet = () => set as FakeTimelineSet;
          resolveLoad = resolve;
        })
    );
    const { result } = renderSyncHook(room, {
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.loadEventTimeline('$target:test');
      await Promise.resolve();
      result.current.focusLiveTimeline();
      resolveLoad?.(focused);
      await pending;
    });

    expect(result.current.timeline.linkedTimelines).toEqual([timeline]);
    expect(result.current.focusItem).toBeUndefined();
  });

  it('does not restart an in-flight route focus when the live timeline resets', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    let resolveLoad: ((timeline: unknown) => void) | undefined;
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>(
      (set) =>
        new Promise((resolve) => {
          fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
          resolveLoad = resolve;
        })
    );
    const { result } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.loadEventTimeline('$target:test');
      await Promise.resolve();
      fixture.timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(getEventTimeline).toHaveBeenCalledOnce();

    await act(async () => {
      resolveLoad?.(fixture.targetTimeline);
      await pending;
    });

    expect(result.current.focusItem).toMatchObject({ eventId: '$target:test', scrollTo: true });
  });

  it('retries a route jump that failed once the timeline resets', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const getEventTimeline = vi
      .fn<(set: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementation((set) => {
        fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
        return Promise.resolve(fixture.targetTimeline);
      });
    const { result } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });
    expect(result.current.jumpFailed).toBe(true);

    await act(async () => {
      fixture.timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(getEventTimeline).toHaveBeenCalledTimes(2);
  });

  it('keeps a route jump window when a reset lands before the render commits', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>((set) => {
      fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
      fixture.olderTimeline.getTimelineSet = () => set as FakeTimelineSet;
      return Promise.resolve(fixture.targetTimeline);
    });
    const { result } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
      fixture.timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(getEventTimeline).toHaveBeenCalledOnce();
    expect(result.current.timeline.linkedTimelines).toEqual([
      fixture.olderTimeline,
      fixture.targetTimeline,
    ]);
  });

  it('re-resolves a route jump after a reset even when the old chain still maps it', async () => {
    const { room, timelineSet, timeline, events } = createRoom();
    events.length = 0;
    events.push({ getId: () => '$target' });
    timelineSet.getTimelineForEvent = (eventId?: string) =>
      eventId === '$target' ? timeline : undefined;
    const getEventTimeline = vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined));
    const { result } = renderSyncHook(room, {
      eventId: '$target',
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target');
    });
    expect(result.current.timeline.linkedTimelines).toEqual([timeline]);

    const replacement = createTimeline([{ getId: () => '$target' }], timelineSet);
    timelineSet.getLiveTimeline = () => replacement;
    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(result.current.timeline.linkedTimelines).toEqual([replacement]);
  });

  it('applies a live redaction to the event inside a displayed window', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const windowEvent = {
      getId: () => '$redacted:test',
      isRedacted: () => false,
      makeRedacted: vi.fn<() => void>(),
    };
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>((set) => {
      const focusedSet = set as FakeTimelineSet;
      focusedSet.findEventById = (eventId: string) =>
        eventId === '$redacted:test' ? windowEvent : undefined;
      fixture.targetTimeline.getTimelineSet = () => focusedSet;
      fixture.olderTimeline.getTimelineSet = () => focusedSet;
      return Promise.resolve(fixture.targetTimeline);
    });
    const { result } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });
    await act(async () => {
      fixture.room.emit(RoomEvent.Redaction, redactionOf('$redacted:test'), fixture.room);
      await Promise.resolve();
    });

    expect(windowEvent.makeRedacted).toHaveBeenCalledOnce();
  });

  it('leaves the room to redact its own set', async () => {
    const { room, timelineSet } = createRoom();
    const roomEvent = { isRedacted: () => false, makeRedacted: vi.fn<() => void>() };
    timelineSet.findEventById = () => roomEvent;
    const { result } = renderSyncHook(room);

    await act(async () => {
      room.emit(RoomEvent.Redaction, redactionOf('$redacted:test'), room);
      await Promise.resolve();
    });

    expect(result.current.liveTimelineLinked).toBe(true);
    expect(roomEvent.makeRedacted).not.toHaveBeenCalled();
  });

  it('keeps a displayed route jump window when the timeline resets', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const getEventTimeline = vi.fn<(set: unknown) => Promise<unknown>>((set) => {
      fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
      return Promise.resolve(fixture.targetTimeline);
    });
    const { result } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx: makeMx({ getEventTimeline }),
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });
    await act(async () => {
      fixture.timelineSet.emit(RoomEvent.TimelineReset);
      await Promise.resolve();
    });

    expect(getEventTimeline).toHaveBeenCalledOnce();
    expect(result.current.timeline.linkedTimelines).toEqual([
      fixture.olderTimeline,
      fixture.targetTimeline,
    ]);
  });

  it('ignores a pending result after local navigation cancels it', async () => {
    const targetId = '$target:test';
    const fixture = setupUnloadedTarget(targetId);
    let resolveJump: ((timeline: unknown) => void) | undefined;
    const mx = makeMx({
      getLatestTimeline: fixture.getLatestTimeline,
      getEventTimeline: vi.fn<() => Promise<unknown>>(
        () => new Promise((resolve) => (resolveJump = resolve))
      ),
    });
    const { result } = renderSyncHook(fixture.room, { isAtBottom: false, mx });

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.loadEventTimeline(targetId);
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.cancelEventTimelineLoad());
    await act(async () => {
      resolveJump?.(fixture.targetTimeline);
      await pending;
    });

    expect(result.current.timeline.linkedTimelines).not.toContain(fixture.targetTimeline);
    expect(result.current.focusItem).toBeUndefined();
  });

  it('rejects a thread timeline instead of installing it as the room timeline', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const otherSet = new EventEmitter() as FakeTimelineSet;
    const threadTimeline = {
      ...createTimeline([{ getId: () => '$target:test' }], otherSet),
      getNeighbouringTimeline: () => undefined,
    };
    const mx = makeMx({
      getLatestTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
      getEventTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(threadTimeline)),
    });
    const { result, scrollToBottom } = renderSyncHook(fixture.room, {
      eventId: '$target:test',
      isAtBottom: false,
      mx,
    });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });

    expect(result.current.timeline.linkedTimelines).not.toContain(threadTimeline);
    expect(result.current.focusItem).toBeUndefined();
    expect(result.current.jumpFailed).toBe(true);
    expect(scrollToBottom).toHaveBeenCalledWith('instant');
  });

  it('reports a failed jump so the timeline can still be revealed', async () => {
    const { room } = createRoom();
    const mx = makeMx({
      getLatestTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
      getEventTimeline: vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error('nope'))),
    });
    const { result, onJumpError } = renderSyncHook(room, {
      eventId: '$gone:test',
      isAtBottom: false,
      mx,
    });

    expect(result.current.jumpFailed).toBe(false);

    await act(async () => {
      await result.current.loadEventTimeline('$gone:test');
    });

    expect(result.current.jumpFailed).toBe(true);
    expect(onJumpError).toHaveBeenCalled();
  });

  it('does not report a stale failure for a different jump target', async () => {
    const { room } = createRoom();
    const mx = makeMx({
      getLatestTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
      getEventTimeline: vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error('nope'))),
    });
    const { result, rerender } = renderSyncHook(room, {
      eventId: '$gone:test',
      isAtBottom: false,
      mx,
    });

    await act(async () => {
      await result.current.loadEventTimeline('$gone:test');
    });
    expect(result.current.jumpFailed).toBe(true);

    rerender({ eventId: '$other:test', isAtBottom: false });
    expect(result.current.jumpFailed).toBe(false);
  });

  it('ignores a jump failure for a target that is no longer current', async () => {
    const { room } = createRoom();
    let rejectJump: ((error: Error) => void) | undefined;
    const mx = makeMx({
      getLatestTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
      getEventTimeline: vi.fn<() => Promise<unknown>>(
        () =>
          new Promise((_resolve, reject) => {
            rejectJump = reject;
          })
      ),
    });
    const { result, rerender, scrollToBottom } = renderSyncHook(room, {
      eventId: '$a:test',
      isAtBottom: false,
      mx,
    });

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.loadEventTimeline('$a:test');
      await Promise.resolve();
    });

    rerender({ eventId: '$b:test', isAtBottom: false });
    await act(async () => {
      rejectJump?.(new Error('nope'));
      await pending;
    });

    expect(result.current.jumpFailed).toBe(false);
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('jumps without highlighting when the target is the read marker itself', async () => {
    const fixture = setupUnloadedTarget('$read:test');
    const { result } = renderSyncHook(fixture.room, {
      eventId: '$read:test',
      isAtBottom: false,
      mx: fixture.mx,
      readUptoEventId: '$read:test',
    });

    await act(async () => {
      await result.current.loadEventTimeline('$read:test');
    });

    expect(result.current.focusItem).toEqual({
      eventId: '$read:test',
      scrollTo: true,
      highlight: false,
    });
  });

  it('keeps a permalink context window when sliding sync resets the live timeline', async () => {
    const fixture = setupUnloadedTarget('$target:test');
    const { result } = renderSyncHook(fixture.room, { isAtBottom: false, mx: fixture.mx });

    await act(async () => {
      await result.current.loadEventTimeline('$target:test');
    });
    const contextTimeline = result.current.timeline;
    const timelineSet = fixture.room.getUnfilteredTimelineSet();

    await act(async () => {
      timelineSet.emit(RoomEvent.TimelineReset, undefined, timelineSet, true);
      await Promise.resolve();
    });

    expect(result.current.timeline).toBe(contextTimeline);
    expect(result.current.focusItem).toEqual({
      eventId: '$target:test',
      scrollTo: true,
      highlight: true,
    });
  });

  it('falls back to the initial timeline when a jump load times out', async () => {
    vi.useFakeTimers();
    try {
      const { room } = createRoom();
      const mx = makeMx({
        roomInitialSync: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
        getLatestTimeline: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
        // The homeserver never answers /context: hit the 12 s timeout.
        getEventTimeline: () => new Promise(() => {}),
      });
      const { result, scrollToBottom } = renderSyncHook(room, {
        eventId: '$missing:test',
        isAtBottom: false,
        mx,
      });

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

  it('times out when jump context pagination never settles', async () => {
    vi.useFakeTimers();
    try {
      const fixture = setupUnloadedTarget('$target:test');
      const paginateEventTimeline = vi.fn<() => Promise<boolean>>(() => new Promise(() => {}));
      const { result, onJumpError, scrollToBottom } = renderSyncHook(fixture.room, {
        eventId: '$target:test',
        isAtBottom: false,
        mx: makeMx({
          getEventTimeline: vi.fn<(set: unknown) => Promise<unknown>>((set) => {
            fixture.targetTimeline.getTimelineSet = () => set as FakeTimelineSet;
            return Promise.resolve(fixture.targetTimeline);
          }),
          paginateEventTimeline,
        }),
      });

      act(() => {
        void result.current.loadEventTimeline('$target:test');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(13_000);
      });

      expect(paginateEventTimeline).toHaveBeenCalledTimes(2);
      expect(onJumpError).toHaveBeenCalledOnce();
      expect(scrollToBottom).toHaveBeenCalledWith('instant');
      expect(result.current.jumpFailed).toBe(true);
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
      mx: makeMx({ paginateEventTimeline }),
    });

    expect(result.current.eventsLength).toBe(1);

    // A sliding sync limited response re-linked the chain server-side: the
    // live timeline now has a forward neighbour we never saw.
    const second = {
      getEvents: () => [{}],
      getPaginationToken: () => undefined as string | undefined,
      getRoomId: () => room.roomId,
      getTimelineSet: () => timelineSet,
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
            mx: makeMx({ paginateEventTimeline }),
            isAtBottom: false,
            isAtBottomRef: { current: false },
            scrollToBottom,
            unreadInfo: undefined,
            setUnreadInfo: vi.fn<() => void>(),
            hideReadsRef: { current: false },
            readUptoEventIdRef: { current: undefined },
            isInactivePanelRef: { current: false },
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

const flushFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
};

describe('decryption refresh coalescing', () => {
  const renderTrackingHook = (room: FakeRoom) => {
    const seen: number[] = [];
    renderHook(() => {
      const sync = useTimelineSync({
        room: room as Room,
        mx: makeMx(),
        isAtBottom: true,
        isAtBottomRef: { current: true },
        scrollToBottom: vi.fn<() => void>(),
        unreadInfo: undefined,
        setUnreadInfo: vi.fn<() => void>(),
        hideReadsRef: { current: false },
        readUptoEventIdRef: { current: undefined },
        isInactivePanelRef: { current: false },
      });
      if (!seen.includes(sync.timelineVersion)) seen.push(sync.timelineVersion);
      return sync;
    });
    return seen;
  };

  // One act() per event mirrors decryptions landing in separate tasks.
  const emitDecryptedAcrossTasks = async (room: FakeRoom, eventCount: number) => {
    for (let i = 0; i < eventCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        mxEmitter.emit(MatrixEventEvent.Decrypted, { getRoomId: () => room.roomId });
      });
    }
  };

  it('collapses a backlog decryption burst into a single timeline update', async () => {
    const { room } = createRoom();
    const seen = renderTrackingHook(room);
    const initial = seen.length;

    await emitDecryptedAcrossTasks(room, 25);
    await flushFrame();

    // Uncoalesced this is 25. A frame boundary may split the burst, so allow a small range.
    expect(seen.length - initial).toBeGreaterThan(0);
    expect(seen.length - initial).toBeLessThan(5);
  });

  it('re-arms for the next burst', async () => {
    const { room } = createRoom();
    const seen = renderTrackingHook(room);
    const initial = seen.length;

    await emitDecryptedAcrossTasks(room, 5);
    await flushFrame();
    const afterFirstBurst = seen.length;
    await emitDecryptedAcrossTasks(room, 5);
    await flushFrame();

    expect(afterFirstBurst).toBeGreaterThan(initial);
    expect(seen.length).toBeGreaterThan(afterFirstBurst);
  });

  it('ignores decryption bursts from another room', async () => {
    const { room } = createRoom();
    const seen = renderTrackingHook(room);
    const initial = seen.length;

    await act(async () => {
      mxEmitter.emit(MatrixEventEvent.Decrypted, { getRoomId: () => '!other:test' });
    });
    await flushFrame();

    expect(seen.length).toBe(initial);
  });
});
