import type { Dispatch, SetStateAction } from 'react';
import {
  startTransition,
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';
import to from 'await-to-js';
import * as Sentry from '@sentry/react';
import type {
  MatrixClient,
  Room,
  MatrixEvent,
  EventTimeline,
  EventTimelineSetHandlerMap,
  IRoomTimelineData,
  RoomEventHandlerMap,
} from '$types/matrix-sdk';
import {
  Direction,
  EventTimelineSet,
  MatrixEventEvent,
  RoomEvent,
  RelationType,
  ThreadEvent,
} from '$types/matrix-sdk';

import { useAlive } from '$hooks/useAlive';
import { useMatrixEvent } from '$hooks/useMatrixEvent';
import { markAsRead } from '$utils/notifications';
import {
  getInitialTimeline,
  getLinkedTimelines,
  getTimelinesEventsCount,
  getEventIdAbsoluteIndex,
  getLiveTimeline,
  getRoomUnreadInfo,
  isNewestLiveEvent,
  PAGINATION_LIMIT,
} from '$utils/timeline';
import { isWindowFocused } from '$utils/dom';
import { isThreadRelationEvent } from '$utils/room/relations';
import { isPreprocessingSlidingSyncTimelineReset } from '$client/slidingSyncTimelineReset';

const EVENT_TIMELINE_LOAD_TIMEOUT_MS = 12000;

const JUMP_CONTEXT_LIMIT = 20;

type PaginationStatus = 'idle' | 'loading';

type TimelineState = {
  linkedTimelines: EventTimeline[];
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error('Timed out loading event timeline'));
    }, timeoutMs);

    promise
      .then((value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      });
  });

const useEventTimelineLoader = (
  mx: MatrixClient,
  onLoad: (eventId: string, requestId: number, linkedTimelines: EventTimeline[]) => void,
  onError: (eventId: string, requestId: number, err: Error | null) => void
) =>
  useCallback(
    async (eventId: string, requestId: number, timelineSet: EventTimelineSet) =>
      Sentry.startSpan({ name: 'timeline.jump_load', op: 'matrix.timeline' }, async () => {
        try {
          const jumpLoadStart = performance.now();

          const [err, replyEvtTimeline] = await to(
            withTimeout(
              (async () => {
                const loadedTimeline = await mx.getEventTimeline(timelineSet, eventId);
                if (!loadedTimeline || loadedTimeline.getTimelineSet() !== timelineSet) {
                  return loadedTimeline;
                }

                const [[backwardError], [forwardError]] = await Promise.all([
                  to(
                    mx.paginateEventTimeline(loadedTimeline, {
                      backwards: true,
                      limit: JUMP_CONTEXT_LIMIT,
                    })
                  ),
                  to(
                    mx.paginateEventTimeline(loadedTimeline, {
                      backwards: false,
                      limit: JUMP_CONTEXT_LIMIT,
                    })
                  ),
                ]);
                if (backwardError) throw backwardError;
                if (forwardError) throw forwardError;
                return loadedTimeline;
              })(),
              EVENT_TIMELINE_LOAD_TIMEOUT_MS
            )
          );
          if (!replyEvtTimeline) {
            onError(eventId, requestId, err ?? null);
            return;
          }
          if (replyEvtTimeline.getTimelineSet() !== timelineSet) {
            onError(eventId, requestId, null);
            return;
          }
          const linkedTimelines = getLinkedTimelines(replyEvtTimeline);

          if (getEventIdAbsoluteIndex(linkedTimelines, replyEvtTimeline, eventId) === undefined) {
            onError(eventId, requestId, err ?? null);
            return;
          }

          Sentry.metrics.distribution(
            'sable.timeline.jump_load_ms',
            performance.now() - jumpLoadStart
          );
          onLoad(eventId, requestId, linkedTimelines);
        } catch (err) {
          onError(eventId, requestId, err instanceof Error ? err : null);
        }
      }),
    [mx, onLoad, onError]
  );

const MAX_AUTO_CONTINUATIONS = 3;

export const countVisibleAmongNewest = (
  linkedTimelines: EventTimeline[],
  count: number,
  backwards: boolean,
  isEventVisible: (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => boolean
): number => {
  let remaining = count;
  let visible = 0;

  if (backwards) {
    for (const timeline of linkedTimelines) {
      const events = timeline.getEvents() ?? [];
      const timelineSet = timeline.getTimelineSet();
      for (let i = 0; i < events.length && remaining > 0; i += 1) {
        const mEvent = events[i];
        remaining -= 1;
        if (mEvent && isEventVisible(mEvent, timelineSet)) visible += 1;
      }
      if (remaining === 0) break;
    }
    return visible;
  }

  for (let t = linkedTimelines.length - 1; t >= 0 && remaining > 0; t -= 1) {
    const timeline = linkedTimelines[t];
    const events = timeline?.getEvents() ?? [];
    const timelineSet = timeline?.getTimelineSet();
    for (let i = events.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const mEvent = events[i];
      remaining -= 1;
      if (mEvent && timelineSet && isEventVisible(mEvent, timelineSet)) visible += 1;
    }
  }
  return visible;
};

const isFocusedWindowTimeline = (room: Room, timeline: EventTimeline): boolean =>
  timeline.getTimelineSet() !== room.getUnfilteredTimelineSet();

const useTimelinePagination = (
  mx: MatrixClient,
  room: Room,
  timeline: TimelineState,
  setTimeline: Dispatch<SetStateAction<TimelineState>>,
  limit: number,
  isEventVisible?: (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => boolean,
  onFocusedForwardExhausted?: () => void
) => {
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const alive = useAlive();
  const [backwardStatus, setBackwardStatus] = useState<PaginationStatus>('idle');
  const [forwardStatus, setForwardStatus] = useState<PaginationStatus>('idle');
  // Kept apart from the status so a failure surfaces without latching the gate: both
  // retry paths only fire from 'idle', so folding failure into the status strands the
  // timeline behind Retry for the rest of the room visit.
  const [backwardError, setBackwardError] = useState(false);
  const [forwardError, setForwardError] = useState(false);

  const fetchingRef = useRef({ backward: false, forward: false });
  const paginate = useMemo(() => {
    const recalibratePagination = (linkedTimelines: EventTimeline[]) => {
      const topTimeline = linkedTimelines[0];
      if (!topTimeline) return;
      const newLTimelines = getLinkedTimelines(topTimeline);
      startTransition(() => setTimeline(() => ({ linkedTimelines: newLTimelines })));
    };

    const edgeTimeline = (lTimelines: EventTimeline[], backwards: boolean) =>
      backwards ? lTimelines[0] : lTimelines.at(-1);

    return async (backwards: boolean, autoContinue = false) => {
      const directionKey = backwards ? 'backward' : 'forward';
      if (fetchingRef.current[directionKey]) return;

      const direction = backwards ? Direction.Backward : Direction.Forward;
      const initialTimelines = timelineRef.current.linkedTimelines;
      const initialTimeline = edgeTimeline(initialTimelines, backwards);
      if (!initialTimeline) return;

      if (
        !initialTimeline.getPaginationToken(direction) &&
        getTimelinesEventsCount(initialTimelines) !==
          getTimelinesEventsCount(getLinkedTimelines(initialTimeline))
      ) {
        recalibratePagination(initialTimelines);
        return;
      }

      fetchingRef.current[directionKey] = true;
      const setStatus = backwards ? setBackwardStatus : setForwardStatus;
      const setFailed = backwards ? setBackwardError : setForwardError;
      if (alive()) {
        setStatus('loading');
        setFailed(false);
      }

      let failed = false;

      try {
        const maxAttempts = autoContinue ? MAX_AUTO_CONTINUATIONS : 0;
        for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
          const lTimelines = timelineRef.current.linkedTimelines;
          const timelineToPaginate = edgeTimeline(lTimelines, backwards);
          if (!timelineToPaginate) return;
          if (typeof timelineToPaginate.getPaginationToken(direction) !== 'string') return;

          const countBefore = getTimelinesEventsCount(lTimelines);

          const [err, hasMore] = await to(
            mx.paginateEventTimeline(timelineToPaginate, { backwards, limit })
          );

          if (err) {
            failed = true;
            return;
          }
          if (!alive()) return;

          if (!backwards && !hasMore && isFocusedWindowTimeline(room, timelineToPaginate)) {
            onFocusedForwardExhausted?.();
            return;
          }

          const freshLTimelines = timelineRef.current.linkedTimelines;
          const firstTimeline = freshLTimelines[0];
          if (!firstTimeline) return;
          recalibratePagination(freshLTimelines);

          const rebuiltTimelines = getLinkedTimelines(firstTimeline);
          const fetched = getTimelinesEventsCount(rebuiltTimelines) - countBefore;
          if (fetched <= 0) return;

          const visibleFetched = isEventVisible
            ? countVisibleAmongNewest(rebuiltTimelines, fetched, backwards, isEventVisible)
            : fetched;
          if (visibleFetched >= 5) return;
        }
      } finally {
        fetchingRef.current[directionKey] = false;
        if (alive()) {
          setStatus('idle');
          if (failed) setFailed(true);
        }
      }
    };
  }, [
    mx,
    room,
    alive,
    setTimeline,
    limit,
    setBackwardStatus,
    setForwardStatus,
    isEventVisible,
    onFocusedForwardExhausted,
  ]);

  return { paginate, backwardStatus, forwardStatus, backwardError, forwardError };
};

const useLiveEventArrive = (
  room: Room,
  onArrive: (
    mEvent: MatrixEvent,
    isLive: boolean,
    timeline?: EventTimeline,
    prepended?: boolean
  ) => void
) => {
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (
      mEvent: MatrixEvent,
      eventRoom: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;

      const isRoomTimeline = data.timeline?.getTimelineSet() === room.getUnfilteredTimelineSet();
      const isDisplayedEdit =
        mEvent.getRelation?.()?.rel_type === RelationType.Replace && !isRoomTimeline;
      if (!isRoomTimeline && !isDisplayedEdit) return;

      onArriveRef.current(
        mEvent,
        isRoomTimeline && data.liveEvent === true && !toStartOfTimeline && !removed,
        data.timeline,
        toStartOfTimeline === true && !removed
      );
    };
    const handleRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (
      mEvent: MatrixEvent,
      eventRoom: Room | undefined
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      onArriveRef.current(mEvent, false);
    };

    room.on(RoomEvent.Timeline, handleTimelineEvent);
    room.on(RoomEvent.Redaction, handleRedaction);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimelineEvent);
      room.removeListener(RoomEvent.Redaction, handleRedaction);
    };
  }, [room]);
};

const useLiveTimelineRefresh = (room: Room, onRefresh: (preservePopulated: boolean) => void) => {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (r: Room) => {
      if (r.roomId !== room.roomId) return;
      onRefreshRef.current(false);
    };
    const handleTimelineReset: EventTimelineSetHandlerMap[RoomEvent.TimelineReset] = () => {
      onRefreshRef.current(isPreprocessingSlidingSyncTimelineReset(unfilteredTimelineSet));
    };
    const unfilteredTimelineSet = room.getUnfilteredTimelineSet();

    room.on(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    unfilteredTimelineSet.on(RoomEvent.TimelineReset, handleTimelineReset);
    return () => {
      room.removeListener(RoomEvent.TimelineRefresh, handleTimelineRefresh);
      unfilteredTimelineSet.removeListener(RoomEvent.TimelineReset, handleTimelineReset);
    };
  }, [room]);
};

const useThreadUpdate = (room: Room, onUpdate: () => void) => {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const handler = () => onUpdateRef.current();
    room.on(ThreadEvent.New, handler);
    room.on(ThreadEvent.Update, handler);
    room.on(ThreadEvent.NewReply, handler);
    return () => {
      room.removeListener(ThreadEvent.New, handler);
      room.removeListener(ThreadEvent.Update, handler);
      room.removeListener(ThreadEvent.NewReply, handler);
    };
  }, [room]);
};

export interface UseTimelineSyncOptions {
  room: Room;
  mx: MatrixClient;
  eventId?: string;
  isAtBottom: boolean;
  isAtBottomRef: React.MutableRefObject<boolean>;
  scrollToBottom: (behavior?: 'instant' | 'smooth') => void;
  unreadInfo: ReturnType<typeof getRoomUnreadInfo>;
  setUnreadInfo: Dispatch<SetStateAction<ReturnType<typeof getRoomUnreadInfo>>>;
  hideReadsRef: React.MutableRefObject<boolean>;
  readUptoEventIdRef: React.MutableRefObject<string | undefined>;
  isInactivePanelRef: React.MutableRefObject<boolean>;
  isEventVisible?: (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => boolean;
  onJumpError?: () => void;
  onReturnToLive?: () => void;
}

export type TimelineFocusItem = {
  eventId: string;
  scrollTo: boolean;
  highlight: boolean;
};

export function useTimelineSync({
  room,
  mx,
  eventId,
  isAtBottom,
  isAtBottomRef,
  scrollToBottom,
  unreadInfo,
  setUnreadInfo,
  hideReadsRef,
  readUptoEventIdRef,
  isInactivePanelRef,
  isEventVisible,
  onJumpError,
  onReturnToLive,
}: UseTimelineSyncOptions) {
  const alive = useAlive();

  const [liveTimeline, setLiveTimeline] = useState<TimelineState>(() => ({
    linkedTimelines: getInitialTimeline(room).linkedTimelines,
  }));
  const [focusedTimeline, setFocusedTimeline] = useState<TimelineState>();
  const timeline = focusedTimeline ?? liveTimeline;

  const [focusItem, setFocusItem] = useState<TimelineFocusItem>();
  const [jumpFailedFor, setJumpFailedFor] = useState<string | undefined>();
  const jumpFailed = jumpFailedFor !== undefined && jumpFailedFor === eventId;
  const [timelineVersion, setTimelineVersion] = useState(0);
  const bumpTimeline = useCallback(() => setTimelineVersion((version) => version + 1), []);

  const resetAutoScrollPendingRef = useRef(false);
  const pendingAutoScrollBehaviorRef = useRef<'instant' | 'smooth' | undefined>(undefined);

  const eventsLength = getTimelinesEventsCount(timeline.linkedTimelines);
  const liveTimelineLinked = focusedTimeline === undefined;

  const canPaginateBack =
    typeof timeline.linkedTimelines[0]?.getPaginationToken(Direction.Backward) === 'string';

  const canPaginateForward =
    typeof timeline.linkedTimelines.at(-1)?.getPaginationToken(Direction.Forward) === 'string';

  const atLiveEndRef = useRef(liveTimelineLinked);
  atLiveEndRef.current = liveTimelineLinked;

  const focusedTimelineRef = useRef(focusedTimeline);
  const linkedTimelinesRef = useRef(timeline.linkedTimelines);
  const readChain = (linkedTimelines: EventTimeline[]) => {
    linkedTimelinesRef.current = linkedTimelines;
  };
  readChain(timeline.linkedTimelines);

  const applyLiveTimeline = useCallback(
    (linkedTimelines: EventTimeline[]) => {
      setLiveTimeline({ linkedTimelines });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room]
  );
  const applyFocusedTimeline = useCallback(
    (linkedTimelines: EventTimeline[]) => {
      focusedTimelineRef.current = { linkedTimelines };
      readChain(linkedTimelines);
      setFocusedTimeline({ linkedTimelines });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room]
  );
  const setActiveTimeline = useCallback<Dispatch<SetStateAction<TimelineState>>>((action) => {
    if (focusedTimelineRef.current) {
      setFocusedTimeline((current) =>
        current ? (typeof action === 'function' ? action(current) : action) : current
      );
      return;
    }
    setLiveTimeline(action);
  }, []);

  const jumpRequestIdRef = useRef(0);
  const inFlightJumpRef = useRef<{ eventId: string; requestId: number } | undefined>(undefined);
  const isStaleJumpOutcome = useCallback(
    (requestId: number): boolean => {
      if (alive() && requestId === jumpRequestIdRef.current) return false;
      if (inFlightJumpRef.current?.requestId === requestId) inFlightJumpRef.current = undefined;
      return true;
    },
    [alive]
  );
  const cancelEventTimelineLoad = useCallback(() => {
    jumpRequestIdRef.current += 1;
    inFlightJumpRef.current = undefined;
  }, []);
  useLayoutEffect(() => {
    return () => {
      jumpRequestIdRef.current += 1;
      inFlightJumpRef.current = undefined;
    };
  }, [room, eventId]);

  const loadEventTimelineRequest = useEventTimelineLoader(
    mx,
    useCallback(
      (evtId, requestId, lTimelines) => {
        if (isStaleJumpOutcome(requestId)) return;
        inFlightJumpRef.current = undefined;

        setJumpFailedFor(undefined);
        applyFocusedTimeline(lTimelines);

        setFocusItem({
          eventId: evtId,
          scrollTo: true,
          highlight: evtId !== readUptoEventIdRef.current,
        });
      },
      [applyFocusedTimeline, isStaleJumpOutcome, readUptoEventIdRef]
    ),
    useCallback(
      (evtId: string, requestId: number) => {
        if (isStaleJumpOutcome(requestId)) return;
        inFlightJumpRef.current = undefined;
        focusedTimelineRef.current = undefined;
        setFocusedTimeline(undefined);
        applyLiveTimeline(getInitialTimeline(room).linkedTimelines);
        setJumpFailedFor(evtId);
        scrollToBottom('instant');
        onJumpError?.();
      },
      [applyLiveTimeline, isStaleJumpOutcome, onJumpError, room, scrollToBottom]
    )
  );
  const loadEventTimeline = useCallback(
    (evtId: string) => {
      jumpRequestIdRef.current += 1;
      inFlightJumpRef.current = { eventId: evtId, requestId: jumpRequestIdRef.current };

      if (isNewestLiveEvent(room, evtId)) {
        const liveLinkedTimelines = getInitialTimeline(room).linkedTimelines;
        inFlightJumpRef.current = undefined;
        setJumpFailedFor(undefined);
        applyLiveTimeline(liveLinkedTimelines);
        focusedTimelineRef.current = undefined;
        setFocusedTimeline(undefined);
        setFocusItem({ eventId: evtId, scrollTo: true, highlight: false });
        return Promise.resolve();
      }

      const focusedTimelineSet = new EventTimelineSet(
        room,
        { timelineSupport: true, pendingEvents: false },
        mx
      );
      return loadEventTimelineRequest(evtId, jumpRequestIdRef.current, focusedTimelineSet);
    },
    [applyLiveTimeline, loadEventTimelineRequest, mx, room]
  );

  const focusLiveTimeline = useCallback(() => {
    cancelEventTimelineLoad();
    focusedTimelineRef.current = undefined;
    setFocusedTimeline(undefined);
    setFocusItem(undefined);
    setJumpFailedFor(undefined);
    applyLiveTimeline(getInitialTimeline(room).linkedTimelines);
  }, [applyLiveTimeline, cancelEventTimelineLoad, room]);

  const {
    paginate: handleTimelinePagination,
    backwardStatus,
    forwardStatus,
    backwardError,
    forwardError,
  } = useTimelinePagination(
    mx,
    room,
    timeline,
    setActiveTimeline,
    PAGINATION_LIMIT,
    isEventVisible,
    focusLiveTimeline
  );

  const lastScrolledAtEventsLengthRef = useRef(eventsLength);

  const eventsLengthRef = useRef(eventsLength);
  eventsLengthRef.current = eventsLength;

  const redactInFocusedWindow = useCallback(
    (redactionEvent: MatrixEvent) => {
      const targetId = redactionEvent.event.redacts;
      const timelineSet = linkedTimelinesRef.current[0]?.getTimelineSet();
      if (!targetId || !timelineSet || timelineSet === room.getUnfilteredTimelineSet()) return;
      const target = timelineSet.findEventById(targetId);
      if (!target || target.isRedacted()) return;
      target.makeRedacted(redactionEvent, room);
    },
    [room]
  );

  const refreshFrameRef = useRef<number | undefined>(undefined);
  const scheduleTimelineRefresh = useCallback(() => {
    if (refreshFrameRef.current !== undefined) return;
    refreshFrameRef.current = requestAnimationFrame(() => {
      refreshFrameRef.current = undefined;
      if (!alive()) return;
      bumpTimeline();
    });
  }, [alive, bumpTimeline]);
  useEffect(
    () => () => {
      if (refreshFrameRef.current !== undefined) cancelAnimationFrame(refreshFrameRef.current);
    },
    []
  );

  useLiveEventArrive(
    room,
    useCallback(
      (mEvt: MatrixEvent, isLive: boolean, evtTimeline?: EventTimeline) => {
        if (mEvt.isRedaction()) redactInFocusedWindow(mEvt);

        const isDisplayedTimeline =
          evtTimeline === undefined || linkedTimelinesRef.current.includes(evtTimeline);
        if (isDisplayedTimeline) scheduleTimelineRefresh();

        if (!isLive) return;

        const { threadRootId } = mEvt;
        if (threadRootId !== undefined && isThreadRelationEvent(mEvt, threadRootId)) return;

        if (
          mEvt.getSender() === mx.getUserId() &&
          mEvt.isSending() &&
          !mEvt.isRelation() &&
          !mEvt.isRedaction() &&
          (!isAtBottomRef.current || !atLiveEndRef.current)
        ) {
          resetAutoScrollPendingRef.current = true;
          pendingAutoScrollBehaviorRef.current = 'instant';
          focusLiveTimeline();
          onReturnToLive?.();
          return;
        }

        if (isAtBottomRef.current && atLiveEndRef.current) {
          if (
            isWindowFocused() &&
            !isInactivePanelRef.current &&
            (!unreadInfo?.readUptoEventId || mEvt.getSender() === mx.getUserId())
          ) {
            requestAnimationFrame(() => markAsRead(mx, mEvt.getRoomId()!, hideReadsRef.current));
          }

          if (!isWindowFocused() && !unreadInfo) {
            setUnreadInfo(getRoomUnreadInfo(room));
          }

          pendingAutoScrollBehaviorRef.current =
            mEvt.getSender() === mx.getUserId() || !isWindowFocused() ? 'instant' : 'smooth';

          return;
        }

        if (!unreadInfo) {
          setUnreadInfo(getRoomUnreadInfo(room));
        }
      },
      [
        mx,
        room,
        isAtBottomRef,
        unreadInfo,
        setUnreadInfo,
        hideReadsRef,
        isInactivePanelRef,
        focusLiveTimeline,
        redactInFocusedWindow,
        onReturnToLive,
        scheduleTimelineRefresh,
      ]
    )
  );

  const handleLocalEchoUpdated = useCallback(
    (_mEvent: MatrixEvent, eventRoom: Room | undefined) => {
      if (eventRoom?.roomId !== room.roomId) return;
      scheduleTimelineRefresh();
    },
    [room, scheduleTimelineRefresh]
  );

  useMatrixEvent(room, RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);

  const handleDecrypted = useCallback(
    (mEvent: MatrixEvent) => {
      if (mEvent.getRoomId() !== room.roomId) return;
      scheduleTimelineRefresh();
    },
    [room, scheduleTimelineRefresh]
  );

  useMatrixEvent(mx, MatrixEventEvent.Decrypted, handleDecrypted);

  useLiveTimelineRefresh(
    room,
    useCallback(
      (preservePopulated: boolean) => {
        if (focusedTimelineRef.current || inFlightJumpRef.current) return;
        const refreshedTimelines = getInitialTimeline(room).linkedTimelines;
        if (
          preservePopulated &&
          eventsLengthRef.current > 0 &&
          getTimelinesEventsCount(refreshedTimelines) === 0
        ) {
          return;
        }
        applyLiveTimeline(refreshedTimelines);
        if (eventId) {
          void loadEventTimeline(eventId);
          return;
        }
        const wasAtBottom = isAtBottomRef.current;
        resetAutoScrollPendingRef.current = wasAtBottom;
        if (wasAtBottom) {
          scrollToBottom('instant');
        }
      },
      [applyLiveTimeline, eventId, isAtBottomRef, loadEventTimeline, room, scrollToBottom]
    )
  );

  useThreadUpdate(room, scheduleTimelineRefresh);

  useEffect(() => {
    const resetAutoScrollPending = resetAutoScrollPendingRef.current;
    if (resetAutoScrollPending) resetAutoScrollPendingRef.current = false;

    const behavior = pendingAutoScrollBehaviorRef.current ?? 'instant';
    pendingAutoScrollBehaviorRef.current = undefined;

    if (
      !(isAtBottom || resetAutoScrollPending) ||
      (!liveTimelineLinked && !resetAutoScrollPending) ||
      eventsLength === 0
    ) {
      lastScrolledAtEventsLengthRef.current = eventsLength;
      return;
    }

    if (eventsLength <= lastScrolledAtEventsLengthRef.current && !resetAutoScrollPending) return;

    lastScrolledAtEventsLengthRef.current = eventsLength;
    scrollToBottom(behavior);
  }, [isAtBottom, liveTimelineLinked, eventsLength, timelineVersion, scrollToBottom]);

  useEffect(() => {
    if (eventId) return;
    if (timeline.linkedTimelines.length > 0) return;
    if (getLiveTimeline(room).getEvents().length === 0) return;
    applyLiveTimeline(getInitialTimeline(room).linkedTimelines);
  }, [applyLiveTimeline, eventId, room, timeline.linkedTimelines.length]);

  const prevRoomIdRef = useRef(room.roomId);
  useEffect(() => {
    if (prevRoomIdRef.current === room.roomId) return;
    prevRoomIdRef.current = room.roomId;
    focusedTimelineRef.current = undefined;
    setFocusedTimeline(undefined);
    applyLiveTimeline(getInitialTimeline(room).linkedTimelines);
  }, [applyLiveTimeline, room]);

  return {
    timeline,
    timelineVersion,
    eventsLength,
    liveTimelineLinked,
    canPaginateBack,
    canPaginateForward,
    backwardStatus,
    forwardStatus,
    backwardError,
    forwardError,
    handleTimelinePagination,
    loadEventTimeline,
    cancelEventTimelineLoad,
    focusLiveTimeline,
    focusItem,
    setFocusItem,
    jumpFailed,
  };
}
