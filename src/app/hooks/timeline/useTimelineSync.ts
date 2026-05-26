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
) => {
  // Monotonically-increasing counter so that only the most-recently-started
  // loadEventTimeline call can commit its result.  Concurrent calls (e.g. from
  // rapid navigation or concurrent useEffect triggers) would otherwise both call
  // setFocusItem({scrollTo:true}), causing a double scroll that lands on the wrong event.
  const loadIdRef = useRef(0);

  return useCallback(
    async (eventId: string) =>
      Sentry.startSpan({ name: 'timeline.jump_load', op: 'matrix.timeline' }, async () => {
        const loadId = ++loadIdRef.current;
        const jumpLoadStart = performance.now();

        const [err, replyEvtTimeline] = await to(
          withTimeout(
            mx.getEventTimeline(room.getUnfilteredTimelineSet(), eventId),
            EVENT_TIMELINE_LOAD_TIMEOUT_MS
          )
        );
        if (!replyEvtTimeline) {
          if (loadId === loadIdRef.current) onError(err ?? null);
          return;
        }
        const linkedTimelines = getLinkedTimelines(replyEvtTimeline);
        const absIndex = getEventIdAbsoluteIndex(linkedTimelines, replyEvtTimeline, eventId);

        if (absIndex === undefined) {
          if (loadId === loadIdRef.current) onError(err ?? null);
          return;
        }

        // Validate that the loaded timeline is connected to (or contains) the live timeline.
        // If not, the SDK returned a disconnected fragment which causes "no history" or
        // "wrong order" issues when opening from notifications.
        const liveTimeline = getLiveTimeline(room);
        const containsLive = linkedTimelines.some((tl) => tl === liveTimeline);

        if (!containsLive) {
          // Disconnected fragment detected - fall back to live timeline to avoid broken view.
          // The event likely exists in the live timeline now (sync caught up), or pagination
          // will fetch it.
          Sentry.captureMessage('Loaded disconnected timeline fragment, falling back to live', {
            level: 'warning',
            extra: {
              eventId,
              fragmentLength: linkedTimelines.length,
              fragmentEventsCount: getTimelinesEventsCount(linkedTimelines),
            },
            tags: { feature: 'timeline', issue: 'disconnected_fragment' },
          });

          // Check if the event now exists in the live timeline
          const liveLinkedTimelines = getLinkedTimelines(liveTimeline);
          let liveAbsIndex = getEventIdAbsoluteIndex(
            liveLinkedTimelines,
            liveTimeline,
            eventId
          );

          // If event not found in current live timeline, try paginating backward to fetch it.
          // This handles the case where sync hasn't caught up yet but the event is on the server.
          if (liveAbsIndex === undefined) {
            Sentry.addBreadcrumb({
              category: 'timeline.jump',
              message: 'Event not in live timeline, attempting backward pagination',
              level: 'info',
              data: { eventId },
            });

            const [paginateErr] = await to(
              withTimeout(
                mx.paginateEventTimeline(liveTimeline, { backwards: true, limit: PAGINATION_LIMIT }),
                EVENT_TIMELINE_LOAD_TIMEOUT_MS
              )
            );

            if (!paginateErr) {
              // Re-check after pagination
              const refreshedLinkedTimelines = getLinkedTimelines(liveTimeline);
              liveAbsIndex = getEventIdAbsoluteIndex(
                refreshedLinkedTimelines,
                liveTimeline,
                eventId
              );

              if (liveAbsIndex !== undefined) {
                // Success! Event found after pagination
                Sentry.addBreadcrumb({
                  category: 'timeline.jump',
                  message: 'Event found after backward pagination',
                  level: 'info',
                  data: { eventId, absIndex: liveAbsIndex },
                });
                onLoad(eventId, refreshedLinkedTimelines, liveAbsIndex);

                // Proactively load context
                if (onProactiveLoad) {
                  setTimeout(() => onProactiveLoad(), 500);
                }
                return;
              }
            }
          }

          if (liveAbsIndex !== undefined) {
            // Event found in live timeline (either initially or after refresh) - use that instead
            Sentry.addBreadcrumb({
              category: 'timeline.jump',
              message: 'Using event from live timeline instead of disconnected fragment',
              level: 'info',
              data: { eventId, absIndex: liveAbsIndex },
            });
            onLoad(eventId, liveLinkedTimelines, liveAbsIndex);

            // Proactively load context
            if (onProactiveLoad) {
              setTimeout(() => onProactiveLoad(), 500);
            }
          } else {
            // Event not in live timeline even after pagination - give up gracefully
            Sentry.captureMessage('Event not found in live timeline after pagination', {
              level: 'warning',
              extra: { eventId },
              tags: { feature: 'timeline', issue: 'event_not_found' },
            });
            onError(new Error('Event timeline disconnected and not found in live timeline'));
          }
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
};

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

const useLiveTimelineRefresh = (room: Room, onRefresh: () => void, onReset?: () => void) => {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    // TimelineRefresh fires when getEventTimeline() creates a new timeline
    // context (e.g. for a history jump).  This is triggered by our own call,
    // so it has a separate handler from TimelineReset.
    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (r: Room) => {
      if (r.roomId !== room.roomId) return;
      onRefreshRef.current();
    };
    // TimelineReset fires on an external sync gap and requires different
    // handling: if we are viewing history we need to reload the event context.
    const handleTimelineReset: EventTimelineSetHandlerMap[RoomEvent.TimelineReset] = () => {
      (onResetRef.current ?? onRefreshRef.current)();
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
    }, [alive, room, scrollToBottom]),
    useCallback(() => {
      // Proactively load a batch above and below the jumped-to event so the user
      // can scroll immediately without waiting for pagination triggers.
      void handleTimelinePaginationRef.current(true); // backward
      void handleTimelinePaginationRef.current(false); // forward
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
      if (eventId) return;
      const wasAtBottom = isAtBottomRef.current;
      resetAutoScrollPendingRef.current = wasAtBottom;
      setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
      if (wasAtBottom) {
        scrollToBottom('instant');
      }
    }, [eventId, room, isAtBottomRef, scrollToBottom]),
    // TimelineReset fires on an external sync gap.  If we are viewing a
    // history event and already have it loaded (eventsLength > 0), reload so
    // the event stays visible after the gap.  If eventsLength === 0 we are
    // still loading — let the in-flight load complete instead of stacking
    // another one on top.
    useCallback(() => {
      if (eventId) {
        if (eventsLengthRef.current > 0) void loadEventTimeline(eventId);
        return;
      }
      const wasAtBottom = isAtBottomRef.current;
      resetAutoScrollPendingRef.current = wasAtBottom;
      setTimeline({ linkedTimelines: getInitialTimeline(room).linkedTimelines });
      if (wasAtBottom) {
        scrollToBottom('instant');
      }
    }, [eventId, eventsLengthRef, loadEventTimeline, room, isAtBottomRef, scrollToBottom])
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
    backwardStatus,
    forwardStatus,
    handleTimelinePagination,
    loadEventTimeline,
    focusItem,
    setFocusItem,
  };
}
