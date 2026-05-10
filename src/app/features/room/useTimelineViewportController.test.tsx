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

const createVList = (): VListHandle =>
  ({
    scrollOffset: 0,
    scrollSize: 3000,
    viewportSize: 800,
    scrollTo: vi.fn(),
    scrollBy: vi.fn(),
    scrollToIndex: vi.fn(),
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
    setTimeline: vi.fn(),
    eventsLength: 2,
    liveTimelineLinked: true,
    canPaginateBack: true,
    backwardStatus: 'idle',
    forwardStatus: 'idle',
    handleTimelinePagination: vi.fn(),
    loadEventTimeline: vi.fn(() => Promise.resolve()),
    focusItem: undefined,
    setFocusItem: vi.fn(),
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

const renderController = ({
  eventId,
  timelineSync = createTimelineSync(),
  refs = createRefs(),
  setAtBottom = vi.fn((val: boolean) => {
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
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof globalThis.cancelAnimationFrame;
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

  it('paginates older history at the top edge', () => {
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync });

    act(() => {
      result.current.handleVListScroll(300);
    });
    act(() => {
      result.current.handleVListScroll(120);
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('does not paginate while an event jump is still loading', () => {
    let resolveLoad: () => void = () => {};
    const timelineSync = createTimelineSync({
      loadEventTimeline: vi.fn(
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
    const setFocusItem = vi.fn();
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
      result.current.handleVListScroll(2260);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });

  it('does not keep paginating forward when a new page lands near the bottom edge', () => {
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
      result.current.handleVListScroll(2260);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleVListScroll(2270);
    });
    act(() => {
      result.current.handleVListScroll(2280);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
  });

  it('rearams forward pagination only after leaving the bottom edge', () => {
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
    mutableVList.scrollOffset = 2260;
    act(() => {
      result.current.handleVListScroll(2260);
    });
    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);

    mutableVList.scrollOffset = 1200;
    act(() => {
      result.current.handleVListScroll(1200);
    });
    mutableVList.scrollOffset = 2260;
    act(() => {
      result.current.handleVListScroll(2260);
    });

    expect(landedTimelineSync.handleTimelinePagination).toHaveBeenCalledTimes(2);
  });
});
