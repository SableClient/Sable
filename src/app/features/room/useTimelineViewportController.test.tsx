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
    findItemIndex: vi.fn<(offset: number) => number>((offset) =>
      Math.max(0, Math.min(29, Math.floor(offset / 100)))
    ),
    getItemOffset: vi.fn<(index: number) => number>((index) => index * 100),
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

const createProcessedEvents = (count: number): ProcessedEvent[] =>
  Array.from({ length: count }, (_, index) => createProcessedEvent(`$${index}`, index));

const createTimelineSync = (
  overrides: Partial<TimelineSyncController> = {}
): TimelineSyncController =>
  ({
    timeline: { linkedTimelines: [] },
    setTimeline: vi.fn<(next: unknown) => void>(),
    eventsLength: 3,
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
    current: [
      createProcessedEvent('$a', 0),
      createProcessedEvent('$b', 1),
      createProcessedEvent('$c', 2),
    ],
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
  const refs = createRefs(vList);
  refs.processedEventsRef.current = [];
  return refs;
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
        getRawIndexToProcessedIndex: (rawIndex) => {
          const index = refs.processedEventsRef.current.findIndex(
            (event) => event.itemIndex === rawIndex
          );
          return index < 0 ? undefined : index;
        },
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

    expect(refs.vList.scrollToIndex).toHaveBeenCalledWith(2, { align: 'end' });
    expect(refs.vList.scrollTo).toHaveBeenCalledWith(refs.vList.scrollSize);
    expect(result.current.isReady).toBe(true);
  });

  it('re-anchors to latest when renderable rows appear after an all-state initial slice', () => {
    const refs = createEmptyProcessedRefs();
    const timelineSync = createTimelineSync({ eventsLength: 20 });
    const { rerender, refs: renderedRefs } = renderController({ timelineSync, refs });

    expect(renderedRefs.vList.scrollToIndex).not.toHaveBeenCalled();
    expect(renderedRefs.vList.scrollTo).toHaveBeenCalledWith(renderedRefs.vList.scrollSize);

    refs.processedEventsRef.current = [
      createProcessedEvent('$x', 10),
      createProcessedEvent('$y', 11),
    ];

    rerender({ sync: timelineSync, roomEventId: undefined });

    expect(renderedRefs.vList.scrollToIndex).toHaveBeenCalledWith(1, { align: 'end' });
  });

  it('keeps underfilled live rooms hidden while bootstrap prefill starts', () => {
    const vList = createVList() as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    vList.scrollSize = 200;
    vList.viewportSize = 800;
    const refs = createRefs(vList as unknown as VListHandle);
    const timelineSync = createTimelineSync({ canPaginateBack: true, backwardStatus: 'idle' });

    const { result } = renderController({ timelineSync, refs });

    expect(result.current.isReady).toBe(false);
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('reveals an initially underfilled live room once bootstrap prefill fills the viewport', () => {
    const vList = createVList() as unknown as {
      scrollOffset: number;
      scrollSize: number;
      viewportSize: number;
    };
    vList.scrollSize = 200;
    vList.viewportSize = 800;
    const refs = createRefs(vList as unknown as VListHandle);
    const timelineSync = createTimelineSync({ canPaginateBack: true, backwardStatus: 'idle' });

    const { result, rerender } = renderController({ timelineSync, refs });
    expect(result.current.isReady).toBe(false);

    const loadingSync = createTimelineSync({
      ...timelineSync,
      backwardStatus: 'loading',
    });
    rerender({ sync: loadingSync, roomEventId: undefined });

    vList.scrollSize = 1500;
    const idleSync = createTimelineSync({
      ...timelineSync,
      backwardStatus: 'idle',
      eventsLength: 10,
    });
    rerender({ sync: idleSync, roomEventId: undefined });

    expect(result.current.isReady).toBe(true);
  });

  it('does not paginate from layout-only scroll changes', () => {
    const refs = createRefs();
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync, refs });

    vi.mocked(timelineSync.handleTimelinePagination).mockClear();
    act(() => {
      result.current.handleVListScroll(0);
    });

    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('treats the live timeline as bottom when the latest row is visible', () => {
    const refs = createRefs();
    refs.atBottomRef.current = false;
    refs.processedEventsRef.current = createProcessedEvents(30);
    const setAtBottom = vi.fn<(val: boolean) => void>((val) => {
      refs.atBottomRef.current = val;
    });
    const timelineSync = createTimelineSync({ eventsLength: 30, liveTimelineLinked: true });
    const { result } = renderController({ timelineSync, refs, setAtBottom });
    refs.atBottomRef.current = false;
    setAtBottom.mockClear();

    act(() => {
      result.current.handleVListScroll(2101);
    });

    expect(setAtBottom).toHaveBeenCalledWith(true);
  });

  it('paginates older history when the user scrolls at the start edge', () => {
    const refs = createRefs();
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync, refs });

    act(() => {
      result.current.markUserScrollIntent('backward');
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('paginates newer history when a detached jump window reaches the end edge', () => {
    const refs = createRefs();
    const mutableVList = refs.vList as unknown as { scrollOffset: number };
    mutableVList.scrollOffset = 2200;
    const timelineSync = createTimelineSync({ liveTimelineLinked: false });
    const { result } = renderController({ timelineSync, refs });

    act(() => {
      result.current.markUserScrollIntent('forward');
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });

  it('requests one page per edge crossing from scroll events', () => {
    const refs = createRefs();
    const mutableVList = refs.vList as unknown as { scrollOffset: number };
    mutableVList.scrollOffset = 1200;
    const timelineSync = createTimelineSync({ liveTimelineLinked: false });
    const { result } = renderController({ timelineSync, refs });

    act(() => {
      result.current.markUserScrollIntent('forward');
    });
    mutableVList.scrollOffset = 2200;
    act(() => {
      result.current.handleVListScroll(2200);
    });
    act(() => {
      result.current.handleVListScroll(2200);
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });

  it('paginates as soon as scrolling lands on the start edge', () => {
    const refs = createRefs();
    const mutableVList = refs.vList as unknown as { scrollOffset: number };
    mutableVList.scrollOffset = 1200;
    const timelineSync = createTimelineSync();
    const { result } = renderController({ timelineSync, refs });

    vi.mocked(timelineSync.handleTimelinePagination).mockClear();
    act(() => {
      result.current.handleVListScroll(1200);
    });
    mutableVList.scrollOffset = 0;
    act(() => {
      result.current.handleVListScroll(0);
    });

    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('does not treat a programmatic jump landing as edge pagination', () => {
    const refs = createRefs();
    const mutableVList = refs.vList as unknown as { scrollOffset: number };
    mutableVList.scrollOffset = 1200;
    const initialSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, rerender } = renderController({ timelineSync: initialSync, refs });
    const landedSync = createTimelineSync({
      ...initialSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });
    rerender({ sync: landedSync, roomEventId: undefined });

    vi.mocked(landedSync.handleTimelinePagination).mockClear();
    act(() => {
      result.current.handleVListScroll(1200);
    });
    mutableVList.scrollOffset = 2200;
    act(() => {
      result.current.handleVListScroll(2200);
    });

    expect(landedSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('queues one additional page while loading if the user keeps scrolling at an edge', () => {
    const refs = createRefs();
    const loadingSync = createTimelineSync({ backwardStatus: 'loading' });
    const { result, rerender } = renderController({ timelineSync: loadingSync, refs });

    act(() => {
      result.current.markUserScrollIntent('backward');
    });
    expect(loadingSync.handleTimelinePagination).not.toHaveBeenCalled();

    const idleSync = createTimelineSync({ ...loadingSync, backwardStatus: 'idle' });
    rerender({ sync: idleSync, roomEventId: undefined });

    expect(idleSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
    expect(idleSync.handleTimelinePagination).toHaveBeenCalledWith(true);
  });

  it('rearms edge pagination after a page settles at the same edge', () => {
    const refs = createRefs();
    const timelineSync = createTimelineSync({ backwardStatus: 'idle' });
    const { result, rerender } = renderController({ timelineSync, refs });

    act(() => {
      result.current.markUserScrollIntent('backward');
    });
    expect(timelineSync.handleTimelinePagination).toHaveBeenCalledTimes(1);

    const loadingSync = createTimelineSync({
      ...timelineSync,
      backwardStatus: 'loading',
    });
    rerender({ sync: loadingSync, roomEventId: undefined });

    const settledSync = createTimelineSync({
      ...timelineSync,
      backwardStatus: 'idle',
    });
    rerender({ sync: settledSync, roomEventId: undefined });

    act(() => {
      result.current.markUserScrollIntent('backward');
    });

    expect(settledSync.handleTimelinePagination).toHaveBeenCalledTimes(2);
    expect(settledSync.handleTimelinePagination).toHaveBeenLastCalledWith(true);
  });

  it('enables virtua shift only while backward pagination loads away from bottom', () => {
    const refs = createRefs();
    refs.atBottomRef.current = false;
    const idleSync = createTimelineSync();
    const { result, rerender } = renderController({ timelineSync: idleSync, refs });
    refs.atBottomRef.current = false;

    const loadingSync = createTimelineSync({ ...idleSync, backwardStatus: 'loading' });
    rerender({ sync: loadingSync, roomEventId: undefined });
    expect(result.current.shift).toBe(true);

    const settledSync = createTimelineSync({ ...idleSync, backwardStatus: 'idle' });
    rerender({ sync: settledSync, roomEventId: undefined });
    expect(result.current.shift).toBe(false);
  });

  it('centers a loaded focus item and releases bottom following', () => {
    const setAtBottom = vi.fn<(val: boolean) => void>();
    const setFocusItem = vi.fn<(next: unknown) => void>();
    const timelineSync = createTimelineSync({
      focusItem: { index: 1, scrollTo: true, highlight: true },
      setFocusItem,
    });
    const { refs } = renderController({ timelineSync, setAtBottom });

    expect(refs.vList.scrollToIndex).toHaveBeenCalledWith(1, { align: 'center' });
    expect(setAtBottom).toHaveBeenCalledWith(false);
    expect(setFocusItem).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not paginate from the programmatic landing scroll after a jump', () => {
    const refs = createRefs();
    const initialSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, rerender } = renderController({ timelineSync: initialSync, refs });
    const landedSync = createTimelineSync({
      ...initialSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });
    rerender({ sync: landedSync, roomEventId: undefined });

    vi.mocked(landedSync.handleTimelinePagination).mockClear();
    act(() => {
      result.current.handleVListScroll(2200);
    });

    expect(landedSync.handleTimelinePagination).not.toHaveBeenCalled();
  });

  it('allows normal forward pagination after the user scrolls away from a landed jump', () => {
    const refs = createRefs();
    const mutableVList = refs.vList as unknown as { scrollOffset: number };
    mutableVList.scrollOffset = 2200;
    const initialSync = createTimelineSync({
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: true, highlight: true },
    });
    const { result, rerender } = renderController({ timelineSync: initialSync, refs });
    const landedSync = createTimelineSync({
      ...initialSync,
      liveTimelineLinked: false,
      focusItem: { index: 1, scrollTo: false, highlight: true },
    });
    rerender({ sync: landedSync, roomEventId: undefined });

    act(() => {
      result.current.markUserScrollIntent('forward');
    });
    act(() => {
      result.current.handleVListScroll(2200);
    });

    expect(landedSync.handleTimelinePagination).toHaveBeenCalledTimes(1);
    expect(landedSync.handleTimelinePagination).toHaveBeenCalledWith(false);
  });

  it('loads a missing jump target and suppresses pagination until it resolves', () => {
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
      result.current.markUserScrollIntent('backward');
    });

    expect(timelineSync.loadEventTimeline).toHaveBeenCalledWith('$target');
    expect(timelineSync.handleTimelinePagination).not.toHaveBeenCalled();

    act(() => {
      resolveLoad();
    });
  });
});
