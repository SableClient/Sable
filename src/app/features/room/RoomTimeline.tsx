import type { ReactNode } from 'react';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Editor } from 'slate';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { PushProcessor, Direction } from '$types/matrix-sdk';
import classNames from 'classnames';
import type { VListHandle } from 'virtua';
import { VList } from 'virtua';
import type { ContainerColor } from 'folds';
import {
  as,
  Box,
  Chip,
  Icon,
  Icons,
  Line,
  Text,
  Badge,
  color,
  config,
  toRem,
  Spinner,
} from 'folds';
import { MessageBase, CompactPlaceholder, DefaultPlaceholder } from '$components/message';
import { RoomIntro } from '$components/room-intro';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAlive } from '$hooks/useAlive';
import { useMessageEdit } from '$hooks/useMessageEdit';
import { useDocumentFocusChange } from '$hooks/useDocumentFocusChange';
import { markAsRead } from '$utils/notifications';
import {
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
  factoryRenderLinkifyWithMention,
} from '$plugins/react-custom-html-parser';
import { today, yesterday, timeDayMonthYear } from '$utils/time';
import { unwrapRelationJumpTarget } from '$utils/room';
import { useMemberEventParser } from '$hooks/useMemberEventParser';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { settingsAtom, MessageLayout } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { nicknamesAtom } from '$state/nicknames';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import { buildAbbrReplaceTextNode } from '$components/message/RenderBody';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import {
  getRoomUnreadInfo,
  getEventTimeline,
  getFirstLinkedTimeline,
  getInitialTimeline,
  getEventIdAbsoluteIndex,
} from '$utils/timeline';
import { useTimelineSync } from '$hooks/timeline/useTimelineSync';
import { useTimelineActions } from '$hooks/timeline/useTimelineActions';
import {
  useProcessedTimeline,
  getProcessedRowIndexForRawTimelineIndex,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import { useTimelineEventRenderer } from '$hooks/timeline/useTimelineEventRenderer';
import * as css from './RoomTimeline.css';

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

const getDayDividerText = (ts: number) => {
  if (today(ts)) return 'Today';
  if (yesterday(ts)) return 'Yesterday';
  return timeDayMonthYear(ts);
};

export type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  editor: Editor;
  onEditorReset?: () => void;
  onEditLastMessageRef?: React.MutableRefObject<(() => void) | undefined>;
};

export function RoomTimeline({
  room,
  eventId,
  editor,
  onEditorReset,
  onEditLastMessageRef,
}: Readonly<RoomTimelineProps>) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const { editId, handleEdit } = useMessageEdit(editor, { onReset: onEditorReset, alive });
  const { navigateRoom } = useRoomNavigate();

  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [showBundledPreview] = useSetting(settingsAtom, 'bundledPreview');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [clientUrlPreview] = useSetting(settingsAtom, 'clientUrlPreview');
  const [encClientUrlPreview] = useSetting(settingsAtom, 'encClientUrlPreview');
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [showTombstoneEvents] = useSetting(settingsAtom, 'showTombstoneEvents');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [autoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');
  const [autoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');
  const [incomingInlineImagesDefaultHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesDefaultHeight'
  );
  const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');
  const [hideMemberInReadOnly] = useSetting(settingsAtom, 'hideMembershipInReadOnly');

  const showUrlPreview = room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview;
  const showClientUrlPreview = room.hasEncryptionStateEvent()
    ? clientUrlPreview && encClientUrlPreview
    : clientUrlPreview;

  const nicknames = useAtomValue(nicknamesAtom);
  const globalProfiles = useAtomValue(profilesCacheAtom);
  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
  const permissions = useRoomPermissions(creators, powerLevels);
  const isReadOnly = useMemo(() => {
    const myPowerLevel = powerLevels?.users?.[mx.getUserId()!] ?? powerLevels?.users_default ?? 0;
    const sendLevel = powerLevels?.events?.['m.room.message'] ?? powerLevels?.events_default ?? 0;
    return myPowerLevel < sendLevel;
  }, [powerLevels, mx]);

  const [unreadInfo, setUnreadInfo] = useState(() => getRoomUnreadInfo(room, true));

  const readUptoEventIdRef = useRef<string | undefined>(undefined);
  if (unreadInfo) readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  const hideReadsRef = useRef(hideReads);
  hideReadsRef.current = hideReads;

  const prevViewportHeightRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);

  const mediaAuthentication = useMediaAuthentication();
  const spoilerClickHandler = useSpoilerClickHandler();
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const openUserRoomProfile = useOpenUserRoomProfile();
  const optionalSpace = useSpaceOptionally();
  const roomParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms = useImagePackRooms(room.roomId, roomParents);
  const pushProcessor = useMemo(() => new PushProcessor(mx), [mx]);
  const parseMemberEvent = useMemberEventParser();

  const replyDraftAtom = useMemo(() => roomIdToReplyDraftAtomFamily(room.roomId), [room.roomId]);
  const activeReplyDraft = useAtomValue(replyDraftAtom);
  const setReplyDraft = useSetAtom(replyDraftAtom);
  const activeReplyId = activeReplyDraft?.eventId;

  const openThreadAtom = useMemo(() => roomIdToOpenThreadAtomFamily(room.roomId), [room.roomId]);
  const openThreadId = useAtomValue(openThreadAtom);
  const setOpenThread = useSetAtom(openThreadAtom);

  const vListRef = useRef<VListHandle>(null);
  const [atBottomState, setAtBottomState] = useState(true);
  const atBottomRef = useRef(atBottomState);
  const setAtBottom = useCallback((val: boolean) => {
    setAtBottomState(val);
    atBottomRef.current = val;
  }, []);

  const [shift, setShift] = useState(false);
  const [topSpacerHeight, setTopSpacerHeight] = useState(0);

  const topSpacerHeightRef = useRef(0);
  const mountScrollWindowRef = useRef<number>(Date.now() + 3000);
  const hasInitialScrolledRef = useRef(false);
  // Stored in a ref so eventsLength fluctuations (e.g. onLifecycle timeline reset
  // firing within the window) cannot cancel it via useLayoutEffect cleanup.
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set to true when the 80 ms timer fires but processedEvents is still empty
  // (e.g. the onLifecycle reset cleared the timeline before events refilled it).
  // A recovery useLayoutEffect watches for processedEvents becoming non-empty
  // and performs the final scroll + setIsReady when this flag is set.
  const pendingReadyRef = useRef(false);
  const currentRoomIdRef = useRef(room.roomId);

  const [isReady, setIsReady] = useState(false);

  if (currentRoomIdRef.current !== room.roomId) {
    hasInitialScrolledRef.current = false;
    mountScrollWindowRef.current = Date.now() + 3000;
    currentRoomIdRef.current = room.roomId;
    pendingReadyRef.current = false;
    if (initialScrollTimerRef.current !== undefined) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = undefined;
    }
    setIsReady(false);
  }

  const processedEventsRef = useRef<ProcessedEvent[]>([]);
  const timelineSyncRef = useRef<typeof timelineSync>(null as unknown as typeof timelineSync);

  const scrollToBottom = useCallback(() => {
    if (!vListRef.current) return;
    const lastIndex = processedEventsRef.current.length - 1;
    if (lastIndex < 0) return;
    vListRef.current.scrollTo(vListRef.current.scrollSize);
  }, []);

  const timelineSync = useTimelineSync({
    room,
    mx,
    eventId,
    isAtBottom: atBottomState,
    isAtBottomRef: atBottomRef,
    scrollToBottom,
    unreadInfo,
    setUnreadInfo,
    hideReadsRef,
    readUptoEventIdRef,
  });

  timelineSyncRef.current = timelineSync;

  const eventsLengthRef = useRef(timelineSync.eventsLength);
  eventsLengthRef.current = timelineSync.eventsLength;

  const canPaginateBackRef = useRef(timelineSync.canPaginateBack);
  canPaginateBackRef.current = timelineSync.canPaginateBack;

  const liveTimelineLinkedRef = useRef(timelineSync.liveTimelineLinked);
  liveTimelineLinkedRef.current = timelineSync.liveTimelineLinked;

  const backwardStatusRef = useRef(timelineSync.backwardStatus);
  backwardStatusRef.current = timelineSync.backwardStatus;

  const forwardStatusRef = useRef(timelineSync.forwardStatus);
  forwardStatusRef.current = timelineSync.forwardStatus;

  const getRawIndexToProcessedIndex = useCallback((rawIndex: number): number | undefined => {
    const events = processedEventsRef.current;
    const match = events.find((e) => e.itemIndex === rawIndex);
    if (!match) return undefined;
    return events.indexOf(match);
  }, []);

  useLayoutEffect(() => {
    if (
      !eventId &&
      !hasInitialScrolledRef.current &&
      timelineSync.eventsLength > 0 &&
      // Guard: only scroll once the timeline reflects the current room's live
      // timeline. Without this, a render with stale data from the previous room
      // (before the room-change reset propagates) fires the scroll at the wrong
      // position and marks hasInitialScrolledRef = true, preventing the correct
      // scroll when the right data arrives.
      timelineSync.liveTimelineLinked &&
      vListRef.current
    ) {
      vListRef.current.scrollToIndex(processedEventsRef.current.length - 1, { align: 'end' });
      // Store in a ref rather than a local so subsequent eventsLength changes
      // (e.g. the onLifecycle timeline reset firing within 80 ms) do NOT
      // cancel this timer through the useLayoutEffect cleanup.
      initialScrollTimerRef.current = setTimeout(() => {
        initialScrollTimerRef.current = undefined;
        if (processedEventsRef.current.length > 0) {
          vListRef.current?.scrollToIndex(processedEventsRef.current.length - 1, { align: 'end' });
          // Only mark ready once we've successfully scrolled.  If processedEvents
          // was empty when the timer fired (e.g. the onLifecycle reset cleared the
          // timeline within the 80 ms window), defer setIsReady until the recovery
          // effect below fires once events repopulate.
          setIsReady(true);
        } else {
          pendingReadyRef.current = true;
        }
      }, 80);
      hasInitialScrolledRef.current = true;
    }
    // No cleanup return — the timer must survive eventsLength fluctuations.
    // It is cancelled on unmount by the dedicated effect below.
  }, [timelineSync.eventsLength, timelineSync.liveTimelineLinked, eventId, room.roomId]);

  // Cancel the initial-scroll timer on unmount (the useLayoutEffect above
  // intentionally does not cancel it when deps change).
  useEffect(
    () => () => {
      if (initialScrollTimerRef.current !== undefined) clearTimeout(initialScrollTimerRef.current);
    },
    []
  );

  // If the timeline was blanked while content was already visible — e.g. a
  // TimelineReset fired by mx.retryImmediately() when the app comes back from
  // background — hide the timeline (opacity 0) and re-arm the initial-scroll so
  // it runs again once events refill the live timeline.
  useLayoutEffect(() => {
    if (!isReady) return;
    if (timelineSync.eventsLength > 0) return;
    setIsReady(false);
    hasInitialScrolledRef.current = false;
  }, [isReady, timelineSync.eventsLength]);

  const recalcTopSpacer = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const prev = topSpacerHeightRef.current;

    const newH = Math.max(0, v.viewportSize - v.scrollSize + prev);
    if (Math.abs(prev - newH) > 2) {
      topSpacerHeightRef.current = newH;
      setTopSpacerHeight(newH);
      if (prev > 0 && newH === 0 && processedEventsRef.current.length > 0) {
        requestAnimationFrame(() => {
          vListRef.current?.scrollToIndex(processedEventsRef.current.length - 1, { align: 'end' });
        });
      }
    }
  }, []);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(recalcTopSpacer);
    return () => cancelAnimationFrame(id);
  }, [recalcTopSpacer, timelineSync.eventsLength]);

  const prevBackwardStatusRef = useRef(timelineSync.backwardStatus);
  const wasAtBottomBeforePaginationRef = useRef(false);

  useLayoutEffect(() => {
    const prev = prevBackwardStatusRef.current;
    prevBackwardStatusRef.current = timelineSync.backwardStatus;
    if (timelineSync.backwardStatus === 'loading') {
      wasAtBottomBeforePaginationRef.current = atBottomRef.current;
      if (!atBottomRef.current) setShift(true);
    } else if (prev === 'loading' && timelineSync.backwardStatus === 'idle') {
      setShift(false);
      if (wasAtBottomBeforePaginationRef.current) {
        vListRef.current?.scrollToIndex(processedEventsRef.current.length - 1, { align: 'end' });
      }
    }
  }, [timelineSync.backwardStatus]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timelineSync.focusItem) {
      if (timelineSync.focusItem.scrollTo && vListRef.current) {
        const processedIndex = getRawIndexToProcessedIndex(timelineSync.focusItem.index);
        if (processedIndex !== undefined) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
          timelineSync.setFocusItem((prev) => (prev ? { ...prev, scrollTo: false } : undefined));
        }
      }
      timeoutId = setTimeout(() => {
        timelineSync.setFocusItem(undefined);
      }, 2000);
    }
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [timelineSync.focusItem, timelineSync, reducedMotion, getRawIndexToProcessedIndex]);

  useEffect(() => {
    if (timelineSync.focusItem) {
      setIsReady(true);
    }
  }, [timelineSync.focusItem]);

  useEffect(() => {
    if (!eventId) return;
    setIsReady(false);
    timelineSyncRef.current.loadEventTimeline(eventId);
  }, [eventId, room.roomId]);

  useEffect(() => {
    if (eventId) return;
    // Guard: once the timeline is visible to the user, do not override their
    // scroll position. Without this, a later timeline refresh (e.g. the
    // onLifecycle reset delivering a new linkedTimelines reference) can fire
    // this effect after isReady and snap the view back to the read marker.
    if (isReady) return;
    const { readUptoEventId, inLiveTimeline, scrollTo } = unreadInfo ?? {};
    if (readUptoEventId && inLiveTimeline && scrollTo) {
      const evtTimeline = getEventTimeline(room, readUptoEventId);
      const absoluteIndex = evtTimeline
        ? getEventIdAbsoluteIndex(
            timelineSync.timeline.linkedTimelines,
            evtTimeline,
            readUptoEventId
          )
        : undefined;

      if (absoluteIndex !== undefined) {
        const processedIndex = getRawIndexToProcessedIndex(absoluteIndex);
        if (processedIndex !== undefined && vListRef.current) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'start' });
        }
        // Always consume the scroll intent once the event is located in the
        // linked timelines, even if its processedIndex is undefined (filtered
        // event). Without this, each linkedTimelines reference change retries
        // the scroll indefinitely.
        setUnreadInfo((prev) => (prev ? { ...prev, scrollTo: false } : prev));
      }
    }
  }, [
    room,
    unreadInfo,
    timelineSync.timeline.linkedTimelines,
    eventId,
    isReady,
    getRawIndexToProcessedIndex,
  ]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return () => {};

    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]!.contentRect.height;
      const prev = prevViewportHeightRef.current;
      const atBottom = atBottomRef.current;
      const shrank = newHeight < prev;

      if (shrank && atBottom) {
        vListRef.current?.scrollTo(vListRef.current.scrollSize);
      }
      prevViewportHeightRef.current = newHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const actions = useTimelineActions({
    room,
    mx,
    editor,
    nicknames,
    globalProfiles,
    spaceId: optionalSpace?.roomId,
    openUserRoomProfile: openUserRoomProfile as unknown as (
      roomId: string,
      spaceId: string | undefined,
      userId: string,
      rect: DOMRect,
      undefinedArg?: undefined,
      options?: unknown
    ) => void,
    activeReplyId,
    setReplyDraft: setReplyDraft as unknown as (draft: unknown) => void,
    openThreadId,
    setOpenThread: setOpenThread as unknown as (threadId: string | undefined) => void,
    handleEdit,
    handleOpenEvent: (id) => {
      const anchorId = unwrapRelationJumpTarget(room, id);
      let evtTimeline = getEventTimeline(room, anchorId);
      let resolvedForIndex = anchorId;
      if (!evtTimeline && anchorId !== id) {
        evtTimeline = getEventTimeline(room, id);
        resolvedForIndex = id;
      }
      const absoluteIndex = evtTimeline
        ? getEventIdAbsoluteIndex(
            timelineSync.timeline.linkedTimelines,
            evtTimeline,
            resolvedForIndex
          )
        : undefined;

      if (typeof absoluteIndex === 'number') {
        let processedIndex = getRawIndexToProcessedIndex(absoluteIndex);
        let focusRawIndex = absoluteIndex;
        if (processedIndex === undefined) {
          const nearest = getProcessedRowIndexForRawTimelineIndex(
            processedEventsRef.current,
            absoluteIndex
          );
          if (nearest) {
            processedIndex = nearest.rowIndex;
            focusRawIndex = nearest.focusRawIndex;
          }
        }
        if (vListRef.current && processedIndex !== undefined) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
        }
        timelineSync.setFocusItem({ index: focusRawIndex, scrollTo: false, highlight: true });
      } else {
        timelineSync.loadEventTimeline(anchorId);
      }
    },
  });

  const linkifyOpts = useMemo(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) =>
          renderMatrixMention(
            mx,
            room.roomId,
            href,
            makeMentionCustomProps(mentionClickHandler),
            nicknames
          ),
        mentionClickHandler
      ),
    }),
    [mx, room.roomId, mentionClickHandler, nicknames, settingsLinkBaseUrl]
  );

  const abbrMap = useRoomAbbreviationsContext();

  const htmlReactParserOptions = useMemo(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication: mediaAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        nicknames,
        autoplayEmojis,
        incomingInlineImagesDefaultHeight,
        incomingInlineImagesMaxHeight,
        replaceTextNode: buildAbbrReplaceTextNode(abbrMap, linkifyOpts),
      }),
    [
      mx,
      room.roomId,
      linkifyOpts,
      autoplayEmojis,
      incomingInlineImagesDefaultHeight,
      incomingInlineImagesMaxHeight,
      mentionClickHandler,
      nicknames,
      mediaAuthentication,
      spoilerClickHandler,
      settingsLinkBaseUrl,
      abbrMap,
    ]
  );

  const renderMatrixEvent = useTimelineEventRenderer({
    room,
    mx,
    pushProcessor,
    nicknames,
    imagePackRooms,
    settings: {
      messageLayout,
      messageSpacing,
      hideReads,
      showDeveloperTools,
      hour24Clock,
      dateFormatString,
      mediaAutoLoad,
      showBundledPreview,
      showUrlPreview,
      showClientUrlPreview,
      autoplayStickers,
      hideMemberInReadOnly,
      isReadOnly,
      hideMembershipEvents,
      hideNickAvatarEvents,
      showHiddenEvents,
    },
    state: { focusItem: timelineSync.focusItem, editId, activeReplyId, openThreadId },
    permissions: {
      canRedact: permissions.action('redact', mx.getSafeUserId()),
      canDeleteOwn: permissions.event('m.room.redaction', mx.getSafeUserId()),
      canSendReaction: permissions.event('m.reaction', mx.getSafeUserId()),
      canPinEvent: permissions.stateEvent('m.room.pinned_events', mx.getSafeUserId()),
    },
    callbacks: {
      onUserClick: actions.handleUserClick,
      onUsernameClick: actions.handleUsernameClick,
      onReplyClick: actions.handleReplyClick,
      onReactionToggle: actions.handleReactionToggle,
      onEditId: actions.handleEdit,
      onResend: actions.handleResend,
      onDeleteFailedSend: actions.handleDeleteFailedSend,
      setOpenThread: actions.setOpenThread,
      handleOpenReply: actions.handleOpenReply,
    },
    utils: { htmlReactParserOptions, linkifyOpts, getMemberPowerTag, parseMemberEvent },
  });

  const tryAutoMarkAsRead = useCallback(() => {
    if (!readUptoEventIdRef.current) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
      return;
    }
    const evtTimeline = getEventTimeline(room, readUptoEventIdRef.current);
    const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
    if (latestTimeline === room.getLiveTimeline()) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
    }
  }, [mx, room, hideReads]);

  useDocumentFocusChange(
    useCallback(
      (inFocus) => {
        if (inFocus && atBottomState) tryAutoMarkAsRead();
      },
      [tryAutoMarkAsRead, atBottomState]
    )
  );

  useEffect(() => {
    if (atBottomState && document.hasFocus() && timelineSync.liveTimelineLinked)
      tryAutoMarkAsRead();
  }, [
    atBottomState,
    timelineSync.liveTimelineLinked,
    tryAutoMarkAsRead,
    timelineSync.eventsLength,
  ]);

  const handleVListScroll = useCallback(
    (offset: number) => {
      const v = vListRef.current;
      if (!v) return;

      const distanceFromBottom = v.scrollSize - offset - v.viewportSize;
      const isNowAtBottom = distanceFromBottom < 100;
      if (isNowAtBottom !== atBottomRef.current) {
        setAtBottom(isNowAtBottom);
      }

      if (offset < 500 && canPaginateBackRef.current && backwardStatusRef.current === 'idle') {
        timelineSyncRef.current.handleTimelinePagination(true);
      }
      if (
        distanceFromBottom < 500 &&
        !liveTimelineLinkedRef.current &&
        forwardStatusRef.current === 'idle'
      ) {
        timelineSyncRef.current.handleTimelinePagination(false);
      }
    },
    [setAtBottom]
  );

  const showLoadingPlaceholders =
    timelineSync.eventsLength === 0 &&
    (!isReady || timelineSync.canPaginateBack || timelineSync.backwardStatus === 'loading');

  let backPaginationJSX: ReactNode | undefined;
  if (timelineSync.canPaginateBack || timelineSync.backwardStatus !== 'idle') {
    if (timelineSync.backwardStatus === 'error') {
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
            onClick={() => timelineSync.handleTimelinePagination(true)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    } else if (timelineSync.backwardStatus === 'loading' && timelineSync.eventsLength > 0) {
      backPaginationJSX = (
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      );
    }
  }

  let frontPaginationJSX: ReactNode | undefined;
  if (!timelineSync.liveTimelineLinked || timelineSync.forwardStatus !== 'idle') {
    if (timelineSync.forwardStatus === 'error') {
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
            onClick={() => timelineSync.handleTimelinePagination(false)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    } else if (timelineSync.forwardStatus === 'loading' && timelineSync.eventsLength > 0) {
      frontPaginationJSX = (
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      );
    }
  }

  const vListItemCount =
    timelineSync.eventsLength === 0 &&
    (!isReady || timelineSync.canPaginateBack || timelineSync.backwardStatus === 'loading')
      ? 3
      : timelineSync.eventsLength;
  const vListIndices = useMemo(() => {
    // Keep the cache-busting timeline identity explicit for exhaustive-deps.
    void timelineSync.timeline;
    return Array.from({ length: vListItemCount }, (_, i) => i);
  }, [vListItemCount, timelineSync.timeline]);

  const processedEvents = useProcessedTimeline({
    items: vListIndices,
    linkedTimelines: timelineSync.timeline.linkedTimelines,
    ignoredUsersSet,
    showHiddenEvents,
    showTombstoneEvents,
    mxUserId: mx.getUserId(),
    readUptoEventId: readUptoEventIdRef.current,
    hideMembershipEvents,
    hideNickAvatarEvents,
    isReadOnly,
    hideMemberInReadOnly,
  });

  processedEventsRef.current = processedEvents;

  // Recovery: if the 80 ms initial-scroll timer fired while processedEvents was
  // empty (timeline was mid-reset), scroll to bottom and reveal the timeline once
  // events repopulate.  Fires on every processedEvents.length change but is
  // guarded by pendingReadyRef so it only acts once per initial-scroll attempt.
  useLayoutEffect(() => {
    if (!pendingReadyRef.current) return;
    if (processedEvents.length === 0) return;
    pendingReadyRef.current = false;
    vListRef.current?.scrollToIndex(processedEvents.length - 1, { align: 'end' });
    setIsReady(true);
  }, [processedEvents.length]);

  useEffect(() => {
    if (!onEditLastMessageRef) return;
    const ref = onEditLastMessageRef;
    ref.current = () => {
      const myUserId = mx.getUserId();
      const found = [...processedEventsRef.current]
        .toReversed()
        .find(
          (e) =>
            e.mEvent.getSender() === myUserId &&
            e.mEvent.getType() === 'm.room.message' &&
            !e.mEvent.isRedacted()
        );
      if (found?.mEvent.getId()) actions.handleEdit(found.mEvent.getId());
    };
  }, [onEditLastMessageRef, mx, actions]);

  useEffect(() => {
    const v = vListRef.current;
    if (!v) return;
    if (
      canPaginateBackRef.current &&
      backwardStatusRef.current === 'idle' &&
      v.scrollSize <= v.viewportSize
    ) {
      timelineSyncRef.current.handleTimelinePagination(true);
    }
  }, [timelineSync.eventsLength, timelineSync.backwardStatus]);

  useEffect(() => {
    if (!canPaginateBackRef.current) return () => {};

    let rafId: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const processedLengthAtEffectStart = processedEvents.length;

    const check = () => {
      const v = vListRef.current;
      if (!v) return;

      if (v.viewportSize === 0) {
        attempts += 1;
        if (attempts <= MAX_ATTEMPTS) rafId = requestAnimationFrame(check);
        return;
      }

      if (!canPaginateBackRef.current) return;
      if (backwardStatusRef.current !== 'idle') return;

      const atTop = v.scrollOffset < 500;
      const noVisibleGrowth = processedEvents.length === processedLengthAtEffectStart;
      const hasRealScrollRoom = v.scrollSize > v.viewportSize + 300;

      if (!hasRealScrollRoom || (atTop && noVisibleGrowth)) {
        timelineSyncRef.current.handleTimelinePagination(true);
      }
    };

    rafId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(rafId);
  }, [timelineSync.eventsLength, timelineSync.backwardStatus, processedEvents.length]);

  return (
    <Box grow="Yes" style={{ position: 'relative' }}>
      {unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady && (
        <TimelineFloat position="Top">
          <Chip
            variant="Primary"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.MessageUnread} />}
            onClick={() => timelineSync.loadEventTimeline(unreadInfo.readUptoEventId)}
          >
            <Text size="L400">Jump to Unread</Text>
          </Chip>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.CheckTwice} />}
            onClick={() => markAsRead(mx, room.roomId, hideReads)}
          >
            <Text size="L400">Mark as Read</Text>
          </Chip>
        </TimelineFloat>
      )}

      <div
        ref={messageListRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          opacity: isReady || showLoadingPlaceholders ? 1 : 0,
        }}
      >
        <VList<ProcessedEvent>
          ref={vListRef}
          data={processedEvents}
          shift={shift}
          className={css.messageList}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            paddingTop: topSpacerHeight > 0 ? topSpacerHeight : config.space.S600,
            paddingBottom: config.space.S600,
          }}
          onScroll={handleVListScroll}
        >
          {(eventData, index) => {
            if (showLoadingPlaceholders) {
              return (
                <MessageBase key={`placeholder-${index}`}>
                  {messageLayout === MessageLayout.Compact ? (
                    <CompactPlaceholder />
                  ) : (
                    <DefaultPlaceholder />
                  )}
                </MessageBase>
              );
            }

            if (!eventData) {
              if (index === 0 && !timelineSync.canPaginateBack) {
                return (
                  <Fragment key="intro-and-first">
                    {backPaginationJSX}
                    <div
                      style={{
                        padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)}`,
                      }}
                    >
                      <RoomIntro room={room} />
                    </div>
                  </Fragment>
                );
              }
              if (index === 0) return <Fragment key="first">{backPaginationJSX}</Fragment>;
              return <Fragment key={index} />;
            }

            const renderedEvent = renderMatrixEvent(
              eventData.mEvent.getType(),
              typeof eventData.mEvent.getStateKey() === 'string',
              eventData.id,
              eventData.mEvent,
              eventData.itemIndex,
              eventData.timelineSet,
              eventData.collapsed
            );

            const dividers = (
              <>
                {eventData.willRenderDayDivider && (
                  <MessageBase space={messageSpacing}>
                    <TimelineDivider variant="Surface">
                      <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
                        <Text size="L400">{getDayDividerText(eventData.mEvent.getTs())}</Text>
                      </Badge>
                    </TimelineDivider>
                  </MessageBase>
                )}
                {eventData.willRenderNewDivider && (
                  <MessageBase space={messageSpacing}>
                    <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
                      <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
                        <Text size="L400">New Messages</Text>
                      </Badge>
                    </TimelineDivider>
                  </MessageBase>
                )}
              </>
            );

            if (index === 0) {
              return (
                <Fragment key="first-item-block">
                  {!timelineSync.canPaginateBack && (
                    <div
                      style={{
                        padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)}`,
                      }}
                    >
                      <RoomIntro room={room} />
                    </div>
                  )}
                  {backPaginationJSX}
                  {dividers}
                  {renderedEvent}
                </Fragment>
              );
            }

            return (
              <Fragment key={eventData.id}>
                {dividers}
                {renderedEvent}
              </Fragment>
            );
          }}
        </VList>
      </div>

      {frontPaginationJSX}

      {!atBottomState && isReady && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.ArrowBottom} />}
            onClick={() => {
              if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
              timelineSync.setTimeline(getInitialTimeline(room));
              scrollToBottom();
            }}
          >
            <Text size="L400">Jump to Latest</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}
