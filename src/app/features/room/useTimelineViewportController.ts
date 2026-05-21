import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { VListHandle } from 'virtua';
import type { useTimelineSync } from '$hooks/timeline/useTimelineSync';
import {
  getProcessedRowIndexForRawTimelineIndex,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import {
  getBottomClampSpacer,
  getCenterAnchorAdjustment,
  getTimelineVisibleRange,
  type TimelineAnchor,
  type TimelineScrollDirection,
  type TimelineVisibleRange,
} from './timelineViewportModel';

const INITIAL_BACKFILL_PAGE_BUDGET = 6;
const READY_FALLBACK_MS = 1500;
const FOCUS_HIGHLIGHT_MS = 2000;

type TimelineSyncController = ReturnType<typeof useTimelineSync>;

export type UseTimelineViewportControllerOptions = {
  roomId: string;
  eventId?: string;
  timelineSync: TimelineSyncController;
  timelineSyncRef: MutableRefObject<TimelineSyncController>;
  vListRef: RefObject<VListHandle>;
  messageListRef: RefObject<HTMLDivElement>;
  processedEventsRef: MutableRefObject<ProcessedEvent[]>;
  atBottomRef: MutableRefObject<boolean>;
  setAtBottom: (val: boolean) => void;
  getRawIndexToProcessedIndex: (rawIndex: number) => number | undefined;
};

const getScrollDirection = (
  previousOffset: number,
  nextOffset: number
): TimelineScrollDirection | undefined => {
  if (nextOffset < previousOffset) return 'backward';
  if (nextOffset > previousOffset) return 'forward';
  return undefined;
};

export function useTimelineViewportController({
  roomId,
  eventId,
  timelineSync,
  timelineSyncRef,
  vListRef,
  messageListRef,
  processedEventsRef,
  atBottomRef,
  setAtBottom,
  getRawIndexToProcessedIndex,
}: UseTimelineViewportControllerOptions) {
  const [shift, setShift] = useState(false);
  const [topSpacerHeight, setTopSpacerHeight] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [jumpInFlight, setJumpInFlight] = useState(false);
  const [bootstrapViewportTick, setBootstrapViewportTick] = useState(0);

  const topSpacerHeightRef = useRef(0);
  const hasInitialScrolledRef = useRef(false);
  const pendingReadyRef = useRef(false);
  const anchorRef = useRef<TimelineAnchor>({ kind: 'bottom' });
  const edgeArmedRef = useRef({ backward: true, forward: true });
  const queuedPaginationRef = useRef({ backward: false, forward: false });
  const pendingUserDirectionRef = useRef<TimelineScrollDirection | undefined>(undefined);
  const pendingUserScrollRef = useRef(false);
  const pendingBootstrapRevealRef = useRef(false);
  const remainingInitialBackfillPagesRef = useRef(INITIAL_BACKFILL_PAGE_BUDGET);
  const lastScrollOffsetRef = useRef(0);
  const pendingBootstrapFrameRef = useRef<number | undefined>(undefined);
  const settleAnchorFrameRef = useRef<number | undefined>(undefined);
  const readyFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentRoomIdRef = useRef(roomId);
  const jumpInFlightRef = useRef(jumpInFlight);
  jumpInFlightRef.current = jumpInFlight;

  const canPaginateBackRef = useRef(timelineSync.canPaginateBack);
  canPaginateBackRef.current = timelineSync.canPaginateBack;

  const liveTimelineLinkedRef = useRef(timelineSync.liveTimelineLinked);
  liveTimelineLinkedRef.current = timelineSync.liveTimelineLinked;

  const backwardStatusRef = useRef(timelineSync.backwardStatus);
  backwardStatusRef.current = timelineSync.backwardStatus;

  const forwardStatusRef = useRef(timelineSync.forwardStatus);
  forwardStatusRef.current = timelineSync.forwardStatus;

  useLayoutEffect(() => {
    if (currentRoomIdRef.current === roomId) return;

    currentRoomIdRef.current = roomId;
    hasInitialScrolledRef.current = false;
    pendingReadyRef.current = false;
    anchorRef.current = eventId ? { kind: 'none' } : { kind: 'bottom' };
    edgeArmedRef.current = { backward: true, forward: true };
    queuedPaginationRef.current = { backward: false, forward: false };
    pendingUserDirectionRef.current = undefined;
    pendingUserScrollRef.current = false;
    pendingBootstrapRevealRef.current = false;
    remainingInitialBackfillPagesRef.current = INITIAL_BACKFILL_PAGE_BUDGET;
    lastScrollOffsetRef.current = 0;
    topSpacerHeightRef.current = 0;

    if (pendingBootstrapFrameRef.current !== undefined) {
      cancelAnimationFrame(pendingBootstrapFrameRef.current);
      pendingBootstrapFrameRef.current = undefined;
    }
    if (settleAnchorFrameRef.current !== undefined) {
      cancelAnimationFrame(settleAnchorFrameRef.current);
      settleAnchorFrameRef.current = undefined;
    }
    if (readyFallbackTimerRef.current !== undefined) {
      clearTimeout(readyFallbackTimerRef.current);
      readyFallbackTimerRef.current = undefined;
    }

    setShift(false);
    setTopSpacerHeight(0);
    setJumpInFlight(false);
    setIsReady(false);
  }, [eventId, roomId]);

  const getRenderedItemCount = useCallback(() => {
    const processedCount = processedEventsRef.current.length;
    if (processedCount > 0) return processedCount;
    return timelineSyncRef.current.eventsLength > 0 ? 1 : 0;
  }, [processedEventsRef, timelineSyncRef]);

  const getVisibleRange = useCallback(
    (offset?: number): TimelineVisibleRange | undefined => {
      const v = vListRef.current;
      if (!v) return undefined;
      return getTimelineVisibleRange(v, getRenderedItemCount(), offset);
    },
    [getRenderedItemCount, vListRef]
  );

  const setBottomStateFromRange = useCallback(
    (range: TimelineVisibleRange) => {
      const nextAtBottom = range.atEnd && liveTimelineLinkedRef.current;
      if (nextAtBottom !== atBottomRef.current) setAtBottom(nextAtBottom);
    },
    [atBottomRef, setAtBottom]
  );

  const updateEdgeArming = useCallback((range: TimelineVisibleRange) => {
    if (!range.atStart) edgeArmedRef.current.backward = true;
    if (!range.atEnd) edgeArmedRef.current.forward = true;
  }, []);

  const recalcTopSpacer = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const prev = topSpacerHeightRef.current;
    const next = getBottomClampSpacer(v.viewportSize, v.scrollSize, prev);
    if (prev !== next) {
      topSpacerHeightRef.current = next;
      setTopSpacerHeight(next);
    }
  }, [vListRef]);

  const revealBootstrapIfReady = useCallback((): boolean => {
    if (!pendingBootstrapRevealRef.current) return false;

    const v = vListRef.current;
    if (!v || v.viewportSize <= 0) return false;

    const contentHeight = Math.max(0, v.scrollSize - topSpacerHeightRef.current);
    const done =
      contentHeight > v.viewportSize ||
      !canPaginateBackRef.current ||
      remainingInitialBackfillPagesRef.current <= 0;

    if (!done) return false;

    pendingBootstrapRevealRef.current = false;
    setIsReady(true);
    return true;
  }, [vListRef]);

  const findMessageElement = useCallback(
    (eventIdToFind: string): HTMLElement | undefined => {
      const root = messageListRef.current;
      if (!root) return undefined;
      const messageEls = root.querySelectorAll<HTMLElement>('[data-message-id]');
      return Array.from(messageEls).find((el) => el.dataset.messageId === eventIdToFind);
    },
    [messageListRef]
  );

  const applyTimelineAnchor = useCallback(
    (anchor = anchorRef.current): boolean => {
      const v = vListRef.current;
      if (!v) return false;

      if (anchor.kind === 'bottom') {
        v.scrollTo(v.scrollSize);
        if (liveTimelineLinkedRef.current && !atBottomRef.current) setAtBottom(true);
        return true;
      }

      if (anchor.kind === 'message-center') {
        const viewport = messageListRef.current;
        const target = findMessageElement(anchor.eventId);
        if (!viewport || !target) return false;

        const adjustment = getCenterAnchorAdjustment(
          target.getBoundingClientRect(),
          viewport.getBoundingClientRect()
        );
        if (adjustment !== 0) v.scrollBy(adjustment);
        return true;
      }

      return false;
    },
    [atBottomRef, findMessageElement, messageListRef, setAtBottom, vListRef]
  );

  const settleTimelineAnchor = useCallback(
    (anchor: TimelineAnchor, reveal = false) => {
      anchorRef.current = anchor;
      if (settleAnchorFrameRef.current !== undefined) {
        cancelAnimationFrame(settleAnchorFrameRef.current);
      }

      settleAnchorFrameRef.current = requestAnimationFrame(() => {
        recalcTopSpacer();
        applyTimelineAnchor(anchor);
        settleAnchorFrameRef.current = undefined;
        if (reveal) setIsReady(true);
      });
    },
    [applyTimelineAnchor, recalcTopSpacer]
  );

  const requestPagination = useCallback(
    (direction: TimelineScrollDirection, fromQueuedIntent = false): boolean => {
      if (jumpInFlightRef.current || timelineSyncRef.current.focusItem?.scrollTo) return false;

      if (direction === 'backward') {
        if (!canPaginateBackRef.current) return false;
        if (backwardStatusRef.current === 'loading') {
          if (!fromQueuedIntent) queuedPaginationRef.current.backward = true;
          return false;
        }
        if (backwardStatusRef.current !== 'idle') return false;
        edgeArmedRef.current.backward = false;
        timelineSyncRef.current.handleTimelinePagination(true);
        return true;
      }

      if (liveTimelineLinkedRef.current) return false;
      if (forwardStatusRef.current === 'loading') {
        if (!fromQueuedIntent) queuedPaginationRef.current.forward = true;
        return false;
      }
      if (forwardStatusRef.current !== 'idle') return false;
      edgeArmedRef.current.forward = false;
      timelineSyncRef.current.handleTimelinePagination(false);
      return true;
    },
    [timelineSyncRef]
  );

  const requestPaginationAtVisibleEdge = useCallback(
    (direction: TimelineScrollDirection, range = getVisibleRange()) => {
      if (!range) return false;
      if (direction === 'backward' && range.atStart && edgeArmedRef.current.backward) {
        return requestPagination('backward');
      }
      if (direction === 'forward' && range.atEnd && edgeArmedRef.current.forward) {
        return requestPagination('forward');
      }
      return false;
    },
    [getVisibleRange, requestPagination]
  );

  const releaseAnchorsForUserScroll = useCallback(
    (direction: TimelineScrollDirection | undefined) => {
      if (!direction) return;

      if (anchorRef.current.kind === 'message-center') {
        anchorRef.current = { kind: 'none' };
      }

      if (anchorRef.current.kind === 'bottom' && direction === 'backward') {
        anchorRef.current = { kind: 'none' };
        if (atBottomRef.current) setAtBottom(false);
      }
    },
    [atBottomRef, setAtBottom]
  );

  const beginJumpLoad = useCallback(
    (targetEventId: string) => {
      pendingUserDirectionRef.current = undefined;
      pendingUserScrollRef.current = false;
      anchorRef.current = { kind: 'none' };
      setJumpInFlight(true);
      void Promise.resolve(timelineSyncRef.current.loadEventTimeline(targetEventId)).finally(() => {
        setJumpInFlight(false);
      });
    },
    [timelineSyncRef]
  );

  useEffect(
    () => () => {
      if (settleAnchorFrameRef.current !== undefined) {
        cancelAnimationFrame(settleAnchorFrameRef.current);
      }
      if (pendingBootstrapFrameRef.current !== undefined) {
        cancelAnimationFrame(pendingBootstrapFrameRef.current);
      }
      if (readyFallbackTimerRef.current !== undefined) {
        clearTimeout(readyFallbackTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (isReady) return undefined;
    if (pendingBootstrapRevealRef.current) return undefined;
    if (eventId || jumpInFlight) return undefined;
    readyFallbackTimerRef.current = setTimeout(() => {
      setIsReady(true);
      readyFallbackTimerRef.current = undefined;
    }, READY_FALLBACK_MS);
    return () => {
      if (readyFallbackTimerRef.current !== undefined) {
        clearTimeout(readyFallbackTimerRef.current);
        readyFallbackTimerRef.current = undefined;
      }
    };
  }, [eventId, isReady, jumpInFlight, roomId]);

  useLayoutEffect(() => {
    if (eventId || hasInitialScrolledRef.current || timelineSync.eventsLength === 0) return;
    if (!timelineSync.liveTimelineLinked || !vListRef.current) return;

    const lastIndex = processedEventsRef.current.length - 1;
    if (lastIndex >= 0) {
      vListRef.current.scrollToIndex(lastIndex, { align: 'end' });
    } else {
      pendingReadyRef.current = true;
    }

    const shouldBootstrapBeforeReveal = timelineSync.canPaginateBack;
    pendingBootstrapRevealRef.current = shouldBootstrapBeforeReveal;
    settleTimelineAnchor({ kind: 'bottom' }, !shouldBootstrapBeforeReveal);
    hasInitialScrolledRef.current = true;
  }, [
    eventId,
    timelineSync.eventsLength,
    timelineSync.liveTimelineLinked,
    timelineSync.canPaginateBack,
    processedEventsRef,
    settleTimelineAnchor,
    vListRef,
  ]);

  useLayoutEffect(() => {
    if (eventId || isReady) return;
    if (!timelineSync.liveTimelineLinked) return;
    if (timelineSync.eventsLength > 0) return;
    if (timelineSync.canPaginateBack || timelineSync.backwardStatus === 'loading') return;
    settleTimelineAnchor({ kind: 'bottom' }, true);
  }, [
    eventId,
    isReady,
    timelineSync.liveTimelineLinked,
    timelineSync.eventsLength,
    timelineSync.canPaginateBack,
    timelineSync.backwardStatus,
    settleTimelineAnchor,
  ]);

  const prevBackwardStatusRef = useRef(timelineSync.backwardStatus);
  const prevForwardStatusRef = useRef(timelineSync.forwardStatus);
  const wasAtBottomBeforePaginationRef = useRef(false);

  useLayoutEffect(() => {
    const previous = prevBackwardStatusRef.current;
    prevBackwardStatusRef.current = timelineSync.backwardStatus;

    if (timelineSync.backwardStatus === 'loading') {
      wasAtBottomBeforePaginationRef.current = atBottomRef.current;
      if (!atBottomRef.current) setShift(true);
      return;
    }

    if (previous === 'loading') {
      setShift(false);
      edgeArmedRef.current.backward = true;
      if (wasAtBottomBeforePaginationRef.current) settleTimelineAnchor({ kind: 'bottom' });
      revealBootstrapIfReady();

      if (queuedPaginationRef.current.backward) {
        queuedPaginationRef.current.backward = false;
        requestPagination('backward', true);
      }
    }
  }, [
    atBottomRef,
    requestPagination,
    revealBootstrapIfReady,
    settleTimelineAnchor,
    timelineSync.backwardStatus,
  ]);

  useLayoutEffect(() => {
    const previous = prevForwardStatusRef.current;
    prevForwardStatusRef.current = timelineSync.forwardStatus;

    if (previous === 'loading' && timelineSync.forwardStatus !== 'loading') {
      edgeArmedRef.current.forward = true;
      if (queuedPaginationRef.current.forward) {
        queuedPaginationRef.current.forward = false;
        requestPagination('forward', true);
      }
    }
  }, [requestPagination, timelineSync.forwardStatus]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timelineSync.focusItem) {
      if (timelineSync.focusItem.scrollTo && vListRef.current) {
        let processedIndex = getRawIndexToProcessedIndex(timelineSync.focusItem.index);
        let focusRawIndex = timelineSync.focusItem.index;
        if (processedIndex === undefined) {
          const nearest = getProcessedRowIndexForRawTimelineIndex(
            processedEventsRef.current,
            timelineSync.focusItem.index
          );
          if (nearest) {
            processedIndex = nearest.rowIndex;
            focusRawIndex = nearest.focusRawIndex;
          }
        }

        if (processedIndex !== undefined) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
          const focusEventId = processedEventsRef.current[processedIndex]?.id;
          if (focusEventId) {
            settleTimelineAnchor({ kind: 'message-center', eventId: focusEventId }, true);
          } else {
            setIsReady(true);
          }
          if (atBottomRef.current) setAtBottom(false);
          timelineSync.setFocusItem((prev) =>
            prev ? { ...prev, index: focusRawIndex, scrollTo: false } : undefined
          );
        }
      }

      timeoutId = setTimeout(() => {
        timelineSync.setFocusItem(undefined);
      }, FOCUS_HIGHLIGHT_MS);
    }

    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [
    atBottomRef,
    getRawIndexToProcessedIndex,
    processedEventsRef,
    setAtBottom,
    settleTimelineAnchor,
    timelineSync,
    timelineSync.focusItem,
    vListRef,
  ]);

  useEffect(() => {
    if (timelineSync.focusItem) setIsReady(true);
  }, [timelineSync.focusItem]);

  useEffect(() => {
    if (!eventId) return;
    setIsReady(false);
    beginJumpLoad(eventId);
  }, [beginJumpLoad, eventId, roomId]);

  useLayoutEffect(() => {
    if (!isReady) return;
    recalcTopSpacer();
    applyTimelineAnchor();

    const range = getVisibleRange();
    if (range) setBottomStateFromRange(range);
  }, [
    applyTimelineAnchor,
    getVisibleRange,
    isReady,
    recalcTopSpacer,
    setBottomStateFromRange,
    timelineSync.backwardStatus,
    timelineSync.eventsLength,
    timelineSync.forwardStatus,
  ]);

  useEffect(() => {
    if (!isReady) return undefined;
    const viewport = messageListRef.current;
    if (!viewport) return undefined;
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      recalcTopSpacer();
      applyTimelineAnchor();
    });

    observer.observe(viewport);
    return () => observer.disconnect();
  }, [applyTimelineAnchor, isReady, messageListRef, recalcTopSpacer]);

  useLayoutEffect(() => {
    if (!pendingReadyRef.current) return;
    if (processedEventsRef.current.length === 0) return;
    pendingReadyRef.current = false;
    vListRef.current?.scrollToIndex(processedEventsRef.current.length - 1, { align: 'end' });
    const shouldBootstrapBeforeReveal = timelineSync.canPaginateBack;
    pendingBootstrapRevealRef.current = shouldBootstrapBeforeReveal;
    settleTimelineAnchor({ kind: 'bottom' }, !shouldBootstrapBeforeReveal);
  }, [
    processedEventsRef,
    processedEventsRef.current.length,
    settleTimelineAnchor,
    timelineSync.canPaginateBack,
    timelineSync.eventsLength,
    vListRef,
  ]);

  useEffect(() => {
    const v = vListRef.current;
    if (!v || eventId || jumpInFlight) return;
    if (!isReady && !pendingBootstrapRevealRef.current) return;
    if (anchorRef.current.kind !== 'bottom') return;
    if (remainingInitialBackfillPagesRef.current <= 0) return;
    if (v.viewportSize <= 0) {
      if (pendingBootstrapFrameRef.current === undefined) {
        pendingBootstrapFrameRef.current = requestAnimationFrame(() => {
          pendingBootstrapFrameRef.current = undefined;
          setBootstrapViewportTick((prev) => prev + 1);
        });
      }
      return;
    }

    if (revealBootstrapIfReady()) return;
    if (!canPaginateBackRef.current || backwardStatusRef.current !== 'idle') return;

    const contentHeight = Math.max(0, v.scrollSize - topSpacerHeightRef.current);
    if (contentHeight > v.viewportSize) return;

    remainingInitialBackfillPagesRef.current -= 1;
    requestPagination('backward');
  }, [
    eventId,
    isReady,
    jumpInFlight,
    revealBootstrapIfReady,
    requestPagination,
    timelineSync.backwardStatus,
    timelineSync.eventsLength,
    bootstrapViewportTick,
    vListRef,
  ]);

  const handleVListScroll = useCallback(
    (offset: number) => {
      const v = vListRef.current;
      if (!v) return;

      const previousOffset = lastScrollOffsetRef.current;
      lastScrollOffsetRef.current = offset;

      const range = getVisibleRange(offset);
      if (!range) return;
      const previousRange = getVisibleRange(previousOffset);
      updateEdgeArming(range);
      setBottomStateFromRange(range);

      const userDirection = pendingUserDirectionRef.current;
      const userScroll = pendingUserScrollRef.current;
      pendingUserDirectionRef.current = undefined;
      pendingUserScrollRef.current = false;

      const inferredDirection = getScrollDirection(previousOffset, offset);
      const direction = userDirection ?? inferredDirection;
      const isUserInitiated = userScroll || userDirection !== undefined;
      const arrivedAtEdge =
        Boolean(previousRange) &&
        ((direction === 'backward' && !previousRange?.atStart && range.atStart) ||
          (direction === 'forward' && !previousRange?.atEnd && range.atEnd));

      if (!direction) {
        if (anchorRef.current.kind === 'none' && range.atEnd && liveTimelineLinkedRef.current) {
          anchorRef.current = { kind: 'bottom' };
        }
        return;
      }

      if (isUserInitiated) releaseAnchorsForUserScroll(direction);
      if (isUserInitiated || anchorRef.current.kind !== 'message-center') {
        if (isUserInitiated || arrivedAtEdge) requestPaginationAtVisibleEdge(direction, range);
      }

      if (anchorRef.current.kind === 'none' && range.atEnd && liveTimelineLinkedRef.current) {
        anchorRef.current = { kind: 'bottom' };
      }
    },
    [
      getVisibleRange,
      releaseAnchorsForUserScroll,
      requestPaginationAtVisibleEdge,
      setBottomStateFromRange,
      updateEdgeArming,
      vListRef,
    ]
  );

  const markUserScrollIntent = useCallback(
    (direction?: TimelineScrollDirection) => {
      pendingUserScrollRef.current = true;
      pendingUserDirectionRef.current = direction;

      releaseAnchorsForUserScroll(direction);
      if (!direction) return;

      const range = getVisibleRange();
      if (!range) return;
      updateEdgeArming(range);

      if (direction === 'backward' && range.atStart) {
        requestPagination('backward');
      } else if (direction === 'forward' && range.atEnd) {
        requestPagination('forward');
      }
    },
    [getVisibleRange, releaseAnchorsForUserScroll, requestPagination, updateEdgeArming]
  );

  return {
    shift,
    topSpacerHeight,
    isReady,
    beginJumpLoad,
    settleTimelineAnchor,
    handleVListScroll,
    markUserScrollIntent,
  };
}
