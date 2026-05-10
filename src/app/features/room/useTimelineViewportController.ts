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
  getTimelineScrollDecision,
  isTimelineAtBottom,
  type TimelineAnchor,
} from './timelineViewportModel';

const INITIAL_BACKFILL_PAGE_BUDGET = 6;
const BOOTSTRAP_FILL_TARGET_SLACK_PX = 32;

type TimelineSyncController = ReturnType<typeof useTimelineSync>;

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
  const backwardEdgeArmedRef = useRef(true);
  const forwardEdgeArmedRef = useRef(true);
  const suppressNextCenterScrollRef = useRef(false);
  const userScrollIntentRef = useRef(false);
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

  if (currentRoomIdRef.current !== roomId) {
    hasInitialScrolledRef.current = false;
    currentRoomIdRef.current = roomId;
    pendingReadyRef.current = false;
    anchorRef.current = eventId ? { kind: 'none' } : { kind: 'bottom' };
    remainingInitialBackfillPagesRef.current = INITIAL_BACKFILL_PAGE_BUDGET;
    lastScrollOffsetRef.current = 0;
    backwardEdgeArmedRef.current = true;
    forwardEdgeArmedRef.current = true;
    suppressNextCenterScrollRef.current = false;
    userScrollIntentRef.current = false;
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
  const wasAtBottomBeforePaginationRef = useRef(false);

  useLayoutEffect(() => {
    const prev = prevBackwardStatusRef.current;
    prevBackwardStatusRef.current = timelineSync.backwardStatus;
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
    settleTimelineAnchor,
    vListRef,
  ]);

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
  }, [jumpInFlight, timelineSync.focusItem]);

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

      if (anchorRef.current.kind === 'message-center' && suppressNextCenterScrollRef.current) {
        suppressNextCenterScrollRef.current = false;
        return;
      }

      const decision = getTimelineScrollDecision(
        anchorRef.current.kind === 'message-center'
          ? 'center'
          : anchorRef.current.kind === 'bottom'
            ? 'bottom'
            : 'free',
        {
          offset,
          previousOffset: prevOffset,
          scrollSize: v.scrollSize,
          viewportSize: v.viewportSize,
        },
        {
          canPaginateBack: canPaginateBackRef.current,
          backwardIdle: backwardStatusRef.current === 'idle',
          backwardArmed: backwardEdgeArmedRef.current,
          liveTimelineLinked: liveTimelineLinkedRef.current,
          forwardIdle: forwardStatusRef.current === 'idle',
          forwardArmed: forwardEdgeArmedRef.current,
          jumpPending: jumpInFlight,
          focusPending: Boolean(timelineSync.focusItem?.scrollTo),
        }
      );

      const suppressBottomReleaseWhileLoading =
        anchorRef.current.kind === 'bottom' &&
        decision.anchorMode === 'free' &&
        (backwardStatusRef.current === 'loading' || forwardStatusRef.current === 'loading');
      const suppressBottomReleaseWithoutIntent =
        anchorRef.current.kind === 'bottom' &&
        decision.anchorMode === 'free' &&
        !userScrollIntentRef.current;
      const suppressBottomRelease =
        suppressBottomReleaseWhileLoading || suppressBottomReleaseWithoutIntent;
      const nextAnchorMode = suppressBottomRelease ? 'bottom' : decision.anchorMode;
      const nextAtBottom = suppressBottomRelease ? true : decision.atBottom;
      const paginateBackward = suppressBottomRelease ? false : decision.paginateBackward;
      const paginateForward = suppressBottomRelease ? false : decision.paginateForward;

      backwardEdgeArmedRef.current = decision.nextBackwardArmed;
      forwardEdgeArmedRef.current = decision.nextForwardArmed;

      if (nextAtBottom !== atBottomRef.current) setAtBottom(nextAtBottom);

      if (nextAnchorMode === 'bottom') {
        anchorRef.current = { kind: 'bottom' };
      } else if (nextAnchorMode === 'free') {
        anchorRef.current = { kind: 'none' };
      }

      if (paginateBackward) timelineSyncRef.current.handleTimelinePagination(true);
      if (paginateForward) timelineSyncRef.current.handleTimelinePagination(false);
    },
    [atBottomRef, jumpInFlight, setAtBottom, timelineSync.focusItem, timelineSyncRef, vListRef]
  );

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentRef.current = true;
  }, []);

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
