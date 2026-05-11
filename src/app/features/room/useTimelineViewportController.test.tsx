import type { MutableRefObject, RefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import type { VListHandle } from 'virtua';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useTimelineSync } from '$hooks/timeline/useTimelineSync';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import { useTimelineViewportController } from './useTimelineViewportController';

type TimelineSyncController = ReturnType<typeof useTimelineSync>;

const nativeRequestAnimationFrame = globalThis.requestAnimationFrame;
const nativeCancelAnimationFrame = globalThis.cancelAnimationFrame;
const noop = () => {};

const createVList = (): VListHandle =>
  ({
    scrollOffset: 0,
    scrollSize: 3000,
    viewportSize: 800,
    scrollTo: vi.fn<(offset: number) => void>(),
    scrollBy: vi.fn<(offset: number) => void>(),
    scrollToIndex: vi.fn<(index: number, options?: { align?: string }) => void>(),
  }) as unknown as VListHandle;

const createProcessedEvent = (id: string, itemIndex: number): ProcessedEvent =>
  ({
    id,
    itemIndex,
    mEvent: { getId: () => id },
    timelineSet: {},
    eventSender: null,
    collapsed: false,
    willRenderNewDivider: false,
    willRenderDayDivider: false,
  }) as unknown as ProcessedEvent;

const createTimelineSync = (
  overrides: Partial<TimelineSyncController> = {}
): TimelineSyncController =>
  ({
    timeline: { linkedTimelines: [] },
    setTimeline: vi.fn<(next: unknown) => void>(),
    eventsLength: 2,
    liveTimelineLinked: true,
    canPaginateBack: true,
    backwardStatus: 'idle',
    forwardStatus: 'idle',
    handleTimelinePagination: vi.fn<(backward: boolean) => void>(),
    loadEventTimeline: vi.fn<(eventId: string) => Promise<void>>(() => Promise.resolve()),
    focusItem: undefined,
    setFocusItem: vi.fn<(next: unknown) => void>(),
    ...overrides,
  }) as unknown as TimelineSyncController;

const createRefs = (vList = createVList()) => {
  const processedEventsRef: MutableRefObject<ProcessedEvent[]> = {
    current: [createProcessedEvent('$a', 0), createProcessedEvent('$b', 1)],
  };

  return {
    vList,
    vListRef: { current: vList } as RefObject<VListHandle>,
    messageListRef: { current: document.createElement('div') } as RefObject<HTMLDivElement>,
    processedEventsRef,
    atBottomRef: { current: true },
  };
};

const createEmptyProcessedRefs = (vList = createVList()) => {
  const processedEventsRef: MutableRefObject<ProcessedEvent[]> = {
    current: [],
  };

  return {
    vList,
    vListRef: { current: vList } as RefObject<VListHandle>,
    messageListRef: { current: document.createElement('div') } as RefObject<HTMLDivElement>,
    processedEventsRef,
    atBottomRef: { current: true },
  };
};

const renderController = ({
  eventId,
  timelineSync = createTimelineSync(),
  refs = createRefs(),
  setAtBottom = vi.fn<(val: boolean) => void>((val: boolean) => {
    refs.atBottomRef.current = val;
  }),
}: {
  eventId?: string;
  timelineSync?: TimelineSyncController;
  refs?: ReturnType<typeof createRefs>;
  setAtBottom?: (val: boolean) => void;
} = {}) => {
  const timelineSyncRef: MutableRefObject<TimelineSyncController> = { current: timelineSync };
  const indexByRaw = new Map(
    refs.processedEventsRef.current.map((event, index) => [event.itemIndex, index])
  );

  const hook = renderHook(
    ({ sync, roomEventId }: { sync: TimelineSyncController; roomEventId?: string }) => {
      timelineSyncRef.current = sync;
      return useTimelineViewportController({
        roomId: '!room:test',
        eventId: roomEventId,
        timelineSync: sync,
        timelineSyncRef,
        vListRef: refs.vListRef,
        messageListRef: refs.messageListRef,
        processedEventsRef: refs.processedEventsRef,
        atBottomRef: refs.atBottomRef,
        setAtBottom,
        getRawIndexToProcessedIndex: (rawIndex) => indexByRaw.get(rawIndex),
      });
    },
    { initialProps: { sync: timelineSync, roomEventId: eventId } }
  );

  return { ...hook, refs, setAtBottom, timelineSyncRef };
};

describe('useTimelineViewportController', () => {
  beforeEach(() => {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn<
      (id: number) => void
    >() as unknown as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = nativeRequestAnimationFrame;
    globalThis.cancelAnimationFrame = nativeCancelAnimationFrame;
    vi.useRealTimers();
  });

  it('lands the initial live timeline at the latest event and reveals the viewport', () => {
    const { result, refs } = renderController();

    expect(refs.vList.scrollToIndex).toHaveBeenCalledWith(1, { align: 'end' });
    expect(refs.vList.scrollTo).toHaveBeenCalledWith(refs.vList.scrollSize);
    expect(result.current.isReady).toBe(true);
  });

  it('re-anchors to latest when first renderable rows appear after an all-state initial slice', () => {
    const refs = createEmptyProcessedRefs();
    const timelineSync = createTimelineSync({ eventsLength: 20 });
    const { rerender } = renderController({ timelineSync, refs });

    expect(refs.vList.scrollToIndex).not.toHaveBeenCalled();
    expect(refs.vList.scrollTo).toHaveBeenCalledWith(refs.vList.scrollSize);

    refs.processedEventsRef.current = [
      createProcessedEvent('$x', 10),
      createProcessedEvent('$y', 11),
    ];

    rerender({ sync: timelineSync, roomEventId: undefined });

    expect(refs.vList.scrollToIndex).toHaveBeenCalledWith(1, { align: 'end' });
  });

  it('delays viewport reveal while bootstrap prefill is in progress for underfilled rooms', () => {
    const vList = createVList() as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
      scrollTo: ReturnType<typeof vi.fn>;
      scrollBy: ReturnType<typeof vi.fn>;
      scrollToIndex: ReturnType<typeof vi.fn>;
    };
    vList.scrollSize = 800;
    vList.viewportSize = 800;
    const refs = createRefs(vList as unknown as VListHandle);
    const timelineSync = createTimelineSync({ canPaginateBack: true, backwardStatus: 'idle' });

    const { result } = renderController({ timelineSync, refs });

    expect(result.current.isReady).toBe(false);
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('does not trigger ready fallback timeout while bootstrap reveal is gated', () => {
    vi.useFakeTimers();
    const vList = createVList() as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    vList.scrollSize = 700;
    vList.viewportSize = 700;
    const refs = createRefs(vList as unknown as VListHandle);
    const timelineSync = createTimelineSync({ canPaginateBack: true, backwardStatus: 'idle' });

    const { result } = renderController({ timelineSync, refs });
    expect(result.current.isReady).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isReady).toBe(false);
  });

  it('waits for a measured viewport before bootstrap reveal or backfill', () => {
    const vList = createVList() as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    vList.scrollSize = 120;
    vList.viewportSize = 0;
    const refs = createRefs(vList as unknown as VListHandle);
    const timelineSync = createTimelineSync({ canPaginateBack: true, backwardStatus: 'idle' });

    const { result } = renderController({ timelineSync, refs });

    expect(result.current.isReady).toBe(false);
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('paginates older history at the top edge', () => {
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync });

    act(() => {
      result.current.markUserScrollIntent();
    });
    act(() => {
      result.current.handleVListScroll(300);
    });
    act(() => {
      result.current.handleVListScroll(120);
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('paginates older history from user input while already clamped at the top edge', () => {
    const refs = createRefs();
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync, refs });
    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollOffset = 0;
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    act(() => {
      result.current.handleVListScroll(0);
    });
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();

    act(() => {
      result.current.markUserScrollIntent('backward');
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('keeps bottom anchor pinned during loading-driven offset shifts', () => {
    const refs = createRefs();
    const setAtBottom = vi.fn<(val: boolean) => void>((val: boolean) => {
      refs.atBottomRef.current = val;
    });
    const timelineSync = createTimelineSync();
    const { result, rerender } = renderController({ timelineSync, refs, setAtBottom });
    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };

    mutableVList.scrollOffset = 2200;
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    act(() => {
      result.current.handleVListScroll(2200);
    });

    const loadingTimelineSync = createTimelineSync({
      ...timelineSync,
      backwardStatus: 'loading',
    });
    rerender({ sync: loadingTimelineSync, roomEventId: undefined });
    setAtBottom.mockClear();

    mutableVList.scrollOffset = 1900;
    act(() => {
      result.current.handleVListScroll(1900);
    });

    expect(loadingTimelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('releases bottom anchor on an intentional upward scroll when idle', () => {
    const refs = createRefs();
    const setAtBottom = vi.fn<(val: boolean) => void>((val: boolean) => {
      refs.atBottomRef.current = val;
    });
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync, refs, setAtBottom });
    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };

    mutableVList.scrollOffset = 2200;
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    act(() => {
      result.current.handleVListScroll(2200);
    });

    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 1900;
    act(() => {
      result.current.handleVListScroll(1900);
    });

    expect(setAtBottom).toHaveBeenCalledWith(false);
  });

  it('does not release bottom anchor before any user scroll intent', () => {
    const refs = createRefs();
    const setAtBottom = vi.fn<(val: boolean) => void>((val: boolean) => {
      refs.atBottomRef.current = val;
    });
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync, refs, setAtBottom });
    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };

    mutableVList.scrollOffset = 2200;
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    act(() => {
      result.current.handleVListScroll(2200);
    });

    setAtBottom.mockClear();
    mutableVList.scrollOffset = 1900;
    act(() => {
      result.current.handleVListScroll(1900);
    });

    expect(setAtBottom).not.toHaveBeenCalledWith(false);
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('does not paginate while an event jump is still loading', () => {
    let resolveLoad: () => void = noop;
    const timelineSync = createTimelineSync({
      loadEventTimeline: vi.fn<(eventId: string) => Promise<void>>(
        () =>
          new Promise<void>((resolve) => {
            resolveLoad = resolve;
          })
      ),
    });
    const { result } = renderController({ eventId: '$target', timelineSync });

    act(() => {
      result.current.handleVListScroll(120);
    });

    expect(timelineSync.loadEventTimeline).toHaveBeenCalledWith('$target');
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();

    act(() => {
      resolveLoad();
    });
  });

  it('centers a loaded focus item and consumes the scroll intent', () => {
    const setFocusItem = vi.fn<(next: unknown) => void>();
    const timelineSync = createTimelineSync({
      focusItem: { index: 1, scrollTo: true, highlight: true },
      setFocusItem,
    });
    const { refs } = renderController({ timelineSync });

    expect(refs.vList.scrollToIndex).toHaveBeenCalledWith(1, { align: 'center' });
    expect(setFocusItem).toHaveBeenCalledWith(expect.any(Function));

    const updater = setFocusItem.mock.calls[0]?.[0] as (
      prev: typeof timelineSync.focusItem
    ) => typeof timelineSync.focusItem;
    expect(updater(timelineSync.focusItem)).toEqual({ index: 1, scrollTo: false, highlight: true });
  });

  it('blocks the programmatic landing scroll after a jump focus item has landed', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, refs, rerender } = renderController({ timelineSync });
    const landedTimelineSync = createTimelineSync({
      ...timelineSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });

    rerender({ sync: landedTimelineSync, roomEventId: undefined });

    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollOffset = 2200;
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    act(() => {
      result.current.handleVListScroll(2200);
    });

    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('allows edge pagination after the user scrolls away from a landed jump', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, refs, rerender } = renderController({ timelineSync });
    const landedTimelineSync = createTimelineSync({
      ...timelineSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });

    rerender({ sync: landedTimelineSync, roomEventId: undefined });

    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollOffset = 2200;
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    act(() => {
      result.current.handleVListScroll(2200);
    });
    act(() => {
      result.current.markUserScrollIntent();
    });
    act(() => {
      result.current.handleVListScroll(2260);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });

  it('paginates forward from user input while already clamped at the bottom edge', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
    });
    const { result, refs } = renderController({ timelineSync });
    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;
    mutableVList.scrollOffset = 2200;

    act(() => {
      result.current.handleVListScroll(2200);
    });
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();

    act(() => {
      result.current.markUserScrollIntent('forward');
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });

  it('does not repeat forward pagination from layout scrolls after a landed jump', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, refs, rerender } = renderController({ timelineSync });
    const landedTimelineSync = createTimelineSync({
      ...timelineSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });

    rerender({ sync: landedTimelineSync, roomEventId: undefined });

    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;
    mutableVList.scrollOffset = 2200;

    act(() => {
      result.current.handleVListScroll(2200);
    });
    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 2260;
    act(() => {
      result.current.handleVListScroll(2260);
    });
    mutableVList.scrollOffset = 2280;
    act(() => {
      result.current.handleVListScroll(2280);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 2290;
    act(() => {
      result.current.handleVListScroll(2290);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(2);
  });

  it('does not repeat backward pagination from layout scrolls after a landed jump', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, refs, rerender } = renderController({ timelineSync });
    const landedTimelineSync = createTimelineSync({
      ...timelineSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });

    rerender({ sync: landedTimelineSync, roomEventId: undefined });

    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;
    mutableVList.scrollOffset = 700;

    act(() => {
      result.current.handleVListScroll(700);
    });
    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 120;
    act(() => {
      result.current.handleVListScroll(120);
    });
    mutableVList.scrollOffset = 80;
    act(() => {
      result.current.handleVListScroll(80);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);

    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 60;
    act(() => {
      result.current.handleVListScroll(60);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(2);
  });

  it('continues forward pagination after leaving and returning to the bottom edge', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, refs, rerender } = renderController({ timelineSync });
    const landedTimelineSync = createTimelineSync({
      ...timelineSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });

    rerender({ sync: landedTimelineSync, roomEventId: undefined });

    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    mutableVList.scrollOffset = 2200;
    act(() => {
      result.current.handleVListScroll(2200);
    });
    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 2260;
    act(() => {
      result.current.handleVListScroll(2260);
    });
    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);

    mutableVList.scrollOffset = 1200;
    act(() => {
      result.current.handleVListScroll(1200);
    });
    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 2260;
    act(() => {
      result.current.handleVListScroll(2260);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(2);
  });

  it('rearms forward pagination after a forward page settles while staying near bottom', () => {
    const timelineSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
      forwardStatus: 'idle',
    });
    const { result, refs, rerender } = renderController({ timelineSync });
    const landedTimelineSync = createTimelineSync({
      ...timelineSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
      forwardStatus: 'idle',
    });

    rerender({ sync: landedTimelineSync, roomEventId: undefined });

    const mutableVList = refs.vList as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    mutableVList.scrollSize = 3000;
    mutableVList.viewportSize = 800;

    mutableVList.scrollOffset = 2200;
    act(() => {
      result.current.handleVListScroll(2200);
    });
    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 2260;
    act(() => {
      result.current.handleVListScroll(2260);
    });
    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);

    const forwardLoadingSync = createTimelineSync({
      ...landedTimelineSync,
      forwardStatus: 'loading',
    });
    rerender({ sync: forwardLoadingSync, roomEventId: undefined });
    const forwardIdleSync = createTimelineSync({
      ...landedTimelineSync,
      forwardStatus: 'idle',
    });
    rerender({ sync: forwardIdleSync, roomEventId: undefined });

    act(() => {
      result.current.markUserScrollIntent();
    });
    mutableVList.scrollOffset = 2290;
    act(() => {
      result.current.handleVListScroll(2290);
    });

    expect(forwardIdleSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });
});
