import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { VListHandle } from 'virtua';
import type { useTimelineSync } from '$hooks/timeline/useTimelineSync';
import {
  getProcessedRowIndexForRawTimelineIndex,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import {
  getBottomClampSpacer,
  getCenterAnchorAdjustment,
  isTimelineAtBottom,
  TIMELINE_BOTTOM_THRESHOLD_PX,
  type TimelineAnchor,
  type TimelineScrollDirection,
} from './timelineViewportModel';
import { pushTimelineJumpDebug } from './timelineJumpDebug';

const INITIAL_BACKFILL_PAGE_BUDGET = 6;
const BOOTSTRAP_FILL_TARGET_SLACK_PX = 32;
const TIMELINE_PAGINATION_THRESHOLD_PX = 500;
const TIMELINE_SCROLL_INTENT_DELTA_PX = 8;
const TIMELINE_SCROLL_INTENT_TTL_MS = 250;

type TimelineSyncController = ReturnType<typeof useTimelineSync>;

type PendingScrollIntent = {
  id: number;
  direction?: TimelineScrollDirection;
  expiresAt: number;
};

export type UseTimelineViewportControllerOptions = {
  roomId: string;
  eventId?: string;
  timelineSync: TimelineSyncController;
  timelineSyncRef: React.MutableRefObject<TimelineSyncController>;
  vListRef: RefObject<VListHandle>;
  messageListRef: RefObject<HTMLDivElement>;
  processedEventsRef: React.MutableRefObject<ProcessedEvent[]>;
  atBottomRef: React.MutableRefObject<boolean>;
  setAtBottom: (val: boolean) => void;
  getRawIndexToProcessedIndex: (rawIndex: number) => number | undefined;
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
  const remainingInitialBackfillPagesRef = useRef(INITIAL_BACKFILL_PAGE_BUDGET);
  const lastScrollOffsetRef = useRef(0);
  const suppressNextCenterScrollRef = useRef(false);
  const scrollIntentCounterRef = useRef(0);
  const pendingScrollIntentRef = useRef<PendingScrollIntent | undefined>(undefined);
  const pendingBootstrapRevealRef = useRef(false);
  const bootstrapViewportRetryFrameRef = useRef<number | undefined>(undefined);
  const settleAnchorFrameRef = useRef<number | undefined>(undefined);
  const readyFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentRoomIdRef = useRef(roomId);

  const canPaginateBackRef = useRef(timelineSync.canPaginateBack);
  canPaginateBackRef.current = timelineSync.canPaginateBack;

  const liveTimelineLinkedRef = useRef(timelineSync.liveTimelineLinked);
  liveTimelineLinkedRef.current = timelineSync.liveTimelineLinked;

  const backwardStatusRef = useRef(timelineSync.backwardStatus);
  backwardStatusRef.current = timelineSync.backwardStatus;

  const forwardStatusRef = useRef(timelineSync.forwardStatus);
  forwardStatusRef.current = timelineSync.forwardStatus;

  const clearPendingScrollIntent = useCallback(() => {
    pendingScrollIntentRef.current = undefined;
  }, []);

  const getActiveScrollIntent = useCallback((): PendingScrollIntent | undefined => {
    const intent = pendingScrollIntentRef.current;
    if (!intent) return undefined;
    if (Date.now() <= intent.expiresAt) return intent;
    pendingScrollIntentRef.current = undefined;
    return undefined;
  }, []);

  const getScrollEdges = useCallback(
    (offset = vListRef.current?.scrollOffset) => {
      const v = vListRef.current;
      if (!v || offset === undefined) return undefined;
      const distanceFromBottom = v.scrollSize - offset - v.viewportSize;
      return {
        offset,
        distanceFromBottom,
        isAtBottom: distanceFromBottom < TIMELINE_BOTTOM_THRESHOLD_PX,
        isAtBackwardEdge: offset < TIMELINE_PAGINATION_THRESHOLD_PX,
        isAtForwardEdge: distanceFromBottom < TIMELINE_PAGINATION_THRESHOLD_PX,
      };
    },
    [vListRef]
  );

  const requestPaginationFromScroll = useCallback(
    (
      direction: TimelineScrollDirection,
      intent: PendingScrollIntent | undefined,
      offset?: number
    ) => {
      if (!intent) return;
      if (jumpInFlight || timelineSyncRef.current.focusItem?.scrollTo) return;

      const edges = getScrollEdges(offset);
      if (!edges) return;
      if (
        direction === 'backward' &&
        (!edges.isAtBackwardEdge ||
          !canPaginateBackRef.current ||
          backwardStatusRef.current !== 'idle')
      )
        return;
      if (
        direction === 'forward' &&
        (!edges.isAtForwardEdge ||
          liveTimelineLinkedRef.current ||
          forwardStatusRef.current !== 'idle')
      )
        return;

      pendingScrollIntentRef.current = undefined;
      timelineSyncRef.current.handleTimelinePagination(direction === 'backward');
    },
    [getScrollEdges, jumpInFlight, timelineSyncRef]
  );

  if (currentRoomIdRef.current !== roomId) {
    hasInitialScrolledRef.current = false;
    currentRoomIdRef.current = roomId;
    pendingReadyRef.current = false;
    anchorRef.current = eventId ? { kind: 'none' } : { kind: 'bottom' };
    remainingInitialBackfillPagesRef.current = INITIAL_BACKFILL_PAGE_BUDGET;
    lastScrollOffsetRef.current = 0;
    suppressNextCenterScrollRef.current = false;
    pendingScrollIntentRef.current = undefined;
    pendingBootstrapRevealRef.current = false;
    if (bootstrapViewportRetryFrameRef.current !== undefined) {
      cancelAnimationFrame(bootstrapViewportRetryFrameRef.current);
      bootstrapViewportRetryFrameRef.current = undefined;
    }
    if (settleAnchorFrameRef.current !== undefined) {
      cancelAnimationFrame(settleAnchorFrameRef.current);
      settleAnchorFrameRef.current = undefined;
    }
    if (readyFallbackTimerRef.current !== undefined) {
      clearTimeout(readyFallbackTimerRef.current);
      readyFallbackTimerRef.current = undefined;
    }
    setJumpInFlight(false);
    setIsReady(false);
  }

  const recalcTopSpacer = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const prev = topSpacerHeightRef.current;
    const newH = getBottomClampSpacer(v.viewportSize, v.scrollSize, prev);
    if (Math.abs(prev - newH) > 2) {
      topSpacerHeightRef.current = newH;
      setTopSpacerHeight(newH);
    }
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
        if (Math.abs(adjustment) > 1) v.scrollBy(adjustment);
        return true;
      }

      return false;
    },
    [findMessageElement, messageListRef, vListRef]
  );

  const settleTimelineAnchor = useCallback(
    (anchor: TimelineAnchor, reveal = false) => {
      anchorRef.current = anchor;
      if (anchor.kind === 'message-center') {
        suppressNextCenterScrollRef.current = true;
        pendingScrollIntentRef.current = undefined;
      }
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

  const beginJumpLoad = useCallback(
    (targetEventId: string) => {
      pendingScrollIntentRef.current = undefined;
      setJumpInFlight(true);
      pushTimelineJumpDebug('viewport', 'begin_jump_load', {
        roomId,
        targetEventId,
      });
      void Promise.resolve(timelineSyncRef.current.loadEventTimeline(targetEventId)).finally(() => {
        setJumpInFlight(false);
        pushTimelineJumpDebug('viewport', 'jump_load_settled', {
          roomId,
          targetEventId,
        });
      });
    },
    [roomId, timelineSyncRef]
  );

  useEffect(
    () => () => {
      if (settleAnchorFrameRef.current !== undefined) {
        cancelAnimationFrame(settleAnchorFrameRef.current);
      }
      if (readyFallbackTimerRef.current !== undefined) {
        clearTimeout(readyFallbackTimerRef.current);
      }
      if (bootstrapViewportRetryFrameRef.current !== undefined) {
        cancelAnimationFrame(bootstrapViewportRetryFrameRef.current);
      }
    },
    []
  );

  useEffect((): void | (() => void) => {
    if (isReady) return;
    if (pendingBootstrapRevealRef.current) return;
    if (readyFallbackTimerRef.current !== undefined) {
      clearTimeout(readyFallbackTimerRef.current);
    }
    readyFallbackTimerRef.current = setTimeout(() => {
      setIsReady(true);
      readyFallbackTimerRef.current = undefined;
    }, 1500);
    return () => {
      if (readyFallbackTimerRef.current !== undefined) {
        clearTimeout(readyFallbackTimerRef.current);
        readyFallbackTimerRef.current = undefined;
      }
    };
  }, [isReady, roomId]);

  useLayoutEffect(() => {
    if (
      !eventId &&
      !hasInitialScrolledRef.current &&
      timelineSync.eventsLength > 0 &&
      vListRef.current
    ) {
      const lastIndex = processedEventsRef.current.length - 1;
      if (lastIndex < 0) {
        // Some rooms initially hydrate mostly state/hidden events. Keep a pending
        // first-visible-row anchor so we re-land on latest once a renderable row appears.
        pendingReadyRef.current = true;
        settleTimelineAnchor({ kind: 'bottom' }, true);
        hasInitialScrolledRef.current = true;
        return;
      }
      vListRef.current.scrollToIndex(lastIndex, { align: 'end' });
      const shouldBootstrapBeforeReveal = timelineSync.canPaginateBack;
      pendingBootstrapRevealRef.current = shouldBootstrapBeforeReveal;
      settleTimelineAnchor({ kind: 'bottom' }, !shouldBootstrapBeforeReveal);
      hasInitialScrolledRef.current = true;
    }
  }, [
    timelineSync.eventsLength,
    timelineSync.canPaginateBack,
    eventId,
    roomId,
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
    const prev = prevBackwardStatusRef.current;
    prevBackwardStatusRef.current = timelineSync.backwardStatus;
    if (
      prev !== timelineSync.backwardStatus &&
      (prev === 'loading' || timelineSync.backwardStatus === 'loading')
    ) {
      clearPendingScrollIntent();
    }
    if (timelineSync.backwardStatus === 'loading') {
      wasAtBottomBeforePaginationRef.current = atBottomRef.current;
      if (anchorRef.current.kind !== 'bottom') setShift(true);
    } else if (prev === 'loading' && timelineSync.backwardStatus === 'idle') {
      setShift(false);
      if (wasAtBottomBeforePaginationRef.current) settleTimelineAnchor({ kind: 'bottom' });

      if (pendingBootstrapRevealRef.current) {
        const v = vListRef.current;
        if (!v) return;
        if (v.viewportSize <= 0) return;
        const contentHeight = Math.max(0, v.scrollSize - topSpacerHeightRef.current);
        const isFilled = contentHeight > v.viewportSize + BOOTSTRAP_FILL_TARGET_SLACK_PX;
        const done =
          isFilled ||
          !timelineSync.canPaginateBack ||
          remainingInitialBackfillPagesRef.current <= 0;
        if (done) {
          pendingBootstrapRevealRef.current = false;
          setIsReady(true);
        }
      }
    } else if (timelineSync.backwardStatus === 'error' && pendingBootstrapRevealRef.current) {
      pendingBootstrapRevealRef.current = false;
      setIsReady(true);
    }
  }, [
    roomId,
    timelineSync.backwardStatus,
    timelineSync.canPaginateBack,
    atBottomRef,
    clearPendingScrollIntent,
    settleTimelineAnchor,
    vListRef,
  ]);

  useLayoutEffect(() => {
    const prev = prevForwardStatusRef.current;
    prevForwardStatusRef.current = timelineSync.forwardStatus;
    if (
      prev !== timelineSync.forwardStatus &&
      (prev === 'loading' || timelineSync.forwardStatus === 'loading')
    ) {
      clearPendingScrollIntent();
    }
  }, [clearPendingScrollIntent, timelineSync.forwardStatus]);

  useEffect((): void | (() => void) => {
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
            pushTimelineJumpDebug('viewport', 'focus_center_anchor_set', {
              roomId,
              focusEventId,
              processedIndex,
              focusRawIndex,
            });
          }
          timelineSync.setFocusItem((prev) =>
            prev ? { ...prev, index: focusRawIndex, scrollTo: false } : undefined
          );
        }
      }
      timeoutId = setTimeout(() => {
        timelineSync.setFocusItem(undefined);
      }, 2000);
    }
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [
    timelineSync,
    timelineSync.focusItem,
    getRawIndexToProcessedIndex,
    processedEventsRef,
    roomId,
    settleTimelineAnchor,
    vListRef,
  ]);

  useEffect(() => {
    if (
      timelineSync.focusItem &&
      !timelineSync.focusItem.scrollTo &&
      (isReady || anchorRef.current.kind !== 'message-center')
    ) {
      setIsReady(true);
    }
  }, [timelineSync.focusItem, isReady]);

  useEffect(() => {
    if (!eventId) return;
    anchorRef.current = { kind: 'none' };
    setIsReady(false);
    beginJumpLoad(eventId);
  }, [eventId, roomId, beginJumpLoad]);

  useEffect(() => {
    if (!jumpInFlight) return;
    if (!timelineSync.focusItem) return;
    if (timelineSync.focusItem.scrollTo) return;
    setJumpInFlight(false);
    pushTimelineJumpDebug('viewport', 'jump_inflight_cleared_by_focus_settle', {
      roomId,
      focusIndex: timelineSync.focusItem.index,
    });
  }, [jumpInFlight, roomId, timelineSync.focusItem]);

  useLayoutEffect(() => {
    if (!isReady) return;
    recalcTopSpacer();
    applyTimelineAnchor();

    const v = vListRef.current;
    if (!v || anchorRef.current.kind !== 'bottom') return;
    const nextAtBottom = isTimelineAtBottom(v.scrollSize, v.scrollOffset, v.viewportSize);
    if (nextAtBottom !== atBottomRef.current) setAtBottom(nextAtBottom);
  }, [
    isReady,
    timelineSync.eventsLength,
    timelineSync.backwardStatus,
    timelineSync.forwardStatus,
    recalcTopSpacer,
    applyTimelineAnchor,
    setAtBottom,
    atBottomRef,
    vListRef,
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
  }, [isReady, messageListRef, recalcTopSpacer, applyTimelineAnchor]);

  useLayoutEffect(() => {
    if (!pendingReadyRef.current) return;
    if (processedEventsRef.current.length === 0) return;
    pendingReadyRef.current = false;
    vListRef.current?.scrollToIndex(processedEventsRef.current.length - 1, { align: 'end' });
    settleTimelineAnchor({ kind: 'bottom' }, true);
  }, [
    timelineSync.eventsLength,
    processedEventsRef.current.length,
    settleTimelineAnchor,
    vListRef,
    processedEventsRef,
  ]);

  useEffect(() => {
    const v = vListRef.current;
    if (!v) return;
    if (!isReady && !pendingBootstrapRevealRef.current) return;
    if (jumpInFlight) return;
    if (timelineSync.focusItem) return;
    if (anchorRef.current.kind === 'message-center') return;
    if (anchorRef.current.kind !== 'bottom') return;
    if (remainingInitialBackfillPagesRef.current <= 0) return;
    if (!canPaginateBackRef.current || backwardStatusRef.current !== 'idle') return;

    const contentHeight = Math.max(0, v.scrollSize - topSpacerHeightRef.current);
    if (v.viewportSize <= 0) {
      if (bootstrapViewportRetryFrameRef.current === undefined) {
        bootstrapViewportRetryFrameRef.current = requestAnimationFrame(() => {
          bootstrapViewportRetryFrameRef.current = undefined;
          setBootstrapViewportTick((prev) => prev + 1);
        });
      }
      return;
    }
    if (contentHeight > v.viewportSize + BOOTSTRAP_FILL_TARGET_SLACK_PX) {
      if (pendingBootstrapRevealRef.current) {
        pendingBootstrapRevealRef.current = false;
        setIsReady(true);
      }
      return;
    }

    remainingInitialBackfillPagesRef.current -= 1;
    timelineSyncRef.current.handleTimelinePagination(true);
  }, [
    roomId,
    isReady,
    jumpInFlight,
    timelineSync.focusItem,
    timelineSync.eventsLength,
    timelineSync.backwardStatus,
    bootstrapViewportTick,
    timelineSyncRef,
    vListRef,
  ]);

  const handleVListScroll = useCallback(
    (offset: number) => {
      const v = vListRef.current;
      if (!v) return;

      const prevOffset = lastScrollOffsetRef.current;
      lastScrollOffsetRef.current = offset;
      const activeIntent = getActiveScrollIntent();
      const hasScrollIntent = activeIntent !== undefined;
      const userScrollingUp = offset + TIMELINE_SCROLL_INTENT_DELTA_PX < prevOffset;
      const userScrollingDown = offset > prevOffset + TIMELINE_SCROLL_INTENT_DELTA_PX;
      const intentTowardBackward =
        hasScrollIntent &&
        (activeIntent.direction === 'backward' ||
          (activeIntent.direction === undefined && userScrollingUp));
      const intentTowardForward =
        hasScrollIntent &&
        (activeIntent.direction === 'forward' ||
          (activeIntent.direction === undefined && userScrollingDown));

      const edges = getScrollEdges(offset);
      if (!edges) return;

      if (anchorRef.current.kind === 'message-center' && suppressNextCenterScrollRef.current) {
        suppressNextCenterScrollRef.current = false;
        return;
      }

      if (anchorRef.current.kind === 'message-center') {
        if (!hasScrollIntent) return;
        anchorRef.current = { kind: 'none' };
        pushTimelineJumpDebug('viewport', 'anchor_released_during_jump_context', {
          roomId,
          jumpInFlight,
          hasFocusItem: Boolean(timelineSync.focusItem),
          focusScrollTo: timelineSync.focusItem?.scrollTo,
          offset,
          prevOffset,
          atBottom: edges.isAtBottom,
        });
      } else if (anchorRef.current.kind === 'bottom') {
        const paginationLoading =
          backwardStatusRef.current === 'loading' || forwardStatusRef.current === 'loading';
        if (intentTowardBackward && !edges.isAtBottom && !paginationLoading) {
          anchorRef.current = { kind: 'none' };
        }
      } else if (edges.isAtBottom) {
        anchorRef.current = { kind: 'bottom' };
      }

      const nextAtBottom =
        anchorRef.current.kind === 'bottom' && !hasScrollIntent && !edges.isAtBottom
          ? true
          : edges.isAtBottom;
      if (nextAtBottom !== atBottomRef.current) setAtBottom(nextAtBottom);

      if (intentTowardBackward) requestPaginationFromScroll('backward', activeIntent, offset);
      if (intentTowardForward) requestPaginationFromScroll('forward', activeIntent, offset);
    },
    [
      atBottomRef,
      getActiveScrollIntent,
      getScrollEdges,
      jumpInFlight,
      requestPaginationFromScroll,
      roomId,
      setAtBottom,
      timelineSync.focusItem,
      vListRef,
    ]
  );

  const markUserScrollIntent = useCallback(
    (direction?: TimelineScrollDirection) => {
      scrollIntentCounterRef.current += 1;
      const intent = {
        id: scrollIntentCounterRef.current,
        direction,
        expiresAt: Date.now() + TIMELINE_SCROLL_INTENT_TTL_MS,
      };
      pendingScrollIntentRef.current = intent;
      if (direction) requestPaginationFromScroll(direction, intent);
    },
    [requestPaginationFromScroll]
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
