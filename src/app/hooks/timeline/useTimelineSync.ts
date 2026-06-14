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
import { ClientEvent, Direction, RoomEvent, RelationType, ThreadEvent } from '$types/matrix-sdk';

import { useAlive } from '$hooks/useAlive';
import { markAsRead } from '$utils/notifications';
import { decryptAllTimelineEvent } from '$utils/room';
import { appEvents } from '$utils/appEvents';
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

export const EVENT_TIMELINE_LOAD_TIMEOUT_MS = 20000;

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
  onError: (err: Error | null) => void,
  onProactiveLoad?: () => void
) =>
  useCallback(
    async (eventId: string, signal?: AbortSignal) =>
      Sentry.startSpan({ name: 'timeline.jump_load', op: 'matrix.timeline' }, async () => {
        const jumpLoadStart = performance.now();

        // Check if already aborted before starting
        if (signal?.aborted) {
          const abortError = new Error('Timeline load aborted before start');
          abortError.name = 'AbortError';
          throw abortError;
        }

        Sentry.addBreadcrumb({
          category: 'timeline.load',
          message: 'Timeline load started',
          data: { eventId, roomId: room.roomId, isPermalink: true },
          level: 'info',
        });

        // Directly fetch the event timeline context from the server using /context API.
        // Do NOT wait for roomInitialSync or sliding sync — the jump should be independent
        // of sync state and only use GET /rooms/{roomId}/context/{eventId}.
        // This prevents the 6+ second delay from waiting for sliding sync to complete.
        const [err, replyEvtTimeline] = await to(
          withTimeout(
            mx.getEventTimeline(room.getUnfilteredTimelineSet(), eventId),
            EVENT_TIMELINE_LOAD_TIMEOUT_MS
          )
        );

        // Check if aborted after getEventTimeline
        if (signal?.aborted) {
          const abortError = new Error('Timeline load aborted after getEventTimeline');
          abortError.name = 'AbortError';
          throw abortError;
        }

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

        // Successfully loaded the timeline fragment from /context endpoint.
        // This fragment may or may not be connected to the live timeline — both cases
        // are valid and should be rendered. Disconnected fragments occur naturally for
        // old permalinks/bookmarks and pagination will connect them as the user scrolls.

        Sentry.metrics.distribution(
          'sable.timeline.jump_load_ms',
          performance.now() - jumpLoadStart
        );

        Sentry.addBreadcrumb({
          category: 'timeline.load',
          message: 'Timeline load complete',
          data: {
            eventId,
            roomId: room.roomId,
            duration: performance.now() - jumpLoadStart,
            messageCount: getTimelinesEventsCount(linkedTimelines),
          },
          level: 'info',
        });

        onLoad(eventId, linkedTimelines, absIndex);

        // Proactively load context above and below the jumped-to event so the user
        // can scroll immediately without waiting for pagination triggers.
        if (onProactiveLoad) {
          setTimeout(() => onProactiveLoad(), 500);
        }
      }),
    [mx, room, onLoad, onError, onProactiveLoad]
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
        const direction = backwards ? 'backwards' : 'forwards';
        const paginatingRoomId = timelineToPaginate.getRoomId();

        Sentry.addBreadcrumb({
          category: 'timeline.pagination',
          message: 'Pagination started',
          data: {
            direction,
            roomId: paginatingRoomId ?? 'unknown',
            fromToken: paginationToken?.substring(0, 20) ?? 'none',
            currentEventCount: countBefore,
          },
          level: 'info',
        });

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
            const checkLinkedTimelines = getLinkedTimelines(checkTimeline);
            const tokenTimeline = backwards
              ? checkLinkedTimelines[0]
              : checkLinkedTimelines[checkLinkedTimelines.length - 1];
            const stillHasToken =
              typeof tokenTimeline?.getPaginationToken(checkDirection) === 'string';
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
        eventId?: string;
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
  const canPaginateForward =
    typeof timeline.linkedTimelines.at(-1)?.getPaginationToken(Direction.Forward) === 'string';

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

    // Warn only for truly large batches (> 100) — active room subscription limit is 50,
    // so we expect batches up to 50–100 during normal operation (opening rooms, backfill).
    // 97% of warnings were "medium" (delta <= 100), indicating the 50 threshold was too low.
    if (delta > 100 && liveTimelineLinked) {
      Sentry.captureMessage('Timeline: large event batch from sliding sync', {
        level: 'warning',
        extra: { delta, eventsLength, atBottom: isAtBottom },
        tags: { feature: 'timeline', batchSize },
      });
    }
  }, [eventsLength, liveTimelineLinked, isAtBottom]);

  const handleTimelinePaginationRef = useRef(handleTimelinePagination);
  handleTimelinePaginationRef.current = handleTimelinePagination;

  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const loadEventTimeline = useEventTimelineLoader(
    mx,
    room,
    useCallback(
      (evtId, lTimelines, evtAbsIndex) => {
        if (!alive()) return;

        setTimeline({ linkedTimelines: lTimelines });

        setFocusItem({
          index: evtAbsIndex,
          eventId: evtId,
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
    }, [alive, room, scrollToBottom]),
    useCallback(() => {
      // Proactively load a batch above and below the jumped-to event so the user
      // can scroll immediately without waiting for pagination triggers.
      // Only attempt forward pagination if there's a token — otherwise we're at
      // the live edge and will get an error ("Failed to load messages").
      void handleTimelinePaginationRef.current(true); // backward

      const { linkedTimelines } = timelineRef.current;
      const lastTimeline = linkedTimelines.at(-1);
      const forwardToken = lastTimeline?.getPaginationToken(Direction.Forward);
      if (forwardToken) {
        void handleTimelinePaginationRef.current(false); // forward
      }
    }, [])
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
    // TimelineRefresh fires when getEventTimeline() creates a new context —
    // i.e. it was triggered by our own history load.  If eventId is set we
    // must NOT restart the load here: doing so would cause an infinite loop
    // (getEventTimeline → TimelineRefresh → loadEventTimeline → getEventTimeline…).
    useCallback(() => {
      // When eventId is set, loadEventTimeline is responsible for updating the
      // timeline state. Don't overwrite with the live timeline.
      if (eventId) {
        // If loadEventTimeline hasn't been called yet (e.g., first render), trigger it now.
        // This handles the case where TimelineReset fires before the initial load effect runs.
        return;
      }
      const wasAtBottom = isAtBottomRef.current;
      resetAutoScrollPendingRef.current = wasAtBottom;
      setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
      if (wasAtBottom) {
        scrollToBottom('instant');
      }
    }, [eventId, room, isAtBottomRef, scrollToBottom])
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
  // After initial:true (pull-to-refresh force-reset, reconnect, or first join),
  // the sliding-sync SDK injects events into the live timeline via
  // injectRoomEvents and then emits ClientEvent.Room.  When all injected events
  // are historical (num_live === 0 → fromCache: true → liveEvent: false),
  // useLiveEventArrive's 60-second timestamp gate silently drops them, so React
  // never re-renders and the timeline stays blank indefinitely.  Listening here
  // guarantees a re-render once all events are in the SDK's timeline, no matter
  // how old they are.
  useEffect(() => {
    const handleRoomInitialized = (eventRoom: Room) => {
      if (eventRoom.roomId !== room.roomId) return;
      // Don't update to live timeline when waiting for eventId context to load.
      // The eventId-specific loading path will handle setting the correct timeline.
      if (eventId) return;
      // Only update if the live timeline actually has events now — prevents
      // spurious updates that would reset scroll position during normal sync.
      const liveEvents = getLiveTimeline(room).getEvents();
      if (liveEvents.length === 0) return;
      // After PTR, React's timeline state may reference the correct live timeline
      // object, but with eventsLength still at 0 (before the re-render). Detect this
      // by comparing the SDK's current event count with React's last known count.
      const reactEventsLength = eventsLengthRef.current;
      const currentLiveTimeline = getLiveTimeline(room);
      // linkedTimelines is ordered oldest→newest, so live timeline is last
      const isStale =
        timeline.linkedTimelines.length === 0 ||
        timeline.linkedTimelines[timeline.linkedTimelines.length - 1] !== currentLiveTimeline;

      // Calculate actual event count from SDK's current timeline chain to detect
      // if events were appended without changing the timeline object reference
      const currentSdkEventCount = getTimelinesEventsCount(getLinkedTimelines(currentLiveTimeline));
      const eventCountChanged = currentSdkEventCount !== reactEventsLength;

      const needsUpdate = reactEventsLength === 0 || isStale || eventCountChanged;
      if (!needsUpdate) return;
      // Force timeline update with fresh SDK state. This ensures the React
      // timeline state picks up the newly-injected events after PTR or when
      // the SDK appends events (e.g., room subscription expanded timeline_limit).
      setTimeline({ linkedTimelines: getLinkedTimelines(currentLiveTimeline) });
    };
    mx.on(ClientEvent.Room, handleRoomInitialized);
    return () => {
      mx.off(ClientEvent.Room, handleRoomInitialized);
    };
  }, [mx, room, eventId, timeline.linkedTimelines, eventsLengthRef]);

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

  // When the app comes to foreground (from background or notification tap),
  // check if the SDK timeline has events but React's timeline state is stale,
  // and force a refresh if needed. This fixes the visibility regression where
  // cached events don't appear when opening the app because:
  // 1. ClientEvent.Room doesn't fire for cached rooms (no initial:true)
  // 2. useLiveEventArrive's 60s gate drops cached events
  // 3. Room didn't change so prevRoomIdRef useEffect doesn't fire
  useEffect(() => {
    const handleVisibilityChange = (isVisible: boolean) => {
      if (!isVisible) return; // Only act on foreground events

      // Check if SDK has events but React timeline state is empty or stale
      const liveTimeline = getLiveTimeline(room);
      const sdkEvents = liveTimeline.getEvents();
      if (sdkEvents.length === 0) return; // No events to show

      const linkedTimelines = timeline.linkedTimelines;
      const reactHasEvents =
        linkedTimelines.length > 0 && getTimelinesEventsCount(linkedTimelines) > 0;

      // If React state is empty but SDK has events, force refresh
      if (!reactHasEvents) {
        setTimeline({ linkedTimelines: getLinkedTimelines(liveTimeline) });
        return;
      }

      // If React state has events, check if it's stale (references old timeline)
      const currentLiveTimeline = linkedTimelines[linkedTimelines.length - 1];
      if (currentLiveTimeline !== liveTimeline) {
        setTimeline({ linkedTimelines: getLinkedTimelines(liveTimeline) });
        return;
      }

      // Check if event count is out of sync (SDK has more events than React knows about)
      const sdkEventCount = getTimelinesEventsCount(getLinkedTimelines(liveTimeline));
      const reactEventCount = eventsLengthRef.current;
      if (sdkEventCount > reactEventCount) {
        setTimeline({ linkedTimelines: getLinkedTimelines(liveTimeline) });
      }
    };

    const unsubscribe = appEvents.onVisibilityChange(handleVisibilityChange);
    return unsubscribe;
  }, [room, timeline.linkedTimelines, eventsLengthRef]);

  return {
    timeline,
    setTimeline,
    eventsLength,
    liveTimelineLinked,
    canPaginateBack,
    canPaginateForward,
    backwardStatus,
    forwardStatus,
    handleTimelinePagination,
    loadEventTimeline,
    focusItem,
    setFocusItem,
  };
}
