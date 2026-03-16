/* eslint-disable react/destructuring-assignment */
import {
  Fragment,
  Dispatch,
  MouseEventHandler,
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
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { useTranslation } from 'react-i18next';
import { getMxIdLocalPart, mxcUrlToHttp, toggleReaction } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { ItemRange, useVirtualPaginator } from '$hooks/useVirtualPaginator';
import { useAlive } from '$hooks/useAlive';
import { editableActiveElement, scrollToBottom } from '$utils/dom';
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
  return (timelines || []).filter(Boolean).reduce(timelineEventCountReducer, 0);
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
  range: ItemRange;
};

const useEventTimelineLoader = (
  mx: MatrixClient,
  room: Room,
  onLoad: (eventId: string, linkedTimelines: EventTimeline[], evtAbsIndex: number) => void,
  onError: (err: Error | null) => void
) =>
  useCallback(
    async (eventId: string) => {
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

      onLoad(eventId, linkedTimelines, absIndex);
    },
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

      const topTmAddedEvt =
        timelineToEventsCount(newLTimelines[topTmIndex]) - timelinesEventsCount[0];
      const offsetRange = getTimelinesEventsCount(topAddedTm) + (backwards ? topTmAddedEvt : 0);

      setTimeline((currentTimeline) => ({
        linkedTimelines: newLTimelines,
        range:
          offsetRange > 0
            ? {
                start: currentTimeline.range.start + offsetRange,
                end: currentTimeline.range.end + offsetRange,
              }
            : { ...currentTimeline.range },
      }));
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
        const [err] = await to(
          mx.paginateEventTimeline(timelineToPaginate, {
            backwards,
            limit,
          })
        );
        if (err) {
          if (alive()) {
            (backwards ? setBackwardStatus : setForwardStatus)('error');
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
      onRefreshRef.current();
    };
    // The SDK fires RoomEvent.TimelineReset on the EventTimelineSet (not the Room)
    // when a limited sliding-sync response replaces the live EventTimeline with a
    // fresh one. Without this handler, the stored linkedTimelines reference the old
    // detached chain and back-pagination silently no-ops, freezing the room.
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

function ThreadReplyChip({ room, mEventId, openThreadId, onToggle }: ThreadReplyChipProps) {
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

  const latestReply = replyEvents[replyEvents.length - 1];
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
  const evLength = getTimelinesEventsCount(linkedTimelines);
  return {
    linkedTimelines,
    range: {
      start: Math.max(evLength - PAGINATION_LIMIT, 0),
      end: evLength,
    },
  };
};

const getEmptyTimeline = () => ({
  range: { start: 0, end: 0 },
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
}: RoomTimelineProps) {
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

  const atBottomAnchorRef = useRef<HTMLElement>(null);

  const [atBottom, setAtBottomState] = useState<boolean>(true);
  const atBottomRef = useRef(atBottom);
  const setAtBottom = useCallback((val: boolean) => {
    setAtBottomState(val);
    atBottomRef.current = val;
  }, []);

  // Set to true by the useLiveTimelineRefresh callback when the timeline is
  // re-initialised (TimelineRefresh or TimelineReset). Allows the range self-heal
  // effect below to run even when atBottom=false, so the virtual paginator window
  // is restored to the live end without forcing a viewport scroll.
  const timelineJustResetRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Log timeline component mount/unmount
  useEffect(() => {
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
  const rangeAtStart = timeline.range.start === 0;
  const rangeAtEnd = timeline.range.end === eventsLength;
  const atLiveEndRef = useRef(liveTimelineLinked && rangeAtEnd);
  atLiveEndRef.current = liveTimelineLinked && rangeAtEnd;

  const {
    paginate: handleTimelinePagination,
    backwardStatus,
    forwardStatus,
  } = useTimelinePagination(mx, timeline, setTimeline, PAGINATION_LIMIT);

  const getScrollElement = useCallback(() => scrollRef.current, []);

  const { getItems, scrollToItem, scrollToElement, observeBackAnchor, observeFrontAnchor } =
    useVirtualPaginator({
      count: eventsLength,
      limit: PAGINATION_LIMIT,
      range: timeline.range,
      onRangeChange: useCallback((newRange) => {
        setTimeline((currentTimeline) => {
          const deltaStart = Math.abs(currentTimeline.range.start - newRange.start);
          const deltaEnd = Math.abs(currentTimeline.range.end - newRange.end);

          if (deltaStart < 3 && deltaEnd < 3) {
            return currentTimeline;
          }

          return { ...currentTimeline, range: newRange };
        });
      }, []),
      getScrollElement,
      getItemElement: useCallback(
        (index: number) =>
          (scrollRef.current?.querySelector(`[data-message-item="${index}"]`) as HTMLElement) ??
          undefined,
        []
      ),
      onEnd: handleTimelinePagination,
    });

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
        setTimeline({
          linkedTimelines: lTimelines,
          range: {
            start: Math.max(evtAbsIndex - PAGINATION_LIMIT, 0),
            end: Math.min(evtAbsIndex + PAGINATION_LIMIT, evLength),
          },
        });
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

          setTimeline((ct) => ({
            ...ct,
            range: {
              start: ct.range.start + 1,
              end: ct.range.end + 1,
            },
          }));
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

  // When historical events load (e.g., from active subscription), stay at bottom
  // by adjusting the range. The virtual paginator expects the range to match the
  // position we want to display. Without this, loading more history makes it look
  // like we've scrolled up because the range (0, 10) is now showing the old events
  // instead of the latest ones.
  //
  // Also runs after a timeline reset (timelineJustResetRef=true) even when
  // atBottom=false. After TimelineReset the SDK fires the event before populating
  // the fresh timeline, so getInitialTimeline sees range.end=0. When events
  // arrive eventsLength grows and we need to heal the range back to the live end
  // regardless of the user's scroll position.
  useEffect(() => {
    const resetPending = timelineJustResetRef.current;
    if ((atBottom || resetPending) && liveTimelineLinked && eventsLength > timeline.range.end) {
      if (resetPending) timelineJustResetRef.current = false;
      // More events exist than our current range shows. Adjust to the live end.
      setTimeline((ct) => ({
        ...ct,
        range: {
          start: Math.max(eventsLength - PAGINATION_LIMIT, 0),
          end: eventsLength,
        },
      }));
    }
  }, [atBottom, liveTimelineLinked, eventsLength, timeline.range.end]);

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
        const scrollElement = getScrollElement();
        if (!editorBaseEntry || !scrollElement) return;

        if (atBottomRef.current) {
          scrollToBottom(scrollElement);
        }
      };
    }, [getScrollElement, roomInputRef]),
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

  useIntersectionObserver(
    useCallback(
      (entries) => {
        const target = atBottomAnchorRef.current;
        if (!target) return;
        const targetEntry = getIntersectionObserverEntry(target, entries);
        if (!targetEntry) return;

        if (targetEntry.isIntersecting) {
          // User has reached the bottom
          debugLog.debug('timeline', 'Scrolled to bottom', { roomId: room.roomId });
          setAtBottom(true);
          if (atLiveEndRef.current && document.hasFocus()) {
            tryAutoMarkAsRead();
          }
        } else {
          // User has intentionally scrolled up.
          debugLog.debug('timeline', 'Scrolled away from bottom', { roomId: room.roomId });
          setAtBottom(false);
        }
      },
      [tryAutoMarkAsRead, setAtBottom, room.roomId]
    ),
    useCallback(
      () => ({
        root: getScrollElement(),
        rootMargin: '100px',
      }),
      [getScrollElement]
    ),
    useCallback(() => atBottomAnchorRef.current, [])
  );

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

  // Scroll to bottom on initial timeline load
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollToBottom(scrollEl);
    }
  }, []);

  // Rescroll to bottom when images load at the start
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const contentEl = scrollEl?.firstElementChild as HTMLElement;
    if (!scrollEl || !contentEl) return () => {};

    const forceScroll = () => {
      // if the user isn't scrolling jump down to latest content
      if (!atBottomRef.current) return;
      scrollToBottom(scrollEl, 'instant');
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(forceScroll);
    });

    resizeObserver.observe(contentEl);

    return () => {
      resizeObserver.disconnect();
    };
  }, [room]);

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
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        const behavior = scrollToBottomRef.current.smooth && !reducedMotion ? 'smooth' : 'instant';
        // Use requestAnimationFrame to ensure the virtual paginator has finished
        // updating the DOM before we scroll. This prevents scroll position from
        // being stale when new messages arrive while at the bottom.
        requestAnimationFrame(() => {
          scrollToBottom(scrollEl, behavior);
          // On Android WebView, layout may still settle after the initial scroll.
          // Fire a second instant scroll after a short delay to guarantee we
          // reach the true bottom (e.g. after images finish loading or the
          // virtual keyboard shifts the viewport).
          if (behavior === 'instant') {
            setTimeout(() => {
              scrollToBottom(scrollEl, 'instant');
            }, 80);
          }
        });
      }
    }
  }, [scrollToBottomCount, reducedMotion]);

  // Remove unreadInfo on mark as read
  useEffect(() => {
    if (!unread) {
      setUnreadInfo(undefined);
    }
  }, [unread]);

  // scroll out of view msg editor in view.
  useEffect(() => {
    if (editId) {
      const editMsgElement =
        (scrollRef.current?.querySelector(`[data-message-id="${editId}"]`) as HTMLElement) ??
        undefined;
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
    (targetEventId: string, key: string, shortcode?: string) =>
      toggleReaction(mx, room, targetEventId, key, shortcode),
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
  const timelineItems = getItems();
  const eventRenderer = (item: number) => {
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

    const eventJSX = reactionOrEditEvent(mEvent)
      ? null
      : renderMatrixEvent(
          mEvent.getType(),
          typeof mEvent.getStateKey() === 'string',
          mEventId,
          mEvent,
          item,
          timelineSet,
          collapsed
        );
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

    return eventJSX;
  };

  let backPaginationJSX: ReactNode | undefined;
  if (canPaginateBack || !rangeAtStart || backwardStatus !== 'idle') {
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
    } else if (backwardStatus === 'loading' && timelineItems.length > 0) {
      backPaginationJSX = (
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      );
    } else if (timelineItems.length === 0) {
      // When eventsLength===0 AND liveTimelineLinked the live EventTimeline was
      // just reset by a sliding sync TimelineRefresh and new events haven't
      // arrived yet. Attaching the IntersectionObserver anchor here would
      // immediately fire a server-side /messages request before current events
      // land — potentially causing a "/messages hangs → spinner stuck" scenario.
      // Suppressing the anchor for this transient state is safe: the rangeAtEnd
      // self-heal useEffect will call getInitialTimeline once events arrive, and
      // at that point the correct anchor (below) will be re-observed.
      // eventsLength>0 covers the range={K,K} case from recalibratePagination
      // where items=0 but events exist — that needs the anchor for local range
      // extension (no server call since start>0).
      const placeholderBackAnchor =
        eventsLength > 0 || !liveTimelineLinked ? observeBackAnchor : undefined;
      backPaginationJSX =
        messageLayout === MessageLayout.Compact ? (
          <>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase ref={placeholderBackAnchor}>
              <CompactPlaceholder />
            </MessageBase>
          </>
        ) : (
          <>
            <MessageBase>
              <DefaultPlaceholder />
            </MessageBase>
            <MessageBase>
              <DefaultPlaceholder />
            </MessageBase>
            <MessageBase ref={placeholderBackAnchor}>
              <DefaultPlaceholder />
            </MessageBase>
          </>
        );
    } else {
      backPaginationJSX = <div ref={observeBackAnchor} style={{ height: 1 }} />;
    }
  }

  let frontPaginationJSX: ReactNode | undefined;
  if (!liveTimelineLinked || !rangeAtEnd || forwardStatus !== 'idle') {
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
    } else if (forwardStatus === 'loading' && timelineItems.length > 0) {
      frontPaginationJSX = (
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      );
    } else if (timelineItems.length === 0) {
      frontPaginationJSX =
        messageLayout === MessageLayout.Compact ? (
          <>
            <MessageBase ref={observeFrontAnchor}>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
            <MessageBase>
              <CompactPlaceholder />
            </MessageBase>
          </>
        ) : (
          <>
            <MessageBase ref={observeFrontAnchor}>
              <DefaultPlaceholder />
            </MessageBase>
            <MessageBase>
              <DefaultPlaceholder />
            </MessageBase>
            <MessageBase>
              <DefaultPlaceholder />
            </MessageBase>
          </>
        );
    } else {
      frontPaginationJSX = <div ref={observeFrontAnchor} style={{ height: 1 }} />;
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
      <Scroll ref={scrollRef} visibility="Hover">
        <Box
          className={css.messageList}
          direction="Column"
          justifyContent="End"
          style={{ minHeight: '100%', padding: `${config.space.S600} 0` }}
        >
          {!canPaginateBack && rangeAtStart && getItems().length > 0 && (
            <div
              style={{
                padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${
                  messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)
                }`,
              }}
            >
              <RoomIntro room={room} />
            </div>
          )}
          {backPaginationJSX}

          {timelineItems.map(eventRenderer)}

          {frontPaginationJSX}
          <span ref={atBottomAnchorRef} />
        </Box>
      </Scroll>
      {(!atBottom || !(liveTimelineLinked && rangeAtEnd)) && (
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
