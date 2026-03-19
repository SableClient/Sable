/* eslint-disable react/destructuring-assignment */
import {
  Fragment,
  Dispatch,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Direction,
  EventTimeline,
  EventTimelineSet,
  EventTimelineSetHandlerMap,
  EventStatus,
  IContent,
  IRoomTimelineData,
  MatrixClient,
  MatrixEvent,
  PushProcessor,
  RelationType,
  Room,
  RoomEvent,
  RoomEventHandlerMap,
  ThreadEvent,
} from '$types/matrix-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import classNames from 'classnames';
import { ReactEditor } from 'slate-react';
import { Editor } from 'slate';
import { SessionMembershipData } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import to from 'await-to-js';
import * as Sentry from '@sentry/react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  as,
  Avatar,
  Badge,
  Box,
  Chip,
  color,
  config,
  ContainerColor,
  Icon,
  Icons,
  Line,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { useTranslation } from 'react-i18next';
import { VList, VListHandle } from 'virtua';
import { getMxIdLocalPart, mxcUrlToHttp, toggleReaction } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAlive } from '$hooks/useAlive';
import { editableActiveElement } from '$utils/dom';
import {
  CompactPlaceholder,
  DefaultPlaceholder,
  EventContent,
  ImageContent,
  MessageBase,
  MessageNotDecryptedContent,
  MessageUnsupportedContent,
  MSticker,
  RedactedContent,
  Reply,
  Time,
} from '$components/message';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import {
  roomHaveNotification,
  roomHaveUnread,
  canEditEvent,
  decryptAllTimelineEvent,
  getEditedEvent,
  getEventReactions,
  getLatestEditableEvt,
  getMemberAvatarMxc,
  getMemberDisplayName,
  isMembershipChanged,
  reactionOrEditEvent,
} from '$utils/room';
import { useSetting } from '$state/hooks/settings';
import { MessageLayout, settingsAtom } from '$state/settings';
import { nicknamesAtom } from '$state/nicknames';
import { useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import { useMemberEventParser } from '$hooks/useMemberEventParser';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { RoomIntro } from '$components/room-intro';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '$hooks/useIntersectionObserver';
import { markAsRead } from '$utils/notifications';
import { getResizeObserverEntry, useResizeObserver } from '$hooks/useResizeObserver';
import { inSameDay, minuteDifference, timeDayMonthYear, today, yesterday } from '$utils/time';
import { createMentionElement, isEmptyEditor, moveCursor } from '$components/editor';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { GetContentCallback, MessageEvent, StateEvent } from '$types/matrix/room';
import { useKeyDown } from '$hooks/useKeyDown';
import { useDocumentFocusChange } from '$hooks/useDocumentFocusChange';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { useRoomUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { UserAvatar } from '$components/user-avatar';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { createDebugLogger } from '$utils/debugLogger';
import * as css from './RoomTimeline.css';
import { EncryptedContent, Event, ForwardedMessageProps, Message, Reactions } from './message';

const debugLog = createDebugLogger('RoomTimeline');

const TimelineFloat = as<'div', css.TimelineFloatVariants>(
  ({ position, className, ...props }, ref) => (
    <Box
      className={classNames(css.TimelineFloat({ position }), className)}
      justifyContent="Center"
      alignItems="Center"
      gap="200"
      {...props}
      ref={ref}
    />
  )
);

const TimelineDivider = as<'div', { variant?: ContainerColor | 'Inherit' }>(
  ({ variant, children, ...props }, ref) => (
    <Box gap="100" justifyContent="Center" alignItems="Center" {...props} ref={ref}>
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
      {children}
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
    </Box>
  )
);

export const getLiveTimeline = (room: Room): EventTimeline =>
  room.getUnfilteredTimelineSet().getLiveTimeline();

export const getEventTimeline = (room: Room, eventId: string): EventTimeline | undefined => {
  const timelineSet = room.getUnfilteredTimelineSet();
  return timelineSet.getTimelineForEvent(eventId) ?? undefined;
};

export const getFirstLinkedTimeline = (
  timeline: EventTimeline,
  direction: Direction
): EventTimeline => {
  const linkedTm = timeline.getNeighbouringTimeline(direction);
  if (!linkedTm) return timeline;
  return getFirstLinkedTimeline(linkedTm, direction);
};

export const getLinkedTimelines = (timeline: EventTimeline): EventTimeline[] => {
  const firstTimeline = getFirstLinkedTimeline(timeline, Direction.Backward);
  const timelines: EventTimeline[] = [];

  for (
    let nextTimeline: EventTimeline | null = firstTimeline;
    nextTimeline;
    nextTimeline = nextTimeline.getNeighbouringTimeline(Direction.Forward)
  ) {
    timelines.push(nextTimeline);
  }
  return timelines;
};

export const timelineToEventsCount = (t: EventTimeline) => {
  if (!t) return 0;
  const events = t.getEvents();
  return events ? events.length : 0;
};

export const getTimelinesEventsCount = (timelines: EventTimeline[]): number => {
  const timelineEventCountReducer = (count: number, tm: EventTimeline) =>
    count + timelineToEventsCount(tm);
  return (timelines || [])
    .filter(Boolean)
    .reduce((accumulator, element) => timelineEventCountReducer(accumulator, element), 0);
};

export const getTimelineAndBaseIndex = (
  timelines: EventTimeline[],
  index: number
): [EventTimeline | undefined, number] => {
  let uptoTimelineLen = 0;
  const validTimelines = (timelines || []).filter(Boolean);

  const timeline = validTimelines.find((t) => {
    const events = t.getEvents();
    if (!events) return false;

    uptoTimelineLen += events.length;
    return index < uptoTimelineLen;
  });

  if (!timeline) return [undefined, 0];

  const events = timeline.getEvents();
  const timelineLen = events ? events.length : 0;

  return [timeline, Math.max(0, uptoTimelineLen - timelineLen)];
};

export const getTimelineRelativeIndex = (absoluteIndex: number, timelineBaseIndex: number) =>
  absoluteIndex - timelineBaseIndex;

export const getTimelineEvent = (
  timeline: EventTimeline,
  index: number
): MatrixEvent | undefined => {
  if (!timeline) return undefined;
  const events = timeline.getEvents();
  return events ? events[index] : undefined;
};

export const getEventIdAbsoluteIndex = (
  timelines: EventTimeline[],
  eventTimeline: EventTimeline,
  eventId: string
): number | undefined => {
  const timelineIndex = timelines.indexOf(eventTimeline);
  if (timelineIndex === -1) return undefined;

  const currentEvents = eventTimeline.getEvents();
  if (!currentEvents) return undefined;

  const eventIndex = currentEvents.findIndex((evt: MatrixEvent) => evt.getId() === eventId);
  if (eventIndex === -1) return undefined;

  const baseIndex = timelines.slice(0, timelineIndex).reduce((accValue, timeline) => {
    const evs = timeline.getEvents();
    return (evs ? evs.length : 0) + accValue;
  }, 0);

  return baseIndex + eventIndex;
};

type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  roomInputRef: RefObject<HTMLElement>;
  editor: Editor;
  onEditorReset?: () => void;
};

const PAGINATION_LIMIT = 60;
const EVENT_TIMELINE_LOAD_TIMEOUT_MS = 12000;

type PaginationStatus = 'idle' | 'loading' | 'error';

type Timeline = {
  linkedTimelines: EventTimeline[];
};

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
        const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
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
      }), // end startSpan
    [mx, room, onLoad, onError]
  );

const useTimelinePagination = (
  mx: MatrixClient,
  timeline: Timeline,
  setTimeline: Dispatch<SetStateAction<Timeline>>,
  limit: number
) => {
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const alive = useAlive();
  const [backwardStatus, setBackwardStatus] = useState<PaginationStatus>('idle');
  const [forwardStatus, setForwardStatus] = useState<PaginationStatus>('idle');

  const paginate = useMemo(() => {
    let fetching = false;

    const recalibratePagination = (
      linkedTimelines: EventTimeline[],
      timelinesEventsCount: number[],
      backwards: boolean
    ) => {
      const topTimeline = linkedTimelines[0];
      const timelineMatch = (mt: EventTimeline) => (t: EventTimeline) => t === mt;

      const newLTimelines = getLinkedTimelines(topTimeline);
      const topTmIndex = newLTimelines.findIndex(timelineMatch(topTimeline));
      const topAddedTm = topTmIndex === -1 ? [] : newLTimelines.slice(0, topTmIndex);

      // virtua renders all loaded events; no render-window range to offset
      setTimeline(() => ({ linkedTimelines: newLTimelines }));
    };

    return async (backwards: boolean) => {
      if (fetching) return;
      const { linkedTimelines: lTimelines } = timelineRef.current;
      const timelinesEventsCount = lTimelines.map(timelineToEventsCount);

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
        recalibratePagination(lTimelines, timelinesEventsCount, backwards);
        return;
      }

      fetching = true;
      if (alive()) {
        (backwards ? setBackwardStatus : setForwardStatus)('loading');
        debugLog.info('timeline', 'Timeline pagination started', {
          direction: backwards ? 'backward' : 'forward',
          eventsLoaded: getTimelinesEventsCount(lTimelines),
          hasToken: !!paginationToken,
        });
      }
      try {
        const paginateStart = performance.now();
        const [err] = await to(
          mx.paginateEventTimeline(timelineToPaginate, {
            backwards,
            limit,
          })
        );
        if (err) {
          if (alive()) {
            (backwards ? setBackwardStatus : setForwardStatus)('error');
            Sentry.metrics.count('sable.pagination.error', 1, {
              attributes: { direction: backwards ? 'backward' : 'forward' },
            });
            debugLog.error('timeline', 'Timeline pagination failed', {
              direction: backwards ? 'backward' : 'forward',
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        const fetchedTimeline =
          timelineToPaginate.getNeighbouringTimeline(
            backwards ? Direction.Backward : Direction.Forward
          ) ?? timelineToPaginate;
        // Decrypt all event ahead of render cycle
        const roomId = fetchedTimeline.getRoomId();
        const room = roomId ? mx.getRoom(roomId) : null;

        if (room?.hasEncryptionStateEvent()) {
          await to(decryptAllTimelineEvent(mx, fetchedTimeline));
        }

        if (alive()) {
          recalibratePagination(lTimelines, timelinesEventsCount, backwards);
          (backwards ? setBackwardStatus : setForwardStatus)('idle');
          Sentry.metrics.distribution(
            'sable.pagination.latency_ms',
            performance.now() - paginateStart,
            {
              attributes: {
                direction: backwards ? 'backward' : 'forward',
                encrypted: String(!!room?.hasEncryptionStateEvent()),
              },
            }
          );
          debugLog.info('timeline', 'Timeline pagination completed', {
            direction: backwards ? 'backward' : 'forward',
            totalEventsNow: getTimelinesEventsCount(lTimelines),
          });
        }
      } finally {
        fetching = false;
      }
    };
  }, [mx, alive, setTimeline, limit, setBackwardStatus, setForwardStatus]);

  return { paginate, backwardStatus, forwardStatus };
};

const useLiveEventArrive = (room: Room, onArrive: (mEvent: MatrixEvent) => void) => {
  // Stable ref so the effect dep array only contains `room`. The listener is
  // registered once per room mount; onArrive can change freely without causing
  // listener churn during rapid re-renders (e.g. sync error/retry cycles).
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    // Capture the live timeline and registration time. Events appended to the
    // live timeline AFTER this point can be genuinely new even when
    // liveEvent=false (older sliding sync proxies that omit num_live).
    const liveTimeline = getLiveTimeline(room);
    const registeredAt = Date.now();
    const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (
      mEvent: MatrixEvent,
      eventRoom: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      // Standard sync: liveEvent=true for real-time events.
      // Sliding sync fallback: liveEvent=false on buggy proxies. Treat events
      // on the live timeline as new only when their server timestamp is within
      // 60 s before registration — this filters out initial-sync backfill that
      // happens to fire after mount while excluding genuine reconnect messages.
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
  }, [room]); // stable: re-register only when room changes, not on callback identity changes
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
      // Live Replace events are handled by useLiveEventArrive re-render.
      // Non-live Replace events (bundled/historical edits from sliding sync)
      // also need to trigger a re-render so makeReplaced state is reflected.
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
      // App-initiated full reinit (e.g. from refreshLiveTimeline()). Rare in normal usage.
      debugLog.debug('timeline', 'TimelineRefresh: app-initiated live timeline reinit', {
        roomId: room.roomId,
        trigger: 'TimelineRefresh',
      });
      onRefreshRef.current();
    };
    // The SDK fires RoomEvent.TimelineReset on the EventTimelineSet (not the Room)
    // when a limited sync response replaces the live EventTimeline with a fresh one.
    // This happens in classic /sync on limited=true (gap after idle/reconnect) AND in
    // sliding sync when the proxy sends a limited room update.
    const handleTimelineReset: EventTimelineSetHandlerMap[RoomEvent.TimelineReset] = () => {
      debugLog.info('timeline', 'TimelineReset: SDK-initiated (limited sync / sync gap)', {
        roomId: room.roomId,
        trigger: 'TimelineReset',
        liveTimelineEvents: room.getUnfilteredTimelineSet().getLiveTimeline().getEvents().length,
      });
      Sentry.metrics.count('sable.timeline.limited_reset', 1);
      Sentry.addBreadcrumb({
        category: 'timeline.sync',
        message: 'TimelineReset: limited sync gap',
        level: 'info',
        data: { roomId: room.roomId },
      });
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

// Trigger re-render when thread reply counts change so the thread chip updates.
const useThreadUpdate = (room: Room, onUpdate: () => void) => {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    // Stable wrapper: the same function identity is kept for the lifetime of
    // the room so add/removeListener calls always match.
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

// Returns the number of replies in a thread, counting actual reply events
// (excluding the root event, reactions, and edits) from the live timeline.
// Always uses timeline-based counting for accuracy and live updates.
const getThreadReplyCount = (room: Room, mEventId: string): number =>
  room
    .getUnfilteredTimelineSet()
    .getLiveTimeline()
    .getEvents()
    .filter(
      (ev) => ev.threadRootId === mEventId && ev.getId() !== mEventId && !reactionOrEditEvent(ev)
    ).length;

type ThreadReplyChipProps = {
  room: Room;
  mEventId: string;
  openThreadId: string | undefined;
  onToggle: () => void;
};

function ThreadReplyChip({
  room,
  mEventId,
  openThreadId,
  onToggle,
}: Readonly<ThreadReplyChipProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);

  const replyEvents = room
    .getUnfilteredTimelineSet()
    .getLiveTimeline()
    .getEvents()
    .filter(
      (ev) => ev.threadRootId === mEventId && ev.getId() !== mEventId && !reactionOrEditEvent(ev)
    );

  const replyCount = replyEvents.length;
  if (replyCount === 0) return null;

  const uniqueSenders: string[] = [];
  const seen = new Set<string>();
  replyEvents.forEach((ev) => {
    const s = ev.getSender();
    if (s && !seen.has(s)) {
      seen.add(s);
      uniqueSenders.push(s);
    }
  });

  const latestReply = replyEvents.at(-1);
  const latestSenderId = latestReply?.getSender() ?? '';
  const latestSenderName =
    getMemberDisplayName(room, latestSenderId, nicknames) ??
    getMxIdLocalPart(latestSenderId) ??
    latestSenderId;
  const latestBody = (latestReply?.getContent()?.body as string | undefined) ?? '';

  const isOpen = openThreadId === mEventId;

  return (
    <Chip
      size="400"
      variant={isOpen ? 'Primary' : 'SurfaceVariant'}
      radii="300"
      before={
        <Box alignItems="Center" style={{ gap: 0 }}>
          {uniqueSenders.slice(0, 3).map((senderId, index) => {
            const avatarMxc = getMemberAvatarMxc(room, senderId);
            const avatarUrl = avatarMxc
              ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 20, 20, 'crop') ?? undefined)
              : undefined;
            const displayName =
              getMemberDisplayName(room, senderId, nicknames) ??
              getMxIdLocalPart(senderId) ??
              senderId;
            return (
              <Avatar key={senderId} size="200" style={{ marginLeft: index > 0 ? '-4px' : 0 }}>
                <UserAvatar
                  userId={senderId}
                  src={avatarUrl}
                  alt={displayName}
                  renderFallback={() => (
                    <span style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1 }}>
                      {displayName[0]?.toUpperCase() ?? '?'}
                    </span>
                  )}
                />
              </Avatar>
            );
          })}
        </Box>
      }
      onClick={onToggle}
      style={{ marginTop: config.space.S200 }}
    >
      <Text size="T300" style={{ whiteSpace: 'nowrap' }}>
        {replyCount}&nbsp;{replyCount === 1 ? 'reply' : 'replies'}
      </Text>
      {latestBody && (
        <Text
          size="T300"
          style={{
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: toRem(180),
          }}
        >
          &nbsp;·&nbsp;{latestSenderName}:&nbsp;{latestBody.slice(0, 60)}
        </Text>
      )}
    </Chip>
  );
}

const getInitialTimeline = (room: Room) => {
  const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
  return { linkedTimelines };
};

const getEmptyTimeline = () => ({
  linkedTimelines: [],
});

const getRoomUnreadInfo = (room: Room, scrollTo = false) => {
  if (!roomHaveNotification(room) && !roomHaveUnread(room.client, room)) return undefined;

  const readUptoEventId = room.getEventReadUpTo(room.client.getUserId() ?? '');
  if (!readUptoEventId) return undefined;
  const evtTimeline = getEventTimeline(room, readUptoEventId);
  const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
  return {
    readUptoEventId,
    inLiveTimeline: latestTimeline === room.getLiveTimeline(),
    scrollTo,
  };
};

export function RoomTimeline({
  room,
  eventId,
  roomInputRef,
  editor,
  onEditorReset,
}: Readonly<RoomTimelineProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const pushProcessor = useMemo(() => new PushProcessor(mx), [mx]);
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const showUrlPreview = room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview;
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [showTombstoneEvents] = useSetting(settingsAtom, 'showTombstoneEvents');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const [autoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');
  const [autoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');

  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);
  const nicknames = useAtomValue(nicknamesAtom);

  const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(room.roomId));
  const replyDraft = useAtomValue(roomIdToReplyDraftAtomFamily(room.roomId));
  const activeReplyId = replyDraft?.eventId;
  const openThreadId = useAtomValue(roomIdToOpenThreadAtomFamily(room.roomId));
  const setOpenThread = useSetAtom(roomIdToOpenThreadAtomFamily(room.roomId));
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const permissions = useRoomPermissions(creators, powerLevels);

  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(MessageEvent.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(MessageEvent.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent(StateEvent.RoomPinnedEvents, mx.getSafeUserId());
  const [editId, setEditId] = useState<string>();

  const globalProfiles = useAtomValue(profilesCacheAtom);

  const roomToParents = useAtomValue(roomToParentsAtom);
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const { navigateRoom } = useRoomNavigate();
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();
  const openUserRoomProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();

  const imagePackRooms: Room[] = useImagePackRooms(room.roomId, roomToParents);

  const [unreadInfo, setUnreadInfo] = useState(() => getRoomUnreadInfo(room, true));
  // Stable ref so listeners that only need to *read* unreadInfo don't force
  // effect re-registration (and listener churn) every time a new message arrives.
  const unreadInfoRef = useRef(unreadInfo);
  unreadInfoRef.current = unreadInfo;
  const readUptoEventIdRef = useRef<string>();
  if (unreadInfo) {
    readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  }

  // TODO: The return value of "useState" should be destructured and named symmetrically (typescript:S6754)
  const [atBottom, setAtBottomState] = useState<boolean>(true);
  const atBottomRef = useRef(atBottom);
  // Tracks when atBottom last changed so we can detect rapid true→false flips
  // (characteristic of the IO false-positive on bulk event loads).
  const atBottomLastChangedRef = useRef<number>(0);
  const setAtBottom = useCallback(
    (val: boolean) => {
      setAtBottomState(val);
      const now = Date.now();
      const msSincePrevious = now - atBottomLastChangedRef.current;
      atBottomLastChangedRef.current = now;
      Sentry.addBreadcrumb({
        category: 'ui.scroll',
        message: val ? 'Timeline: scrolled to bottom' : 'Timeline: scrolled away from bottom',
        level: 'info',
        data: { roomId: room.roomId, msSincePrevious },
      });
      // Rapid flip: bottom→away within 200 ms is characteristic of the known
      // IntersectionObserver false-positive triggered by bulk event loads causing
      // a DOM layout shift (see memory: "RoomTimeline Stay at Bottom False-Positive").
      if (!val && msSincePrevious < 200) {
        Sentry.captureMessage('Timeline: rapid atBottom flip (possible spurious scroll reset)', {
          level: 'warning',
          extra: { roomId: room.roomId, msSincePrevious },
          tags: { feature: 'timeline' },
        });
      }
      atBottomRef.current = val;
    },
    [room.roomId]
  );

  // Set to true by the useLiveTimelineRefresh callback when the timeline is
  // re-initialised (TimelineRefresh or TimelineReset). Allows the range self-heal
  // effect below to run even when atBottom=false, so the virtual paginator window
  // is restored to the live end without forcing a viewport scroll.
  const timelineJustResetRef = useRef(false);

  const scrollToBottomRef = useRef({
    count: 0,
    smooth: true,
  });

  const [focusItem, setFocusItem] = useState<
    | {
        index: number;
        scrollTo: boolean;
        highlight: boolean;
      }
    | undefined
  >();
  const alive = useAlive();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(
          mx,
          room.roomId,
          href,
          makeMentionCustomProps(mentionClickHandler),
          nicknames
        )
      ),
    }),
    [mx, room, mentionClickHandler, nicknames]
  );
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        nicknames,
        autoplayEmojis,
      }),
    [
      mx,
      room,
      linkifyOpts,
      autoplayEmojis,
      spoilerClickHandler,
      mentionClickHandler,
      useAuthentication,
      nicknames,
    ]
  );
  const parseMemberEvent = useMemberEventParser();

  const [timeline, setTimeline] = useState<Timeline>(() =>
    eventId ? getEmptyTimeline() : getInitialTimeline(room)
  );
  const eventsLength = getTimelinesEventsCount(timeline.linkedTimelines);
  const liveTimelineLinked = timeline.linkedTimelines.at(-1) === getLiveTimeline(room);

  // Track previous eventsLength so we can calculate batch sizes.
  const prevEventsLengthRef = useRef(eventsLength);

  // Breadcrumb every time the timeline gains events so we can correlate message
  // batches (sliding sync chunks) with scroll state changes in Sentry Replay.
  useEffect(() => {
    const prev = prevEventsLengthRef.current;
    const delta = eventsLength - prev;
    prevEventsLengthRef.current = eventsLength;

    if (delta === 0) return;

    const isBatch = delta > 1;
    // Classify by size: single new message vs small batch vs large catch-up load
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
        atBottom: atBottomRef.current,
      },
    });

    // A large batch (> 50) while liveTimelineLinked is the sliding-sync
    // adaptive load pattern that can trigger the IO false-positive scroll reset.
    // Capture a warning so it's searchable in Sentry even when no reset fires.
    if (delta > 50 && liveTimelineLinked) {
      Sentry.captureMessage('Timeline: large event batch from sliding sync', {
        level: 'warning',
        extra: { delta, eventsLength, atBottom: atBottomRef.current },
        tags: { feature: 'timeline', batchSize },
      });
    }
    // atBottomRef is intentionally read at effect time, not as a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLength, liveTimelineLinked]);

  // Log timeline component mount/unmount
  useEffect(() => {
    const mode = eventId ? 'jump' : 'live';
    Sentry.metrics.count('sable.timeline.open', 1, { attributes: { mode } });
    debugLog.info('timeline', 'Timeline mounted', {
      roomId: room.roomId,
      eventId,
      initialEventsCount: eventsLength,
      liveTimelineLinked,
    });
    return () => {
      debugLog.info('timeline', 'Timeline unmounted', { roomId: room.roomId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.roomId, eventId]); // Only log on mount/unmount - intentionally capturing initial values

  // Log live timeline linking state changes
  useEffect(() => {
    debugLog.debug('timeline', 'Live timeline link state changed', {
      roomId: room.roomId,
      liveTimelineLinked,
      eventsLength,
    });
  }, [liveTimelineLinked, room.roomId, eventsLength]);
  const canPaginateBack =
    typeof timeline.linkedTimelines[0]?.getPaginationToken(Direction.Backward) === 'string';
  // With virtua, all loaded events are always rendered; range concept is gone.
  const rangeAtStart = true;
  const rangeAtEnd = true;
  const atLiveEndRef = useRef(liveTimelineLinked);
  atLiveEndRef.current = liveTimelineLinked;
  // Stable refs for handleVListRangeChange — declared here so they are available
  // before the callback is defined, and updated every render.
  const canPaginateBackRef = useRef(false);
  const liveTimelineLinkedRef = useRef(false);
  // Keep refs in sync for handleVListRangeChange (which cannot close over these
  // without adding them to its dep array and recreating the callback).
  canPaginateBackRef.current = canPaginateBack;
  liveTimelineLinkedRef.current = liveTimelineLinked;

  const {
    paginate: handleTimelinePagination,
    backwardStatus,
    forwardStatus,
  } = useTimelinePagination(mx, timeline, setTimeline, PAGINATION_LIMIT);

  const vListRef = useRef<VListHandle>(null);

  // shift=true while a backward pagination is in flight so VList maintains scroll
  // position when historical events are prepended to the list.
  // useLayoutEffect ensures shift is true DURING the render that shows new items.
  const [shift, setShift] = useState(false);
  const prevBackwardStatusRef = useRef<PaginationStatus>('idle');
  useLayoutEffect(() => {
    const prev = prevBackwardStatusRef.current;
    prevBackwardStatusRef.current = backwardStatus;
    if (backwardStatus === 'loading') {
      setShift(true);
    } else if (prev === 'loading' && backwardStatus === 'idle' && shift) {
      // New items have been rendered with shift=true; turn it off next frame.
      setShift(false);
    }
  }, [backwardStatus, shift]);

  // Stable eventsLength ref for callbacks that must not capture stale closures.
  const eventsLengthRef = useRef(eventsLength);
  eventsLengthRef.current = eventsLength;

  // Scroll to a specific event index in VList.
  // eventOffset accounts for any leading non-event VList items (currently 0).
  const scrollToItem = useCallback(
    (index: number, opts?: { align?: 'start' | 'center' | 'end'; behavior?: string; stopInView?: boolean }): boolean => {
      if (index < 0 || index >= eventsLengthRef.current) return false;
      const v = vListRef.current;
      if (!v) return false;
      if (opts?.stopInView) {
        const itemOffset = v.getItemOffset(index);
        if (itemOffset >= v.scrollOffset && itemOffset < v.scrollOffset + v.viewportSize) {
          return false;
        }
      }
      v.scrollToIndex(index, {
        align: opts?.align,
        smooth: opts?.behavior === 'smooth',
      });
      return true;
    },
    []
  );

  // Scroll to an arbitrary DOM element by resolving its parent message-item index.
  const scrollToElement = useCallback(
    (element: HTMLElement, opts?: { align?: 'start' | 'center' | 'end'; behavior?: string; stopInView?: boolean }): boolean => {
      const messageItem = element.closest<HTMLElement>('[data-message-item]');
      const indexStr = messageItem?.getAttribute('data-message-item');
      if (!indexStr) return false;
      const index = parseInt(indexStr, 10);
      if (Number.isNaN(index)) return false;
      return scrollToItem(index, opts);
    },
    [scrollToItem]
  );

  // VList onRangeChange: trigger server-side pagination when user scrolls to
  // the edges of the loaded event window.
  // Guards prevent redundant server calls when the timeline is already at its
  // natural end (live or backward) — the paginate function has an internal
  // `fetching` mutex but avoiding the call entirely is cleaner.
  const handleVListRangeChange = useCallback(
    (startIndex: number, endIndex: number) => {
      if (startIndex === 0 && canPaginateBackRef.current) {
        handleTimelinePagination(true);
      }
      if (endIndex >= eventsLengthRef.current - 1 && !liveTimelineLinkedRef.current) {
        handleTimelinePagination(false);
      }
    },
    [handleTimelinePagination]
  );

  // VList onScroll: derive atBottom from scroll position rather than an
  // IntersectionObserver, which avoids false-positive flips on bulk loads.
  // Also trigger paginate-forward when user scrolls near the bottom but the
  // live timeline is not yet linked (historical navigation).
  const handleVListScroll = useCallback(
    (offset: number) => {
      const v = vListRef.current;
      if (!v) return;
      const distanceFromBottom = v.scrollSize - offset - v.viewportSize;
      const isNowAtBottom = distanceFromBottom < 100;
      if (isNowAtBottom !== atBottomRef.current) {
        setAtBottom(isNowAtBottom);
        if (isNowAtBottom && atLiveEndRef.current && document.hasFocus()) {
          tryAutoMarkAsRead();
        }
      }
      // Paginate: near top → backward, near bottom → forward (historical nav)
      if (offset < 500 && canPaginateBackRef.current) {
        handleTimelinePagination(true);
      }
      if (distanceFromBottom < 500 && !liveTimelineLinkedRef.current) {
        handleTimelinePagination(false);
      }
    },
    // tryAutoMarkAsRead and setAtBottom are stable callbacks; atBottomRef and
    // atLiveEndRef are refs so they don't change identity across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleTimelinePagination]
  );

  const loadEventTimeline = useEventTimelineLoader(
    mx,
    room,
    useCallback(
      (evtId, lTimelines, evtAbsIndex) => {
        if (!alive()) return;
        const evLength = getTimelinesEventsCount(lTimelines);

        debugLog.info('timeline', 'Loading event timeline', {
          roomId: room.roomId,
          eventId: evtId,
          totalEvents: evLength,
          focusIndex: evtAbsIndex,
        });

        setAtBottom(false);
        setFocusItem({
          index: evtAbsIndex,
          scrollTo: true,
          highlight: evtId !== readUptoEventIdRef.current,
        });
        // virtua renders all loaded events so we only need to store the timelines.
        setTimeline({ linkedTimelines: lTimelines });
      },
      [alive, setAtBottom, room.roomId]
    ),
    useCallback(() => {
      if (!alive()) return;
      debugLog.info('timeline', 'Resetting timeline to initial state', { roomId: room.roomId });
      setTimeline(getInitialTimeline(room));
      scrollToBottomRef.current.count += 1;
      scrollToBottomRef.current.smooth = false;
    }, [alive, room])
  );

  useLiveEventArrive(
    room,
    useCallback(
      (mEvt: MatrixEvent) => {
        // Thread reply events are re-emitted from the Thread to the Room and
        // must not increment the main timeline range or scroll it.
        // useThreadUpdate handles the chip re-render for these events.
        if (mEvt.threadRootId !== undefined) return;

        // if user is at bottom of timeline
        // keep paginating timeline and conditionally mark as read
        // otherwise we update timeline without paginating
        // so timeline can be updated with evt like: edits, reactions etc
        if (atBottomRef.current && atLiveEndRef.current) {
          if (
            document.hasFocus() &&
            (!unreadInfoRef.current || mEvt.getSender() === mx.getUserId())
          ) {
            // Check if the document is in focus (user is actively viewing the app),
            // and either there are no unread messages or the latest message is from the current user.
            // If either condition is met, trigger the markAsRead function to send a read receipt.
            requestAnimationFrame(() => markAsRead(mx, mEvt.getRoomId()!, hideReads));
          }

          if (!document.hasFocus() && !unreadInfoRef.current) {
            setUnreadInfo(getRoomUnreadInfo(room));
          }

          scrollToBottomRef.current.count += 1;
          // Use instant scroll when the current user sent the message
          // to avoid Android WebView smooth-scroll not reaching bottom.
          scrollToBottomRef.current.smooth = mEvt.getSender() !== mx.getUserId();

          // virtua derives eventsLength from linkedTimelines automatically; just
          // trigger a re-render so the VList count prop updates.
          setTimeline((ct) => ({ ...ct }));
          return;
        }
        setTimeline((ct) => ({ ...ct }));
        if (!unreadInfoRef.current) {
          setUnreadInfo(getRoomUnreadInfo(room));
        }
      },
      [mx, room, hideReads]
    )
  );

  useEffect(() => {
    const handleLocalEchoUpdated: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      _mEvent: MatrixEvent,
      eventRoom: Room | undefined
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      if (_mEvent.getAssociatedStatus() === EventStatus.NOT_SENT) {
        Sentry.metrics.count('sable.message.send_failed', 1);
      }
      setTimeline((ct) => ({ ...ct }));
      if (!unreadInfoRef.current) {
        setUnreadInfo(getRoomUnreadInfo(room));
      }
    };

    room.on(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    return () => {
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    };
  }, [room, setTimeline, setUnreadInfo]);

  const handleOpenEvent = useCallback(
    async (
      evtId: string,
      highlight = true,
      onScroll: ((scrolled: boolean) => void) | undefined = undefined
    ) => {
      debugLog.info('timeline', 'Jumping to event', {
        roomId: room.roomId,
        eventId: evtId,
        highlight,
      });

      const evtTimeline = getEventTimeline(room, evtId);
      const absoluteIndex =
        evtTimeline && getEventIdAbsoluteIndex(timeline.linkedTimelines, evtTimeline, evtId);

      if (typeof absoluteIndex === 'number') {
        setAtBottom(false);

        const scrolled = scrollToItem(absoluteIndex, {
          behavior: reducedMotion ? 'instant' : 'smooth',
          align: 'center',
          stopInView: true,
        });
        if (onScroll) onScroll(scrolled);
        setFocusItem({
          index: absoluteIndex,
          scrollTo: !scrolled,
          highlight,
        });
        debugLog.debug('timeline', 'Event found in current timeline', {
          roomId: room.roomId,
          eventId: evtId,
          index: absoluteIndex,
        });
      } else {
        debugLog.debug('timeline', 'Event not in current timeline, loading timeline', {
          roomId: room.roomId,
          eventId: evtId,
        });
        loadEventTimeline(evtId);
      }
    },
    [room, timeline, scrollToItem, loadEventTimeline, reducedMotion, setAtBottom]
  );

  useLiveTimelineRefresh(
    room,
    useCallback(() => {
      // Always reinitialize on TimelineRefresh/TimelineReset. With sliding sync,
      // a limited response replaces the room's live EventTimeline with a brand-new
      // object. At that moment liveTimelineLinked is stale-false (stored
      // linkedTimelines reference the old detached chain), so any guard on that
      // flag would skip reinit, causing back-pagination to no-op silently and the
      // room to appear frozen. Unconditional reinit is correct: both events signal
      // that stored range/indices against the old chain are invalid.
      //
      // Only force the viewport to the bottom if the user was already there.
      // When the user has scrolled up to read history and a sync gap fires, we
      // must still reinit (the old timeline is gone), but scrolling them back to
      // the bottom is jarring. Instead we set timelineJustResetRef=true so the
      // self-heal effect below can advance the range as events arrive on the fresh
      // timeline, without atBottom=true being required.
      //
      // Also force atBottom=true and queue a scroll-to-bottom. The SDK fires
      // TimelineRefresh before adding new events to the fresh live timeline, so
      // getInitialTimeline captures range.end=0. Once events arrive the
      // rangeAtEnd self-heal useEffect needs atBottom=true to run; the
      // IntersectionObserver may have transiently fired isIntersecting=false
      // during the render transition, leaving atBottom=false and causing the
      // "Jump to Latest" button to stick permanently. Forcing atBottom here is
      // correct: TimelineRefresh always reinits to the live end, so the user
      // should be repositioned to the bottom regardless.
      Sentry.metrics.count('sable.timeline.reinit', 1);

      // When the user WAS at the bottom we still call setAtBottom(true) so a
      // transient isIntersecting=false from the IntersectionObserver during the
      // DOM transition cannot stick the "Jump to Latest" button on-screen.
      debugLog.info('timeline', 'Live timeline refresh triggered', { roomId: room.roomId });
      const wasAtBottom = atBottomRef.current;
      timelineJustResetRef.current = true;
      setTimeline(getInitialTimeline(room));
      if (wasAtBottom) {
        setAtBottom(true);
        scrollToBottomRef.current.count += 1;
        scrollToBottomRef.current.smooth = false;
      }
    }, [room, setAtBottom])
  );

  // Re-render when non-live Replace relations arrive (bundled/historical edits
  // from sliding sync that wouldn't otherwise trigger a timeline update).
  useRelationUpdate(
    room,
    useCallback(() => {
      setTimeline((ct) => ({ ...ct }));
    }, [])
  );

  // Re-render when thread reply counts change (new reply or thread update) so
  // the thread chip on root messages reflects the correct count.
  useThreadUpdate(
    room,
    useCallback(() => {
      setTimeline((ct) => ({ ...ct }));
    }, [])
  );

  // When new events arrive at the live end and the user is at the bottom (or a
  // timeline reset just happened), queue a scroll-to-bottom so VList keeps the
  // latest message in view. With virtua, all loaded events are always rendered —
  // there is no range to expand, just a scroll to trigger.
  useEffect(() => {
    const resetPending = timelineJustResetRef.current;
    if ((atBottom || resetPending) && liveTimelineLinked && eventsLength > 0) {
      if (resetPending) timelineJustResetRef.current = false;
      scrollToBottomRef.current.count += 1;
      scrollToBottomRef.current.smooth = false;
      Sentry.addBreadcrumb({
        category: 'ui.scroll',
        message: 'Timeline: stay-at-bottom scroll (new events)',
        level: 'info',
        data: { eventsLength, wasReset: resetPending, atBottom },
      });
    }
  }, [atBottom, liveTimelineLinked, eventsLength]);

  // Recover from transient empty timeline state when the live timeline
  // already has events (can happen when opening by event id, then fallbacking).
  useEffect(() => {
    if (eventId) return;
    if (timeline.linkedTimelines.length > 0) return;
    if (getLiveTimeline(room).getEvents().length === 0) return;
    setTimeline(getInitialTimeline(room));
  }, [eventId, room, timeline.linkedTimelines.length]);

  // Stay at bottom when room editor resize
  useResizeObserver(
    useMemo(() => {
      let mounted = false;
      return (entries) => {
        if (!mounted) {
          // skip initial mounting call
          mounted = true;
          return;
        }
        if (!roomInputRef.current) return;
        const editorBaseEntry = getResizeObserverEntry(roomInputRef.current, entries);
        if (!editorBaseEntry) return;

        if (atBottomRef.current) {
          vListRef.current?.scrollToIndex(eventsLengthRef.current - 1, { align: 'end' });
        }
      };
    }, [roomInputRef]),
    useCallback(() => roomInputRef.current, [roomInputRef])
  );

  const tryAutoMarkAsRead = useCallback(() => {
    const readUptoEventId = readUptoEventIdRef.current;
    if (!readUptoEventId) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
      return;
    }
    const evtTimeline = getEventTimeline(room, readUptoEventId);
    const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
    if (latestTimeline === room.getLiveTimeline()) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
    }
  }, [mx, room, hideReads]);


  useDocumentFocusChange(
    useCallback(
      (inFocus) => {
        if (inFocus && atBottomRef.current) {
          tryAutoMarkAsRead();
        }
      },
      [tryAutoMarkAsRead]
    )
  );

  // Handle up arrow edit
  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (
          isKeyHotkey('arrowup', evt) &&
          editableActiveElement() &&
          document.activeElement?.getAttribute('data-editable-name') === 'RoomInput' &&
          isEmptyEditor(editor)
        ) {
          const editableEvt = getLatestEditableEvt(room.getLiveTimeline(), (mEvt) =>
            canEditEvent(mx, mEvt)
          );
          const editableEvtId = editableEvt?.getId();
          if (!editableEvtId) return;
          setEditId(editableEvtId);
          evt.preventDefault();
        }
      },
      [mx, room, editor]
    )
  );

  // Keep a stable ref so timeline state updates (new messages arriving) don't
  // cause handleOpenEvent to rebuild and re-trigger this effect, yanking the
  // user back to the notification event on every incoming message.
  // We only want to scroll once per unique eventId value.
  const handleOpenEventRef = useRef(handleOpenEvent);
  handleOpenEventRef.current = handleOpenEvent;

  useEffect(() => {
    if (eventId) {
      handleOpenEventRef.current(eventId);
    }
  }, [eventId]); // handleOpenEvent intentionally omitted — use ref above

  // Scroll to bottom on initial timeline load.
  // VList handles scroll, so we use scrollToIndex rather than scrollToBottom.
  useLayoutEffect(() => {
    if (eventsLength > 0) {
      vListRef.current?.scrollToIndex(eventsLength - 1, { align: 'end' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // virtua's VList has its own internal ResizeObserver for item height changes
  // (e.g. media loads), so the explicit media ResizeObserver is no longer needed.

  // if live timeline is linked and unreadInfo change
  // Scroll to last read message
  useLayoutEffect(() => {
    const { readUptoEventId, inLiveTimeline, scrollTo } = unreadInfo ?? {};
    if (readUptoEventId && inLiveTimeline && scrollTo) {
      const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
      const evtTimeline = getEventTimeline(room, readUptoEventId);
      const absoluteIndex =
        evtTimeline && getEventIdAbsoluteIndex(linkedTimelines, evtTimeline, readUptoEventId);
      if (absoluteIndex) {
        scrollToItem(absoluteIndex, {
          behavior: 'instant',
          align: 'start',
          stopInView: true,
        });
      }
    }
  }, [room, unreadInfo, scrollToItem]);

  // scroll to focused message
  useLayoutEffect(() => {
    if (focusItem?.scrollTo) {
      scrollToItem(focusItem.index, {
        behavior: 'instant',
        align: 'center',
        stopInView: true,
      });
    }

    setTimeout(() => {
      if (!alive()) return;
      setFocusItem((currentItem) => {
        if (currentItem === focusItem) return undefined;
        return currentItem;
      });
    }, 2000);
  }, [alive, focusItem, scrollToItem]);

  // scroll to bottom of timeline
  const scrollToBottomCount = scrollToBottomRef.current.count;
  useLayoutEffect(() => {
    if (scrollToBottomCount > 0) {
      const v = vListRef.current;
      if (v) {
        const behavior = scrollToBottomRef.current.smooth && !reducedMotion ? 'smooth' : 'instant';
        const wasAtBottom = atBottomRef.current;
        Sentry.addBreadcrumb({
          category: 'ui.scroll',
          message: 'Timeline: scroll-to-bottom triggered',
          level: 'info',
          data: { roomId: room.roomId, behavior, wasAtBottom },
        });
        // A scroll-to-bottom while the user was NOT at the bottom and no timeline
        // reset is expected is a sign of an unexpected scroll jump.
        if (!wasAtBottom && !timelineJustResetRef.current) {
          Sentry.captureMessage('Timeline: scroll-to-bottom fired while user was scrolled up', {
            level: 'warning',
            extra: { roomId: room.roomId, behavior },
            tags: { feature: 'timeline' },
          });
        }
        const lastIndex = eventsLengthRef.current - 1;
        v.scrollToIndex(lastIndex, { align: 'end', smooth: behavior === 'smooth' });
        debugLog.debug('timeline', 'scrollToBottom fired', { behavior, lastIndex });
        // On Android WebView, layout may still settle after the initial scroll.
        // Fire a second instant scroll after a short delay to guarantee we
        // reach the true bottom (e.g. after images finish loading or the
        // virtual keyboard shifts the viewport).
        if (behavior === 'instant') {
          setTimeout(() => {
            vListRef.current?.scrollToIndex(eventsLengthRef.current - 1, { align: 'end' });
          }, 80);
        }
      }
    }
  }, [scrollToBottomCount, reducedMotion, room.roomId]);

  // Remove unreadInfo on mark as read
  useEffect(() => {
    if (!unread) {
      setUnreadInfo(undefined);
    }
  }, [unread]);

  // scroll out of view msg editor in view.
  useEffect(() => {
    if (editId) {
      const editMsgElement = document.querySelector<HTMLElement>(`[data-message-id="${editId}"]`) ?? undefined;
      if (editMsgElement) {
        scrollToElement(editMsgElement, {
          align: 'center',
          behavior: 'smooth',
          stopInView: true,
        });
      }
    }
  }, [scrollToElement, editId]);

  const handleJumpToLatest = () => {
    if (eventId) {
      navigateRoom(room.roomId, undefined, { replace: true });
    }
    setTimeline(getInitialTimeline(room));
    scrollToBottomRef.current.count += 1;
    scrollToBottomRef.current.smooth = false;
  };

  const handleJumpToUnread = () => {
    if (unreadInfo?.readUptoEventId) {
      loadEventTimeline(unreadInfo.readUptoEventId);
    }
  };

  const handleMarkAsRead = () => {
    markAsRead(mx, room.roomId, hideReads);
  };

  const handleOpenReply: MouseEventHandler = useCallback(
    async (evt) => {
      const targetId = evt.currentTarget.getAttribute('data-event-id');
      if (!targetId) return;
      handleOpenEvent(targetId);
    },
    [handleOpenEvent]
  );

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;

      const cachedData = globalProfiles[userId];

      const cleanExtended = cachedData?.extended ? { ...cachedData.extended } : undefined;

      if (cleanExtended) {
        delete cleanExtended['io.fsky.nyx.pronouns'];
        delete cleanExtended['moe.sable.app.bio'];
        delete cleanExtended['chat.commet.profile_bio'];
        delete cleanExtended['chat.commet.profile_status'];
        delete cleanExtended['us.cloke.msc4175.tz'];
        delete cleanExtended['m.tz'];
        delete cleanExtended['chat.commet.profile_banner'];
        delete cleanExtended['moe.sable.app.name_color'];
        delete cleanExtended.avatar_url;
        delete cleanExtended.displayname;
        delete cleanExtended['kitty.meow.has_cats'];
        delete cleanExtended['kitty.meow.is_cat'];
      }

      openUserRoomProfile(
        room.roomId,
        space?.roomId,
        userId,
        evt.currentTarget.getBoundingClientRect(),
        undefined,
        {
          pronouns: cachedData?.pronouns,
          bio: cachedData?.bio,
          timezone: cachedData?.timezone,
          extended: cleanExtended,
        }
      );
    },
    [room, space, openUserRoomProfile, globalProfiles]
  );

  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) {
        throw new Error('Button should have "data-user-id" attribute!');
      }
      const name =
        getMemberDisplayName(room, userId, nicknames) ?? getMxIdLocalPart(userId) ?? userId;
      editor.insertNode(
        createMentionElement(
          userId,
          name.startsWith('@') ? name : `@${name}`,
          userId === mx.getUserId()
        )
      );
      ReactEditor.focus(editor);
      moveCursor(editor);
    },
    [mx, room, editor, nicknames]
  );

  const triggerReply = useCallback(
    (replyId: string, startThread = false) => {
      if (activeReplyId === replyId) {
        setReplyDraft(undefined);
        return;
      }

      const replyEvt = room.findEventById(replyId);
      if (!replyEvt) return;
      const editedReply = getEditedEvent(replyId, replyEvt, room.getUnfilteredTimelineSet());
      const content: IContent = editedReply?.getContent()['m.new_content'] ?? replyEvt.getContent();
      const { body, formatted_body: formattedBody } = content;
      const { 'm.relates_to': relation } = startThread
        ? { 'm.relates_to': { rel_type: 'm.thread', event_id: replyId } }
        : replyEvt.getWireContent();
      const senderId = replyEvt.getSender();
      if (senderId) {
        if (typeof body === 'string') {
          setReplyDraft({
            userId: senderId,
            eventId: replyId,
            body,
            formattedBody,
            relation,
          });
        } else {
          setReplyDraft({
            userId: senderId,
            eventId: replyId,
            body: '',
            formattedBody: '',
            relation,
          });
        }
      }
    },
    [room, setReplyDraft, activeReplyId]
  );

  const handleReplyClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt, startThread = false) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) {
        setReplyDraft(undefined);
        return;
      }
      if (startThread) {
        // Create thread if it doesn't exist, then open the thread drawer
        const rootEvent = room.findEventById(replyId);
        if (rootEvent && !room.getThread(replyId)) {
          room.createThread(replyId, rootEvent, [], false);
        }
        setOpenThread(openThreadId === replyId ? undefined : replyId);
        return;
      }
      triggerReply(replyId, false);
    },
    [triggerReply, setReplyDraft, setOpenThread, openThreadId, room]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) => {
      debugLog.info('ui', 'Reaction toggled', { roomId: room.roomId, targetEventId, key });
      Sentry.metrics.count('sable.message.reaction.toggle', 1);
      toggleReaction(mx, room, targetEventId, key, shortcode);
    },
    [mx, room]
  );

  const handleResend = useCallback(
    (mEvent: MatrixEvent) => {
      if (mEvent.getAssociatedStatus() !== EventStatus.NOT_SENT) return;
      mx.resendEvent(mEvent, room).catch(() => undefined);
    },
    [mx, room]
  );

  const handleDeleteFailedSend = useCallback(
    (mEvent: MatrixEvent) => {
      if (mEvent.getAssociatedStatus() !== EventStatus.NOT_SENT) return;
      mx.cancelPendingEvent(mEvent);
    },
    [mx]
  );

  const handleEdit = useCallback(
    (editEvtId?: string) => {
      if (editEvtId) {
        setEditId(editEvtId);
        return;
      }
      setEditId(undefined);
      onEditorReset?.();

      requestAnimationFrame(() => {
        if (!alive()) return;
        ReactEditor.focus(editor);
        moveCursor(editor);
      });
    },
    [editor, alive, onEditorReset]
  );
  const { t } = useTranslation();

  const [hideMemberInReadOnly] = useSetting(settingsAtom, 'hideMembershipInReadOnly');

  const isReadOnly = useMemo(() => {
    const myPowerLevel = powerLevels?.users?.[mx.getUserId()!] ?? powerLevels?.users_default ?? 0;
    const sendLevel =
      powerLevels?.events?.[MessageEvent.RoomMessage] ?? powerLevels?.events_default ?? 0;
    return myPowerLevel < sendLevel;
  }, [powerLevels, mx]);

  const renderMatrixEvent = useMatrixEventRenderer<
    [string, MatrixEvent, number, EventTimelineSet, boolean]
  >(
    {
      [MessageEvent.RoomMessage]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const { replyEventId, threadRootId } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;

        const pushActions = pushProcessor.actionsForEvent(mEvent);
        let notifyHighlight: 'silent' | 'loud' | undefined;
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          notifyHighlight = pushActions.tweaks?.sound ? 'loud' : 'silent';
        }

        const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
        const editedNewContent = editedEvent?.getContent()['m.new_content'];
        // If makeReplaced was called with a stripped edit (no m.new_content),
        // mEvent.getContent() returns {}. Fall back to getOriginalContent() so
        // the message renders with its original content instead of breaking.
        const baseContent = mEvent.getContent();
        const safeContent =
          Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();
        const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

        // determine if message is forwarded by checking for the presence of the 'moe.sable.message.forward' key in the event content
        const forwardContent = safeContent['moe.sable.message.forward'] as
          | {
              original_timestamp?: unknown;
              original_room_id?: string;
              original_event_id?: string;
              original_event_private?: boolean;
            }
          | undefined;

        const messageForwardedProps: ForwardedMessageProps | undefined = forwardContent
          ? {
              isForwarded: true,
              originalTimestamp:
                typeof forwardContent.original_timestamp === 'number'
                  ? forwardContent.original_timestamp
                  : mEvent.getTs(),
              originalRoomId: forwardContent.original_room_id ?? room.roomId,
              originalEventId: forwardContent.original_event_id ?? '',
              originalEventPrivate: forwardContent.original_event_private ?? false,
            }
          : undefined;

        return (
          <Message
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            notifyHighlight={notifyHighlight}
            edit={editId === mEventId}
            canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            senderId={senderId}
            senderDisplayName={senderDisplayName}
            messageForwardedProps={messageForwardedProps}
            sendStatus={mEvent.getAssociatedStatus()}
            onResend={handleResend}
            onDeleteFailedSend={handleDeleteFailedSend}
            onEditId={handleEdit}
            activeReplyId={activeReplyId}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadReplyCount = getThreadReplyCount(room, mEventId);
              const threadChip =
                threadReplyCount > 0 ? (
                  <ThreadReplyChip
                    room={room}
                    mEventId={mEventId}
                    openThreadId={openThreadId}
                    onToggle={() => setOpenThread(openThreadId === mEventId ? undefined : mEventId)}
                  />
                ) : null;
              if (!reactionRelations && !threadChip) return undefined;
              return (
                <>
                  {reactionRelations && (
                    <Reactions
                      style={{ marginTop: config.space.S200 }}
                      room={room}
                      relations={reactionRelations}
                      mEventId={mEventId}
                      canSendReaction={canSendReaction}
                      canDeleteOwn={canDeleteOwn}
                      onReactionToggle={handleReactionToggle}
                    />
                  )}
                  {threadChip}
                </>
              );
            })()}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(senderId)}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <RenderMessageContent
                displayName={senderDisplayName}
                msgType={(editedNewContent ?? safeContent).msgtype ?? ''}
                ts={mEvent.getTs()}
                edited={!!editedEvent}
                getContent={getContent}
                mediaAutoLoad={mediaAutoLoad}
                urlPreview={showUrlPreview}
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
                outlineAttachment={messageLayout === MessageLayout.Bubble}
              />
            )}
          </Message>
        );
      },
      [MessageEvent.RoomMessageEncrypted]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const { replyEventId, threadRootId } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

        const pushActions = pushProcessor.actionsForEvent(mEvent);
        let notifyHighlight: 'silent' | 'loud' | undefined;
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          notifyHighlight = pushActions.tweaks?.sound ? 'loud' : 'silent';
        }

        return (
          <Message
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            notifyHighlight={notifyHighlight}
            edit={editId === mEventId}
            canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            onEditId={handleEdit}
            senderId={senderId}
            activeReplyId={activeReplyId}
            senderDisplayName={senderDisplayName}
            sendStatus={mEvent.getAssociatedStatus()}
            onResend={handleResend}
            onDeleteFailedSend={handleDeleteFailedSend}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadReplyCount = getThreadReplyCount(room, mEventId);
              const threadChip =
                threadReplyCount > 0 ? (
                  <ThreadReplyChip
                    room={room}
                    mEventId={mEventId}
                    openThreadId={openThreadId}
                    onToggle={() => setOpenThread(openThreadId === mEventId ? undefined : mEventId)}
                  />
                ) : null;
              if (!reactionRelations && !threadChip) return undefined;
              return (
                <>
                  {reactionRelations && (
                    <Reactions
                      style={{ marginTop: config.space.S200 }}
                      room={room}
                      relations={reactionRelations}
                      mEventId={mEventId}
                      canSendReaction={canSendReaction}
                      canDeleteOwn={canDeleteOwn}
                      onReactionToggle={handleReactionToggle}
                    />
                  )}
                  {threadChip}
                </>
              );
            })()}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(mEvent.getSender() ?? '')}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            <EncryptedContent mEvent={mEvent}>
              {() => {
                if (mEvent.isRedacted()) return <RedactedContent />;
                if (mEvent.getType() === MessageEvent.Sticker)
                  return (
                    <MSticker
                      content={mEvent.getContent()}
                      renderImageContent={(props) => (
                        <ImageContent
                          {...props}
                          autoPlay={mediaAutoLoad}
                          renderImage={(p) => {
                            if (!autoplayStickers && p.src) {
                              return (
                                <ClientSideHoverFreeze src={p.src}>
                                  <Image {...p} loading="lazy" />
                                </ClientSideHoverFreeze>
                              );
                            }
                            return <Image {...p} loading="lazy" />;
                          }}
                          renderViewer={(p) => <ImageViewer {...p} />}
                        />
                      )}
                    />
                  );
                if (mEvent.getType() === MessageEvent.RoomMessage) {
                  const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
                  const editedNewContent = editedEvent?.getContent()['m.new_content'];
                  const baseContent = mEvent.getContent();
                  const safeContent =
                    Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();
                  const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

                  return (
                    <RenderMessageContent
                      displayName={senderDisplayName}
                      msgType={(editedNewContent ?? safeContent).msgtype ?? ''}
                      ts={mEvent.getTs()}
                      edited={!!editedEvent}
                      getContent={getContent}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={showUrlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                      outlineAttachment={messageLayout === MessageLayout.Bubble}
                    />
                  );
                }
                if (mEvent.getType() === MessageEvent.RoomMessageEncrypted)
                  return (
                    <Text>
                      <MessageNotDecryptedContent />
                    </Text>
                  );
                return (
                  <Text>
                    <MessageUnsupportedContent />
                  </Text>
                );
              }}
            </EncryptedContent>
          </Message>
        );
      },
      [MessageEvent.Sticker]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const { replyEventId, threadRootId } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

        return (
          <Message
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            senderId={senderId}
            activeReplyId={activeReplyId}
            senderDisplayName={senderDisplayName}
            sendStatus={mEvent.getAssociatedStatus()}
            onResend={handleResend}
            onDeleteFailedSend={handleDeleteFailedSend}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadReplyCount = getThreadReplyCount(room, mEventId);
              const threadChip =
                threadReplyCount > 0 ? (
                  <ThreadReplyChip
                    room={room}
                    mEventId={mEventId}
                    openThreadId={openThreadId}
                    onToggle={() => setOpenThread(openThreadId === mEventId ? undefined : mEventId)}
                  />
                ) : null;
              if (!reactionRelations && !threadChip) return undefined;
              return (
                <>
                  {reactionRelations && (
                    <Reactions
                      style={{ marginTop: config.space.S200 }}
                      room={room}
                      relations={reactionRelations}
                      mEventId={mEventId}
                      canSendReaction={canSendReaction}
                      canDeleteOwn={canDeleteOwn}
                      onReactionToggle={handleReactionToggle}
                    />
                  )}
                  {threadChip}
                </>
              );
            })()}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(mEvent.getSender() ?? '')}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <MSticker
                content={mEvent.getContent()}
                renderImageContent={(props) => (
                  <ImageContent
                    {...props}
                    autoPlay={mediaAutoLoad}
                    renderImage={(p) => {
                      if (!autoplayStickers && p.src) {
                        return (
                          <ClientSideHoverFreeze src={p.src}>
                            <Image {...p} loading="lazy" />
                          </ClientSideHoverFreeze>
                        );
                      }
                      return <Image {...p} loading="lazy" />;
                    }}
                    renderViewer={(p) => <ImageViewer {...p} />}
                  />
                )}
              />
            )}
          </Message>
        );
      },
      [StateEvent.RoomMember]: (mEventId, mEvent, item) => {
        const membershipChanged = isMembershipChanged(mEvent);
        if (hideMemberInReadOnly && isReadOnly) return null;
        if (membershipChanged && hideMembershipEvents) return null;
        if (!membershipChanged && hideNickAvatarEvents) return null;

        const highlighted = focusItem?.index === item && focusItem.highlight;
        const parsed = parseMemberEvent(mEvent);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            onReplyClick={handleReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={parsed.icon}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    {parsed.body}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomName]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            onReplyClick={handleReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {t('Organisms.RoomCommon.changed_room_name')}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomTopic]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            onReplyClick={handleReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {' changed room topic'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomAvatar]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            onReplyClick={handleReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {' changed room avatar'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.GroupCallMemberPrefix]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const content = mEvent.getContent<SessionMembershipData>();
        const prevContent = mEvent.getPrevContent();

        const callJoined = content.application;
        if (callJoined && 'application' in prevContent) {
          return null;
        }

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            hideReadReceipts={hideReads}
            onReplyClick={handleReplyClick}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={callJoined ? Icons.Phone : Icons.PhoneDown}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {callJoined ? ' joined the call' : ' ended the call'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
    },
    (mEventId, mEvent, item) => {
      if (!showHiddenEvents) return null;
      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = mEvent.getSender() ?? '';
      const senderName =
        getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={mEvent.getTs()}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={mEvent.getId()}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          highlight={highlighted}
          messageSpacing={messageSpacing}
          canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
          onReplyClick={handleReplyClick}
          hideReadReceipts={hideReads}
          showDeveloperTools={showDeveloperTools}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' sent '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' state event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    },
    (mEventId, mEvent, item) => {
      if (!showHiddenEvents) return null;
      if (Object.keys(mEvent.getContent()).length === 0) return null;
      if (mEvent.getRelation()) return null;
      if (mEvent.isRedaction()) return null;

      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = mEvent.getSender() ?? '';
      const senderName =
        getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={mEvent.getTs()}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={mEvent.getId()}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          highlight={highlighted}
          messageSpacing={messageSpacing}
          canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
          onReplyClick={handleReplyClick}
          hideReadReceipts={hideReads}
          showDeveloperTools={showDeveloperTools}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' sent '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    }
  );

  let prevEvent: MatrixEvent | undefined;
  let isPrevRendered = false;
  let newDivider = false;
  let dayDivider = false;
  const eventRenderer = (item: number): ReactElement | null => {
    const [eventTimeline, baseIndex] = getTimelineAndBaseIndex(timeline.linkedTimelines, item);
    if (!eventTimeline) return null;
    const timelineSet = eventTimeline?.getTimelineSet();
    const mEvent = getTimelineEvent(eventTimeline, getTimelineRelativeIndex(item, baseIndex));
    const mEventId = mEvent?.getId();

    if (!mEvent || !mEventId) return null;

    const eventSender = mEvent.getSender();
    if (eventSender && ignoredUsersSet.has(eventSender)) {
      return null;
    }
    if (mEvent.isRedacted() && !(showHiddenEvents || showTombstoneEvents)) {
      return null;
    }

    if (!newDivider && readUptoEventIdRef.current) {
      newDivider = prevEvent?.getId() === readUptoEventIdRef.current;
    }
    if (!dayDivider) {
      dayDivider = prevEvent ? !inSameDay(prevEvent.getTs(), mEvent.getTs()) : false;
    }

    const collapsed =
      isPrevRendered &&
      !dayDivider &&
      (!newDivider || eventSender === mx.getUserId()) &&
      prevEvent !== undefined &&
      prevEvent.getSender() === eventSender &&
      prevEvent.getType() === mEvent.getType() &&
      minuteDifference(prevEvent.getTs(), mEvent.getTs()) < 2;

    // Thread REPLIES belong only in the thread timeline; filter them from the
    // main room timeline. Keep thread ROOT events (threadRootId === their own
    // event ID) so they remain visible with the ThreadReplyChip attached.
    if (mEvent.threadRootId !== undefined && mEvent.threadRootId !== mEventId) return null;

    const eventJSX = (
      reactionOrEditEvent(mEvent)
        ? null
        : renderMatrixEvent(
            mEvent.getType(),
            typeof mEvent.getStateKey() === 'string',
            mEventId,
            mEvent,
            item,
            timelineSet,
            collapsed
          )
    ) as ReactElement | null;
    prevEvent = mEvent;
    isPrevRendered = !!eventJSX;

    const newDividerJSX =
      newDivider && eventJSX && eventSender !== mx.getUserId() ? (
        <MessageBase space={messageSpacing}>
          <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
            <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
              <Text size="L400">New Messages</Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      ) : null;

    const dayDividerJSX =
      dayDivider && eventJSX ? (
        <MessageBase space={messageSpacing}>
          <TimelineDivider variant="Surface">
            <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
              <Text size="L400">
                {(() => {
                  if (today(mEvent.getTs())) return 'Today';
                  if (yesterday(mEvent.getTs())) return 'Yesterday';
                  return timeDayMonthYear(mEvent.getTs());
                })()}
              </Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      ) : null;

    if (eventJSX && (newDividerJSX || dayDividerJSX)) {
      if (newDividerJSX) newDivider = false;
      if (dayDividerJSX) dayDivider = false;

      return (
        <Fragment key={mEventId}>
          {newDividerJSX}
          {dayDividerJSX}
          {eventJSX}
        </Fragment>
      );
    }

    return eventJSX ?? null;
  };

  let backPaginationJSX: ReactNode | undefined;
  if (canPaginateBack || backwardStatus !== 'idle') {
    if (backwardStatus === 'error') {
      backPaginationJSX = (
        <Box
          justifyContent="Center"
          alignItems="Center"
          gap="200"
          style={{ padding: config.space.S300 }}
        >
          <Text style={{ color: color.Critical.Main }} size="T300">
            Failed to load history.
          </Text>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            onClick={() => handleTimelinePagination(true)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    } else if (backwardStatus === 'loading') {
      backPaginationJSX = (
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      );
    }
  }

  // When eventsLength===0 show placeholder skeletons inside VList.
  const showLoadingPlaceholders = eventsLength === 0 && (canPaginateBack || backwardStatus === 'loading' || forwardStatus === 'loading');

  // VList requires a `data` array whose length controls item count.
  // We use a simple array of indices so the render function receives the index directly.
  const vListItemCount = showLoadingPlaceholders ? 3 : eventsLength;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vListData = useMemo(() => Array.from({ length: vListItemCount }, (_, i) => i), [vListItemCount]);

  let frontPaginationJSX: ReactNode | undefined;
  if (!liveTimelineLinked || forwardStatus !== 'idle') {
    if (forwardStatus === 'error') {
      frontPaginationJSX = (
        <Box
          justifyContent="Center"
          alignItems="Center"
          gap="200"
          style={{ padding: config.space.S300 }}
        >
          <Text style={{ color: color.Critical.Main }} size="T300">
            Failed to load messages.
          </Text>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            onClick={() => handleTimelinePagination(false)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    } else if (forwardStatus === 'loading') {
      frontPaginationJSX = (
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      );
    }
  }

  return (
    <Box grow="Yes" style={{ position: 'relative' }}>
      {unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && (
        <TimelineFloat position="Top">
          <Chip
            variant="Primary"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.MessageUnread} />}
            onClick={handleJumpToUnread}
          >
            <Text size="L400">Jump to Unread</Text>
          </Chip>

          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.CheckTwice} />}
            onClick={handleMarkAsRead}
          >
            <Text size="L400">Mark as Read</Text>
          </Chip>
        </TimelineFloat>
      )}
      {backPaginationJSX}
      <VList
        ref={vListRef}
        data={vListData}
        shift={shift}
        className={css.messageList}
        style={{ flex: 1, minHeight: 0, padding: `${config.space.S600} 0` }}
        onScroll={handleVListScroll}
      >
        {(data: number): ReactElement => {
          // `data` is the item-index because vListData = [0, 1, 2, ...N-1].
          const index = data;
          if (showLoadingPlaceholders) {
            return (
              <MessageBase key={index}>
                {messageLayout === MessageLayout.Compact ? <CompactPlaceholder /> : <DefaultPlaceholder />}
              </MessageBase>
            );
          }
          if (index === 0 && !canPaginateBack) {
            return (
              <Fragment key="intro-and-first">
                <div
                  style={{
                    padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${
                      messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)
                    }`,
                  }}
                >
                  <RoomIntro room={room} />
                </div>
                {eventRenderer(index)}
              </Fragment>
            );
          }
          return eventRenderer(index) ?? <Fragment key={index} />;
        }}
      </VList>
      {frontPaginationJSX}
      {(!atBottom || !liveTimelineLinked) && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.ArrowBottom} />}
            onClick={handleJumpToLatest}
          >
            <Text size="L400">Jump to Latest</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}
