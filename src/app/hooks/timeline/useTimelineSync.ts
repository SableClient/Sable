import type { Dispatch, SetStateAction } from 'react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
import { Direction, RoomEvent, RelationType, ThreadEvent } from '$types/matrix-sdk';

import { useAlive } from '$hooks/useAlive';
import { markAsRead } from '$utils/notifications';
import { decryptAllTimelineEvent } from '$utils/room';
import {
  getInitialTimeline,
  getEmptyTimeline,
  getLinkedTimelines,
  getTimelinesEventsCount,
  getEventIdAbsoluteIndex,
  getLiveTimeline,
  getRoomUnreadInfo,
  PAGINATION_LIMIT,
} from '$utils/timeline';

export const EVENT_TIMELINE_LOAD_TIMEOUT_MS = 12000;

export type PaginationStatus = 'idle' | 'loading' | 'error';

export type TimelineState = {
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
  room: Room,
  onLoad: (eventId: string, linkedTimelines: EventTimeline[], evtAbsIndex: number) => void,
  onError: (err: Error | null) => void
) =>
  useCallback(
    async (eventId: string) =>
      Sentry.startSpan({ name: 'timeline.jump_load', op: 'matrix.timeline' }, async () => {
        const jumpLoadStart = performance.now();

        if (!room.getUnfilteredTimelineSet().getTimelineForEvent(eventId)) {
          await withTimeout(
            mx.roomInitialSync(room.roomId, PAGINATION_LIMIT),
            EVENT_TIMELINE_LOAD_TIMEOUT_MS
          );
          await withTimeout(
            mx.getLatestTimeline(room.getUnfilteredTimelineSet()),
            EVENT_TIMELINE_LOAD_TIMEOUT_MS
          );
        }
        const [err, replyEvtTimeline] = await to(
          withTimeout(
            mx.getEventTimeline(room.getUnfilteredTimelineSet(), eventId),
            EVENT_TIMELINE_LOAD_TIMEOUT_MS
          )
        );
        if (!replyEvtTimeline) {
          onError(err ?? null);
          return;
        }
        const linkedTimelines = getLinkedTimelines(replyEvtTimeline);
        const absIndex = getEventIdAbsoluteIndex(linkedTimelines, replyEvtTimeline, eventId);

        if (absIndex === undefined) {
          onError(err ?? null);
          return;
        }

        Sentry.metrics.distribution(
          'sable.timeline.jump_load_ms',
          performance.now() - jumpLoadStart
        );
        onLoad(eventId, linkedTimelines, absIndex);
      }),
    [mx, room, onLoad, onError]
  );

const useTimelinePagination = (
  mx: MatrixClient,
  timeline: TimelineState,
  setTimeline: Dispatch<SetStateAction<TimelineState>>,
  limit: number
) => {
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const alive = useAlive();
  const [backwardStatus, setBackwardStatus] = useState<PaginationStatus>('idle');
  const [forwardStatus, setForwardStatus] = useState<PaginationStatus>('idle');

  const fetchingRef = useRef({ backward: false, forward: false });
  const paginate = useMemo(() => {
    const recalibratePagination = (linkedTimelines: EventTimeline[]) => {
      const topTimeline = linkedTimelines[0];
      if (!topTimeline) return;
      const newLTimelines = getLinkedTimelines(topTimeline);
      setTimeline(() => ({ linkedTimelines: newLTimelines }));
    };

    return async (backwards: boolean) => {
      const directionKey = backwards ? 'backward' : 'forward';
      if (fetchingRef.current[directionKey]) return;

      const { linkedTimelines: lTimelines } = timelineRef.current;
      const timelineToPaginate = backwards ? lTimelines[0] : lTimelines.at(-1);
      if (!timelineToPaginate) return;

      const paginationToken = timelineToPaginate.getPaginationToken(
        backwards ? Direction.Backward : Direction.Forward
      );

      if (
        !paginationToken &&
        getTimelinesEventsCount(lTimelines) !==
          getTimelinesEventsCount(getLinkedTimelines(timelineToPaginate))
      ) {
        recalibratePagination(lTimelines);
        return;
      }

      fetchingRef.current[directionKey] = true;
      if (alive()) {
        (backwards ? setBackwardStatus : setForwardStatus)('loading');
      }

      // `continuing` tracks whether we hand the fetchingRef lock to a recursive
      // continuation call below.  The finally block must NOT reset the lock if
      // the recursive call has already claimed it, otherwise there is a brief
      // window where fetchingRef is false while the recursive paginate is in
      // flight, allowing a third overlapping call to start on sparse pages.
      let continuing = false;

      try {
        const countBefore = getTimelinesEventsCount(lTimelines);

        const [err] = await to(mx.paginateEventTimeline(timelineToPaginate, { backwards, limit }));

        if (err) {
          if (alive()) {
            (backwards ? setBackwardStatus : setForwardStatus)('error');
          }
          return;
        }

        const fetchedTimeline =
          timelineToPaginate.getNeighbouringTimeline(
            backwards ? Direction.Backward : Direction.Forward
          ) ?? timelineToPaginate;

        const roomId = fetchedTimeline.getRoomId();
        const evRoom = roomId ? mx.getRoom(roomId) : null;

        if (evRoom?.hasEncryptionStateEvent()) {
          await to(decryptAllTimelineEvent(mx, fetchedTimeline));
        }

        if (alive()) {
          // Re-read linkedTimelines after the await: a sliding sync reset may have
          // replaced lTimelines[0] (via resetLiveTimeline) while pagination was in
          // flight, making the captured lTimelines stale.  Using the fresh ref
          // ensures recalibratePagination rebuilds from the current live chain and
          // that countAfter/stillHasToken comparisons are meaningful.
          const freshLTimelines = timelineRef.current.linkedTimelines;
          const firstTimeline = freshLTimelines[0];
          if (!firstTimeline) return;
          recalibratePagination(freshLTimelines);
          (backwards ? setBackwardStatus : setForwardStatus)('idle');

          const countAfter = getTimelinesEventsCount(getLinkedTimelines(firstTimeline));
          const fetched = countAfter - countBefore;

          if (fetched > 0 && fetched < 5) {
            const checkTimeline = backwards
              ? freshLTimelines[0]
              : freshLTimelines[freshLTimelines.length - 1];
            if (!checkTimeline) return;
            const checkDirection = backwards ? Direction.Backward : Direction.Forward;
            const stillHasToken =
              typeof getLinkedTimelines(checkTimeline)[0]?.getPaginationToken(checkDirection) ===
              'string';
            if (stillHasToken) {
              // Release lock so inner paginate can claim it, then mark continuing
              // so the finally block below does NOT reset it after inner claims.
              fetchingRef.current[directionKey] = false;
              continuing = true;
              paginate(backwards);
              // At this point the inner paginate has synchronously set
              // fetchingRef.current[directionKey] = true before hitting its own
              // await.  The finally below will skip the reset.
            }
          }
        }
      } finally {
        // Only release the lock if we did NOT hand it to a recursive continuation.
        // If `continuing` is true the recursive call owns the lock and will release
        // it in its own finally block.
        if (!continuing) {
          fetchingRef.current[directionKey] = false;
        }
      }
    };
  }, [mx, alive, setTimeline, limit, setBackwardStatus, setForwardStatus]);

  return { paginate, backwardStatus, forwardStatus };
};

const useLiveEventArrive = (room: Room, onArrive: (mEvent: MatrixEvent) => void) => {
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    // Both are mutable: if TimelineReset replaces the live EventTimeline object
    // we re-anchor them together inside the handler so the isLive check always
    // runs against the current timeline and a fresh 60 s backfill window.
    let liveTimeline = getLiveTimeline(room);
    let registeredAt = Date.now();
    const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (
      mEvent: MatrixEvent,
      eventRoom: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;

      // Lazily re-anchor on timeline replacement. Capturing liveTimeline once
      // at registration causes events on the new timeline to fail the reference
      // check and be silently dropped after a sync gap / reconnect.
      const currentLiveTimeline = getLiveTimeline(room);
      if (currentLiveTimeline !== liveTimeline) {
        liveTimeline = currentLiveTimeline;
        registeredAt = Date.now();
      }

      const isLive =
        data.liveEvent ||
        (!toStartOfTimeline &&
          !removed &&
          data.timeline === liveTimeline &&
          mEvent.getTs() >= registeredAt - 60_000);
      if (!isLive) return;
      onArriveRef.current(mEvent);
    };
    const handleRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (
      mEvent: MatrixEvent,
      eventRoom: Room | undefined
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      onArriveRef.current(mEvent);
    };

    room.on(RoomEvent.Timeline, handleTimelineEvent);
    room.on(RoomEvent.Redaction, handleRedaction);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimelineEvent);
      room.removeListener(RoomEvent.Redaction, handleRedaction);
    };
  }, [room]);
};

const useRelationUpdate = (room: Room, onRelation: () => void) => {
  const onRelationRef = useRef(onRelation);
  onRelationRef.current = onRelation;

  useEffect(() => {
    const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (
      mEvent: MatrixEvent,
      eventRoom: Room | undefined,
      _toStartOfTimeline: boolean | undefined,
      _removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (eventRoom?.roomId !== room.roomId || data.liveEvent) return;
      if (mEvent.getRelation()?.rel_type === RelationType.Replace) {
        onRelationRef.current();
      }
    };
    room.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [room]);
};

const useLiveTimelineRefresh = (room: Room, onRefresh: () => void) => {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (r: Room) => {
      if (r.roomId !== room.roomId) return;
      onRefreshRef.current();
    };
    const handleTimelineReset: EventTimelineSetHandlerMap[RoomEvent.TimelineReset] = () => {
      onRefreshRef.current();
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
}

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
}: UseTimelineSyncOptions) {
  const alive = useAlive();

  const [timeline, setTimeline] = useState<TimelineState>(() =>
    eventId ? getEmptyTimeline() : { linkedTimelines: getInitialTimeline(room).linkedTimelines }
  );

  const [focusItem, setFocusItem] = useState<
    | {
        index: number;
        scrollTo: boolean;
        highlight: boolean;
      }
    | undefined
  >();

  const resetAutoScrollPendingRef = useRef(false);

  const eventsLength = getTimelinesEventsCount(timeline.linkedTimelines);
  const liveTimelineLinked = timeline.linkedTimelines.at(-1) === getLiveTimeline(room);

  const canPaginateBack =
    typeof timeline.linkedTimelines[0]?.getPaginationToken(Direction.Backward) === 'string';

  const atLiveEndRef = useRef(liveTimelineLinked);
  atLiveEndRef.current = liveTimelineLinked;

  const {
    paginate: handleTimelinePagination,
    backwardStatus,
    forwardStatus,
  } = useTimelinePagination(mx, timeline, setTimeline, PAGINATION_LIMIT);

  const prevEventsLengthRef = useRef(eventsLength);
  useEffect(() => {
    const prev = prevEventsLengthRef.current;
    const delta = eventsLength - prev;
    prevEventsLengthRef.current = eventsLength;

    if (delta === 0) return;

    const isBatch = delta > 1;
    let batchSize: string;
    if (delta === 1) batchSize = 'single';
    else if (delta <= 20) batchSize = 'small';
    else if (delta <= 100) batchSize = 'medium';
    else batchSize = 'large';

    Sentry.addBreadcrumb({
      category: 'timeline.events',
      message: `Timeline: ${delta} event${delta === 1 ? '' : 's'} added (${batchSize})`,
      level: isBatch ? 'info' : 'debug',
      data: {
        delta,
        batchSize,
        eventsLength,
        prevEventsLength: prev,
        liveTimelineLinked,
        atBottom: isAtBottom,
      },
    });

    if (delta > 50 && liveTimelineLinked) {
      Sentry.captureMessage('Timeline: large event batch from sliding sync', {
        level: 'warning',
        extra: { delta, eventsLength, atBottom: isAtBottom },
        tags: { feature: 'timeline', batchSize },
      });
    }
  }, [eventsLength, liveTimelineLinked, isAtBottom]);

  const loadEventTimeline = useEventTimelineLoader(
    mx,
    room,
    useCallback(
      (evtId, lTimelines, evtAbsIndex) => {
        if (!alive()) return;

        setTimeline({ linkedTimelines: lTimelines });

        setFocusItem({
          index: evtAbsIndex,
          scrollTo: true,
          highlight: evtId !== readUptoEventIdRef.current,
        });
      },
      [alive, readUptoEventIdRef]
    ),
    useCallback(() => {
      if (!alive()) return;
      setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
      scrollToBottom('instant');
    }, [alive, room, scrollToBottom])
  );

  const lastScrolledAtEventsLengthRef = useRef(eventsLength);

  const eventsLengthRef = useRef(eventsLength);
  eventsLengthRef.current = eventsLength;

  useLiveEventArrive(
    room,
    useCallback(
      (mEvt: MatrixEvent) => {
        const { threadRootId } = mEvt;
        if (threadRootId !== undefined) return;

        if (isAtBottomRef.current && atLiveEndRef.current) {
          if (
            document.hasFocus() &&
            (!unreadInfo?.readUptoEventId || mEvt.getSender() === mx.getUserId())
          ) {
            requestAnimationFrame(() => markAsRead(mx, mEvt.getRoomId()!, hideReadsRef.current));
          }

          if (!document.hasFocus() && !unreadInfo) {
            setUnreadInfo(getRoomUnreadInfo(room));
          }

          scrollToBottom(mEvt.getSender() === mx.getUserId() ? 'instant' : 'smooth');
          lastScrolledAtEventsLengthRef.current = eventsLengthRef.current + 1;

          setTimeline((ct) => ({ ...ct }));
          return;
        }

        setTimeline((ct) => ({ ...ct }));
        if (!unreadInfo) {
          setUnreadInfo(getRoomUnreadInfo(room));
        }
      },
      [mx, room, isAtBottomRef, unreadInfo, scrollToBottom, setUnreadInfo, hideReadsRef]
    )
  );

  useEffect(() => {
    const handleLocalEchoUpdated: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      _mEvent: MatrixEvent,
      eventRoom: Room | undefined
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      setTimeline((ct) => ({ ...ct }));
    };

    room.on(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    return () => {
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    };
  }, [room, setTimeline]);

  useLiveTimelineRefresh(
    room,
    useCallback(() => {
      const wasAtBottom = isAtBottomRef.current;
      resetAutoScrollPendingRef.current = wasAtBottom;
      setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
      if (wasAtBottom) {
        scrollToBottom('instant');
      }
    }, [room, isAtBottomRef, scrollToBottom])
  );

  useRelationUpdate(
    room,
    useCallback(() => {
      setTimeline((ct) => ({ ...ct }));
    }, [])
  );

  useThreadUpdate(
    room,
    useCallback(() => {
      setTimeline((ct) => ({ ...ct }));
    }, [])
  );

  useEffect(() => {
    const resetAutoScrollPending = resetAutoScrollPendingRef.current;
    if (resetAutoScrollPending) resetAutoScrollPendingRef.current = false;

    // liveTimelineLinked can be transiently false after TimelineReset: the SDK
    // fires the event before React commits the new linkedTimelines, so the stored
    // chain still references the old detached timeline. When auto-scroll recovery
    // is pending for a bottom-pinned user, the guard is meaningless lag.
    if (
      !(isAtBottom || resetAutoScrollPending) ||
      (!liveTimelineLinked && !resetAutoScrollPending) ||
      eventsLength === 0
    )
      return;

    if (eventsLength <= lastScrolledAtEventsLengthRef.current && !resetAutoScrollPending) return;

    lastScrolledAtEventsLengthRef.current = eventsLength;
    scrollToBottom('instant');
  }, [isAtBottom, liveTimelineLinked, eventsLength, scrollToBottom]);

  useEffect(() => {
    if (eventId) return;
    if (timeline.linkedTimelines.length > 0) return;
    if (getLiveTimeline(room).getEvents().length === 0) return;
    setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
  }, [eventId, room, timeline.linkedTimelines.length]);

  // When navigating between rooms, reset the timeline state to the new room's
  // initial linked timelines.  Without this, the component's timeline state
  // retains stale data from the previous room, causing liveTimelineLinked to be
  // false until a TimelineReset event fires.  For revisited rooms with up-to-date
  // data (no initial:true in the sliding sync response), that event may never
  // arrive — leaving the initial-scroll guard permanently blocked and the room
  // invisible.
  const prevRoomIdRef = useRef(room.roomId);
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;
  useEffect(() => {
    if (prevRoomIdRef.current === room.roomId) return;
    prevRoomIdRef.current = room.roomId;
    if (eventIdRef.current) return;
    setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
    // Intentionally only depends on room: we want this to fire when the room
    // identity changes, not on every eventId change.
  }, [room]);

  return {
    timeline,
    setTimeline,
    eventsLength,
    liveTimelineLinked,
    canPaginateBack,
    backwardStatus,
    forwardStatus,
    handleTimelinePagination,
    loadEventTimeline,
    focusItem,
    setFocusItem,
  };
}
