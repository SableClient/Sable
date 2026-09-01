import type { ReactNode } from 'react';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import type { ProseMirrorEditorController } from '$components/editor/prosemirrorController';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import type { Room, MatrixEvent, EventTimelineSet } from '$types/matrix-sdk';
import { Direction, EventTimeline, EventType, MsgType, RoomEvent } from '$types/matrix-sdk';
import classNames from 'classnames';
import type { VListHandle } from 'virtua';
import { VList } from 'virtua';
import type { ContainerColor } from 'folds';
import { as, Box, Chip, Line, Text, Badge, color, config, toRem, Spinner } from 'folds';
import { ArrowDown, ChatTeardropDots, Checks, chipIcon } from '$components/icons/phosphor';
import { MessageBase, CompactPlaceholder, DefaultPlaceholder } from '$components/message';
import { RoomIntro } from '$components/room-intro';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMatrixEvent } from '$hooks/useMatrixEvent';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { useAlive } from '$hooks/useAlive';
import { useMessageEdit } from '$hooks/useMessageEdit';
import { useDocumentFocusChange } from '$hooks/useDocumentFocusChange';
import { useIsInactivePanel } from '$hooks/useRoom';
import { markAsRead } from '$utils/notifications';
import { isWindowFocused } from '$utils/dom';
import { today, yesterday, timeDayMonthYear } from '$utils/time';
import {
  unwrapRelationJumpTarget,
  isEditEvent,
  isReactionEvent,
  isRedactableMessageType,
  isMembershipChanged,
  isThreadRelationEvent,
  getRedactionTargetEvent,
  shouldShowRedactionTimelineEvent,
} from '$utils/room/relations';
import { getMemberDisplayName } from '$utils/room/display';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useSlidingSyncRoomLoading } from '$hooks/useSlidingSyncActiveRoom';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { showErrorToast } from '$state/toast';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { settingsAtom, MessageLayout, type MessageSpacing } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { nicknamesAtom } from '$state/nicknames';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import {
  getRoomUnreadInfo,
  getEventTimeline,
  getDisplayedEventTimeline,
  getFirstLinkedTimeline,
  getEventIdAbsoluteIndex,
  isNewestLiveEvent,
} from '$utils/timeline';
import { useTimelineSync } from '$hooks/timeline/useTimelineSync';
import { useTimelineActions } from '$hooks/timeline/useTimelineActions';
import {
  useProcessedTimeline,
  getProcessedRowIndexForRawTimelineIndex,
  STANDARD_RENDERED_EVENT_TYPES,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import { useTimelineEventRenderer } from '$hooks/timeline/useTimelineEventRenderer';
import { RoomMediaViewer } from '$components/image-viewer/RoomMediaViewer';
import type { RoomMediaItem } from '$components/image-viewer/RoomMediaViewer';
import type { IImageContent } from '$types/matrix/common';
import { useTimelineRendererContext } from '$hooks/timeline/useTimelineRendererContext';
import { useUrlPreviewPrefetch } from '$hooks/timeline/useUrlPreviewPrefetch';
import { TimelineScrollingProvider, useScrollActivity } from '$hooks/useTimelineScrollActivity';
import * as css from './RoomTimeline.css';
import type { Persona } from '$app/persona';

const MAX_VIEWPORT_FILL_PAGINATIONS = 5;
const VIRTUA_SCROLL_SETTLE_MS = 200;
const FOCUSED_PAGINATION_EDGE_PX = 64;
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

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

const focusItemAffectsEvent = (focusItem: unknown, eventData: ProcessedEvent | undefined) => {
  if (!focusItem || typeof focusItem !== 'object' || !eventData) return false;
  const focusEventId = 'eventId' in focusItem ? focusItem.eventId : undefined;
  return typeof focusEventId === 'string' && focusEventId === eventData.id;
};

const eventIdAffectsEvent = (eventId: string | null | undefined, eventData?: ProcessedEvent) =>
  typeof eventId === 'string' && eventId === eventData?.id;

const shallowEqual = (prev: Record<string, unknown>, next: Record<string, unknown>) => {
  if (prev === next) return true;
  if (Object.keys(prev).length !== Object.keys(next).length) return false;
  for (const key in prev) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
};

const MemoizedTimelineItem = memo(
  function MemoizedTimelineItem({
    eventData,
    index,
    showLoadingPlaceholders,
    canPaginateBack,
    backPaginationJSX,
    room,
    messageLayout,
    messageSpacing,
    renderMatrixEvent,
  }: {
    eventData: ProcessedEvent | undefined;
    index: number;
    showLoadingPlaceholders: boolean;
    canPaginateBack: boolean;
    backPaginationJSX: ReactNode | undefined;
    room: Room;
    messageLayout: MessageLayout;
    messageSpacing: MessageSpacing;
    settings: Record<string, unknown>;
    permissions: Record<string, unknown>;
    renderMatrixEvent: ReturnType<typeof useTimelineEventRenderer>;
    focusItem: unknown;
    editId: string | undefined;
    activeReplyId: string | undefined | null;
    openThreadId: string | undefined;
  }) {
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
      if (index === 0 && !canPaginateBack) {
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

    const showDividers = renderedEvent !== null;

    const dividers = showDividers ? (
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
    ) : null;

    if (index === 0) {
      return (
        <Fragment key="first-item-block">
          {!canPaginateBack && (
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
  },
  (prev, next) => {
    if (prev.index !== next.index) return false;
    if (prev.showLoadingPlaceholders !== next.showLoadingPlaceholders) return false;
    if (prev.canPaginateBack !== next.canPaginateBack) return false;
    if (prev.room !== next.room) return false;
    if (prev.messageLayout !== next.messageLayout) return false;
    if (prev.messageSpacing !== next.messageSpacing) return false;
    if (prev.renderMatrixEvent !== next.renderMatrixEvent) return false;

    // Shallow compare settings and permissions since both hold primitive toggles
    if (!shallowEqual(prev.settings, next.settings)) return false;
    if (!shallowEqual(prev.permissions, next.permissions)) return false;

    if (
      prev.focusItem !== next.focusItem &&
      (focusItemAffectsEvent(prev.focusItem, prev.eventData) ||
        focusItemAffectsEvent(next.focusItem, next.eventData))
    )
      return false;
    if (
      prev.editId !== next.editId &&
      (eventIdAffectsEvent(prev.editId, prev.eventData) ||
        eventIdAffectsEvent(next.editId, next.eventData))
    )
      return false;
    if (
      prev.activeReplyId !== next.activeReplyId &&
      (eventIdAffectsEvent(prev.activeReplyId, prev.eventData) ||
        eventIdAffectsEvent(next.activeReplyId, next.eventData))
    )
      return false;
    if (
      prev.openThreadId !== next.openThreadId &&
      (eventIdAffectsEvent(prev.openThreadId, prev.eventData) ||
        eventIdAffectsEvent(next.openThreadId, next.eventData))
    )
      return false;

    if (prev.index === 0 && prev.backPaginationJSX !== next.backPaginationJSX) return false;

    if (prev.eventData === next.eventData) return true;
    if (!prev.eventData || !next.eventData) return false;

    return (
      prev.eventData.id === next.eventData.id &&
      // A filtered mid-timeline insert shifts this without changing `index`.
      prev.eventData.itemIndex === next.eventData.itemIndex &&
      prev.eventData.isRedacted === next.eventData.isRedacted &&
      prev.eventData.collapsed === next.eventData.collapsed &&
      prev.eventData.willRenderNewDivider === next.eventData.willRenderNewDivider &&
      prev.eventData.willRenderDayDivider === next.eventData.willRenderDayDivider &&
      prev.eventData.mEvent === next.eventData.mEvent &&
      prev.eventData.eventSender === next.eventData.eventSender &&
      prev.eventData.editId === next.eventData.editId &&
      prev.eventData.reactionsKey === next.eventData.reactionsKey &&
      prev.eventData.content === next.eventData.content &&
      prev.eventData.sendStatus === next.eventData.sendStatus
    );
  }
);
export type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  editor: ProseMirrorEditorController;
  onEditorReset?: () => void;
  onEditLastMessageRef?: React.MutableRefObject<(() => void) | undefined>;
  editId?: string;
  onEditId?: (editId?: string) => void;
};

const getRoomMediaItem = (
  mEvent: MatrixEvent,
  room: Room,
  nicknames?: Record<string, string>
): RoomMediaItem | undefined => {
  if (mEvent.isRedacted()) return undefined;

  const content = mEvent.getContent() as IImageContent;
  const isImage = content.msgtype === MsgType.Image || mEvent.getType() === 'm.sticker';
  const url = content.file?.url ?? content.url;
  const eventId = mEvent.getId();

  if (!isImage || typeof url !== 'string' || !eventId) return undefined;

  const senderId = mEvent.getSender();

  return {
    eventId,
    body: content.body ?? content.filename ?? 'Image',
    filename: content.filename,
    url,
    info: content.info,
    mimeType: content.info?.mimetype,
    encInfo: content.file,
    sender: senderId ? (getMemberDisplayName(room, senderId, nicknames) ?? senderId) : undefined,
    timestamp: mEvent.getTs(),
  };
};

export function RoomTimeline({
  room,
  eventId,
  editor,
  onEditorReset,
  onEditLastMessageRef,
  editId: propsEditId,
  onEditId: propsOnEditId,
}: Readonly<RoomTimelineProps>) {
  const mx = useMatrixClient();
  const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;
  const alive = useAlive();
  const roomSyncLoading = useSlidingSyncRoomLoading(room.roomId);

  const internalEdit = useMessageEdit(editor, { onReset: onEditorReset, alive });
  const editId = propsOnEditId ? propsEditId : internalEdit.editId;
  const handleEdit = propsOnEditId ?? internalEdit.handleEdit;
  const { navigateRoom } = useRoomNavigate();
  const isInactivePanel = useIsInactivePanel();
  const isInactivePanelRef = useRef(isInactivePanel);
  isInactivePanelRef.current = isInactivePanel;

  // Shared renderer context — replaces 17+ inline useSetting calls, linkifyOpts,
  // htmlReactParserOptions, and the permissions block that were duplicated with
  // ThreadDrawer character-for-character.
  const rendererCtx = useTimelineRendererContext(room);

  // RoomTimeline keeps these 3 extra settings inline:
  //   - hideMembershipEvents & hideNickAvatarEvents → already in rendererCtx.settings
  //   - reducedMotion → used only for scroll logic, NOT passed to the event renderer
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');

  // Destructure what we need from the shared context
  const {
    settings,
    linkifyOpts,
    htmlReactParserOptions,
    permissions: {
      canRedact,
      canDeleteOwn,
      canSendReaction,
      canPinEvent,
      isReadOnly,
      getMemberPowerTag,
      parseMemberEvent,
    },
  } = rendererCtx;

  const hiddenEvents = settings.hiddenEvents;
  const messageLayout = settings.messageLayout;
  const messageSpacing = settings.messageSpacing;
  const hideReads = settings.hideReads;
  const hideMembershipEvents = settings.hideMembershipEvents;
  const hideNickAvatarEvents = settings.hideNickAvatarEvents;
  const hideMemberInReadOnly = settings.hideMemberInReadOnly;

  const nicknames = useAtomValue(nicknamesAtom);
  const jotaiStore = useStore();
  const getGlobalProfile = useCallback(
    (userId: string) => jotaiStore.get(profilesCacheAtom)[userId],
    [jotaiStore]
  );
  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  const [unreadInfo, setUnreadInfo] = useState(() => getRoomUnreadInfo(room, true));
  const unreadScrollToRef = useRef(unreadInfo?.scrollTo === true);
  unreadScrollToRef.current = unreadInfo?.scrollTo === true;

  const readUptoEventIdRef = useRef<string | undefined>(undefined);
  if (unreadInfo) readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  const hideReadsRef = useRef(hideReads);
  hideReadsRef.current = hideReads;

  const scrollAnchorRef = useRef<string | undefined>(undefined);
  const messageListRef = useRef<HTMLDivElement>(null);

  const openUserRoomProfile = useOpenUserRoomProfile();
  const optionalSpace = useSpaceOptionally();
  const roomParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms = useImagePackRooms(room.roomId, roomParents);
  const pushProcessor = mx.pushProcessor;

  const replyDraftAtom = useMemo(() => roomIdToReplyDraftAtomFamily(room.roomId), [room.roomId]);
  const activeReplyDraft = useAtomValue(replyDraftAtom);
  const setReplyDraft = useSetAtom(replyDraftAtom);
  const activeReplyId = activeReplyDraft?.eventId;

  const openThreadAtom = useMemo(() => roomIdToOpenThreadAtomFamily(room.roomId), [room.roomId]);
  const openThreadId = useAtomValue(openThreadAtom);
  const setOpenThread = useSetAtom(openThreadAtom);

  const vListRef = useRef<VListHandle>(null);
  const { isScrolling: isTimelineScrolling, notifyScroll } = useScrollActivity();
  const [atBottomState, setAtBottomState] = useState(true);
  const atBottomRef = useRef(atBottomState);
  const setAtBottom = useCallback((val: boolean) => {
    setAtBottomState(val);
    atBottomRef.current = val;
  }, []);

  const syncAtBottom = useCallback(
    (offset?: number) => {
      const v = vListRef.current;
      if (!v) return;
      const scrollTop = offset ?? v.scrollOffset;
      let isNowAtBottom = v.scrollSize - scrollTop - v.viewportSize < 100;
      if (isNowAtBottom && !atBottomRef.current && timelineSyncRef.current.focusItem) {
        isNowAtBottom = false;
      }
      if (isNowAtBottom !== atBottomRef.current) setAtBottom(isNowAtBottom);
    },
    [setAtBottom]
  );

  const [topSpacerHeight, setTopSpacerHeight] = useState(0);

  const topSpacerHeightRef = useRef(0);
  const hasInitialScrolledRef = useRef(false);
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialScrollCancelledRef = useRef(false);
  const hasUserScrollIntentRef = useRef(false);
  const focusedPaginationIntentRef = useRef<'backward' | 'forward' | undefined>(undefined);
  const touchStartYRef = useRef<number | undefined>(undefined);
  const pendingReadyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const processedEventsRef = useRef<ProcessedEvent[]>([]);
  const timelineSyncRef = useRef<typeof timelineSync>(null as unknown as typeof timelineSync);

  const scrollElRef = useRef<HTMLElement | null>(null);
  const [scrollElementVersion, setScrollElementVersion] = useState(0);
  const prevViewportHeightRef = useRef(0);

  const scrollToBottom = useCallback(
    (behavior: 'instant' | 'smooth' = 'instant') => {
      const v = vListRef.current;
      const lastIndex = processedEventsRef.current.length - 1;
      if (!v || lastIndex < 0) return;

      const scrollEl = scrollElRef.current;
      let offset = 0;
      if (scrollEl) {
        const target = v.getItemOffset(lastIndex) + v.getItemSize(lastIndex) - v.viewportSize;
        offset = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight - target);
      }

      v.scrollToIndex(lastIndex, {
        align: 'end',
        offset,
        smooth: behavior === 'smooth' && !reducedMotion,
      });
    },
    [reducedMotion]
  );

  useLayoutEffect(() => {
    const messageListEl = messageListRef.current;
    if (!messageListEl) return () => {};

    const resolveScrollElement = () => {
      const scrollEl = messageListEl.firstElementChild;
      const nextScrollEl = scrollEl instanceof HTMLElement ? scrollEl : null;
      if (nextScrollEl === scrollElRef.current) return;
      scrollElRef.current = nextScrollEl;
      setScrollElementVersion((version) => version + 1);
    };

    resolveScrollElement();
    const observer = new MutationObserver(resolveScrollElement);
    observer.observe(messageListEl, { childList: true });
    return () => observer.disconnect();
  }, []);

  const jumpToEvent = useCallback(
    (id: string) => {
      setAtBottom(false);
      scrollAnchorRef.current = id;
      void timelineSyncRef.current.loadEventTimeline(id);
    },
    [setAtBottom]
  );
  const handleJumpError = useCallback(() => {
    scrollAnchorRef.current = undefined;
    setAtBottom(true);
    showErrorToast('Unable to load this message.');
  }, [setAtBottom]);
  const handleReturnToLive = useCallback(() => {
    scrollAnchorRef.current = undefined;
    if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
    setAtBottom(true);
  }, [eventId, navigateRoom, room.roomId, setAtBottom]);

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
    isInactivePanelRef,
    onJumpError: handleJumpError,
    onReturnToLive: handleReturnToLive,
    isEventVisible: useCallback(
      (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => {
        const sender = mEvent.getSender();
        if (sender && ignoredUsersSet.has(sender)) return false;

        const type = mEvent.getType();
        const isEdit = isEditEvent(mEvent);
        const isReaction = isReactionEvent(mEvent);
        const isRedactionEvt = mEvent.isRedaction();

        if (hideMemberInReadOnly && isReadOnly) {
          if (isReaction) return false;
          if (
            isRedactionEvt &&
            getRedactionTargetEvent(timelineSet, mEvent)?.getType() ===
              (EventType.Reaction as string)
          ) {
            return false;
          }
        }

        if (mEvent.isRedacted()) {
          const showMessageTombstone =
            hiddenEvents.showTombstoneEvents && isRedactableMessageType(type);
          const showReactionTombstone = hiddenEvents.hiddenEventReactionTombstone && isReaction;
          if (!showMessageTombstone && !showReactionTombstone) return false;
        }

        if (type === 'm.room.member') {
          const membershipChanged = isMembershipChanged(mEvent);
          if (hideMemberInReadOnly && isReadOnly) return false;
          if (membershipChanged && hideMembershipEvents) return false;
          if (!membershipChanged && hideNickAvatarEvents) return false;
        }

        const allowSpecificHiddenEvent =
          (isEdit && hiddenEvents.hiddenEventEdits) ||
          (isReaction && !mEvent.isRedacted() && hiddenEvents.hiddenEventReactions) ||
          (isReaction && mEvent.isRedacted() && hiddenEvents.hiddenEventReactionTombstone) ||
          (isRedactionEvt &&
            shouldShowRedactionTimelineEvent(
              mEvent,
              timelineSet,
              hiddenEvents.hiddenEventRedactionTimeline,
              hiddenEvents.hiddenEventReactionRedactionTimeline
            ));

        if (!(hiddenEvents.showHiddenEvents && hiddenEvents.hiddenEventOther)) {
          const isStandardRendered = STANDARD_RENDERED_EVENT_TYPES.has(type);
          if (!isStandardRendered && !allowSpecificHiddenEvent) {
            return false;
          }
        }

        const threadRootId = mEvent.threadRootId;
        if (
          threadRootId !== undefined &&
          threadRootId !== mEvent.getId() &&
          isThreadRelationEvent(mEvent, threadRootId)
        ) {
          return false;
        }

        if (isEdit && !hiddenEvents.hiddenEventEdits) return false;
        if (isReaction) {
          if (mEvent.isRedacted()) {
            if (!hiddenEvents.hiddenEventReactionTombstone) return false;
          } else if (!hiddenEvents.hiddenEventReactions) {
            return false;
          }
        }
        if (
          isRedactionEvt &&
          !shouldShowRedactionTimelineEvent(
            mEvent,
            timelineSet,
            hiddenEvents.hiddenEventRedactionTimeline,
            hiddenEvents.hiddenEventReactionRedactionTimeline
          )
        ) {
          return false;
        }

        return true;
      },
      [
        hiddenEvents,
        hideMemberInReadOnly,
        isReadOnly,
        hideMembershipEvents,
        hideNickAvatarEvents,
        ignoredUsersSet,
      ]
    ),
  });

  timelineSyncRef.current = timelineSync;
  const focusLiveTimeline = timelineSync.focusLiveTimeline;

  const eventsLengthRef = useRef(timelineSync.eventsLength);
  eventsLengthRef.current = timelineSync.eventsLength;

  const canPaginateBackRef = useRef(timelineSync.canPaginateBack);
  canPaginateBackRef.current = timelineSync.canPaginateBack;
  const viewportFillCountRef = useRef(0);

  const liveTimelineLinkedRef = useRef(timelineSync.liveTimelineLinked);
  liveTimelineLinkedRef.current = timelineSync.liveTimelineLinked;

  const backwardStatusRef = useRef(timelineSync.backwardStatus);
  backwardStatusRef.current = timelineSync.backwardStatus;

  const forwardStatusRef = useRef(timelineSync.forwardStatus);
  forwardStatusRef.current = timelineSync.forwardStatus;

  const canPaginateForwardRef = useRef(timelineSync.canPaginateForward);
  canPaginateForwardRef.current = timelineSync.canPaginateForward;

  const scrollOwner: 'live' | 'event' =
    eventId !== undefined ||
    timelineSync.focusItem !== undefined ||
    !timelineSync.liveTimelineLinked
      ? 'event'
      : 'live';
  const scrollOwnerRef = useRef(scrollOwner);
  scrollOwnerRef.current = scrollOwner;

  const resolveFocusRowIndex = useCallback((focusEventId: string): number | undefined => {
    const events = processedEventsRef.current;
    const rowIndex = events.findIndex((e) => e.id === focusEventId);
    if (rowIndex >= 0) return rowIndex;

    const linkedTimelines = timelineSyncRef.current.timeline.linkedTimelines;
    const evtTimeline = getDisplayedEventTimeline(linkedTimelines, focusEventId);
    if (!evtTimeline) return undefined;
    const rawIndex = getEventIdAbsoluteIndex(linkedTimelines, evtTimeline, focusEventId);
    if (rawIndex === undefined) return undefined;
    return getProcessedRowIndexForRawTimelineIndex(events, rawIndex)?.rowIndex;
  }, []);

  const restoreScrollAnchor = useCallback(() => {
    const anchorId = scrollAnchorRef.current;
    if (!anchorId) return;
    const index = resolveFocusRowIndex(anchorId);
    if (index !== undefined) vListRef.current?.scrollToIndex(index, { align: 'center' });
  }, [resolveFocusRowIndex]);

  const restoreScrollPosition = useCallback(() => {
    if (scrollAnchorRef.current !== undefined) {
      restoreScrollAnchor();
      return;
    }
    if (atBottomRef.current && processedEventsRef.current.length > 0) scrollToBottom();
  }, [restoreScrollAnchor, scrollToBottom]);

  useLayoutEffect(() => {
    if (!eventId) return;
    if (initialScrollTimerRef.current !== undefined) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = undefined;
    }
    pendingReadyRef.current = false;
  }, [eventId]);

  useLayoutEffect(() => {
    if (
      scrollOwner === 'live' &&
      !hasInitialScrolledRef.current &&
      timelineSync.eventsLength > 0 &&
      timelineSync.liveTimelineLinked &&
      vListRef.current
    ) {
      initialScrollCancelledRef.current = false;
      scrollToBottom();
      initialScrollTimerRef.current = setTimeout(() => {
        initialScrollTimerRef.current = undefined;
        if (initialScrollCancelledRef.current) return;
        if (unreadScrollToRef.current) {
          setIsReady(true);
          return;
        }
        if (processedEventsRef.current.length > 0) {
          scrollToBottom();
          requestAnimationFrame(() => {
            if (initialScrollCancelledRef.current) return;
            if (processedEventsRef.current.length > 0) {
              scrollToBottom();
              setIsReady(true);
            } else {
              pendingReadyRef.current = true;
            }
          });
        } else {
          pendingReadyRef.current = true;
        }
      }, 80);
      hasInitialScrolledRef.current = true;
    }
  }, [
    timelineSync.eventsLength,
    timelineSync.liveTimelineLinked,
    scrollOwner,
    room.roomId,
    scrollToBottom,
  ]);

  useEffect(
    () => () => {
      if (initialScrollTimerRef.current !== undefined) clearTimeout(initialScrollTimerRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    if (timelineSync.eventsLength > 0) return;
    hasInitialScrolledRef.current = false;
  }, [timelineSync.eventsLength]);

  const recalcTopSpacer = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const prev = topSpacerHeightRef.current;

    const newH = Math.max(0, v.viewportSize - v.scrollSize + prev);
    if (Math.abs(prev - newH) > 2) {
      topSpacerHeightRef.current = newH;
      setTopSpacerHeight(newH);
      if (prev > 0 && newH === 0 && processedEventsRef.current.length > 0) {
        requestAnimationFrame(restoreScrollPosition);
      }
    }
  }, [restoreScrollPosition]);

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
    } else if (
      prev === 'loading' &&
      timelineSync.backwardStatus === 'idle' &&
      !timelineSync.backwardError
    ) {
      if (scrollOwnerRef.current === 'event' && scrollAnchorRef.current !== undefined) {
        restoreScrollAnchor();
      } else if (wasAtBottomBeforePaginationRef.current) scrollToBottom();
    }
  }, [
    timelineSync.backwardStatus,
    timelineSync.backwardError,
    restoreScrollAnchor,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!timelineSync.focusItem?.scrollTo || !vListRef.current) return;
    const processedIndex = resolveFocusRowIndex(timelineSync.focusItem.eventId);
    if (processedIndex === undefined) return;

    const landedId = processedEventsRef.current[processedIndex]?.id;
    const isLiveEnd =
      landedId === timelineSync.focusItem.eventId &&
      isNewestLiveEvent(room, timelineSync.focusItem.eventId) &&
      getEventTimeline(room, timelineSync.focusItem.eventId) === room.getLiveTimeline() &&
      timelineSync.liveTimelineLinked &&
      processedIndex === processedEventsRef.current.length - 1;
    if (isLiveEnd) {
      scrollAnchorRef.current = undefined;
      setAtBottom(true);
      scrollToBottom();
      if (eventId === timelineSync.focusItem.eventId) {
        navigateRoom(room.roomId, undefined, { replace: true });
      }
      timelineSyncRef.current.setFocusItem(undefined);
      return;
    }

    scrollAnchorRef.current = landedId ?? timelineSync.focusItem.eventId;
    if (landedId && landedId !== timelineSync.focusItem.eventId) {
      timelineSyncRef.current.setFocusItem((prev) =>
        prev ? { ...prev, eventId: landedId, scrollTo: true } : undefined
      );
    }
    vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
    const replayId = setTimeout(() => {
      if (timelineSyncRef.current.focusItem?.scrollTo) restoreScrollAnchor();
    }, VIRTUA_SCROLL_SETTLE_MS);
    return () => clearTimeout(replayId);
  }, [
    timelineSync.focusItem,
    timelineSync.eventsLength,
    timelineSync.liveTimelineLinked,
    eventId,
    navigateRoom,
    resolveFocusRowIndex,
    room,
    restoreScrollAnchor,
    scrollToBottom,
    setAtBottom,
  ]);

  useEffect(() => {
    if (!timelineSync.focusItem) return undefined;
    const timeoutId = setTimeout(() => {
      timelineSyncRef.current.setFocusItem(undefined);
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [timelineSync.focusItem]);

  useEffect(() => {
    if (timelineSync.focusItem || timelineSync.jumpFailed) {
      setIsReady(true);
    }
  }, [timelineSync.focusItem, timelineSync.jumpFailed]);

  useEffect(() => {
    if (!eventId) return;
    jumpToEvent(eventId);
  }, [eventId, room, jumpToEvent]);

  const previousEventIdRef = useRef(eventId);
  useEffect(() => {
    const previousEventId = previousEventIdRef.current;
    previousEventIdRef.current = eventId;
    if (previousEventId === undefined || eventId !== undefined) return;

    scrollAnchorRef.current = undefined;
    focusLiveTimeline();
    setAtBottom(true);
  }, [eventId, focusLiveTimeline, setAtBottom]);

  useEffect(() => {
    if (eventId) return;
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
        const rows = processedEventsRef.current;
        const exactRow = rows.findIndex((e) => e.id === readUptoEventId);
        const processedIndex =
          exactRow >= 0
            ? exactRow
            : getProcessedRowIndexForRawTimelineIndex(rows, absoluteIndex)?.rowIndex;
        if (processedIndex !== undefined && vListRef.current) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'start' });
          setAtBottom(false);
        }
        unreadScrollToRef.current = false;
        setUnreadInfo((prev) => (prev ? { ...prev, scrollTo: false } : prev));
      }
    }
  }, [room, unreadInfo, timelineSync.timeline.linkedTimelines, eventId, isReady, setAtBottom]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return () => {};

    const contentEl = scrollElRef.current?.firstElementChild;
    let contentObserver: ResizeObserver | undefined;
    if (contentEl) {
      contentObserver = new ResizeObserver(() => {
        if (scrollOwnerRef.current === 'live' && atBottomRef.current) scrollToBottom();
        syncAtBottom();
      });
      contentObserver.observe(contentEl);
    }

    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]!.contentRect.height;
      const prev = prevViewportHeightRef.current;
      const shrank = newHeight < prev;
      prevViewportHeightRef.current = newHeight;
      let rePinned = false;
      if (scrollOwnerRef.current === 'live' && atBottomRef.current && shrank) {
        // The atBottom flag lags real scroll position by up to 100px, so a user
        // who has begun scrolling up is still flagged while a growing composer
        // shrinks the viewport. Only re-pin when the user was actually pinned to
        // the pre-resize bottom, measured against the old viewport height.
        const v = vListRef.current;
        const wasPinned = Boolean(v && v.scrollSize - v.scrollOffset - prev < 40);
        if (wasPinned) {
          // Geometry is still pre-scroll here; the repin's own scroll event resyncs.
          scrollToBottom();
          rePinned = true;
        }
      }
      if (!rePinned) syncAtBottom();
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      contentObserver?.disconnect();
    };
  }, [scrollElementVersion, scrollToBottom, syncAtBottom]);

  const actions = useTimelineActions({
    room,
    mx,
    editor,
    nicknames,
    getGlobalProfile,
    spaceId: optionalSpace?.roomId,
    openUserRoomProfile: openUserRoomProfile as unknown as (
      roomId: string,
      spaceId: string | undefined,
      userId: string,
      pmp: Persona | undefined,
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
      let resolvedId = anchorId;
      let processedIndex = resolveFocusRowIndex(anchorId);
      if (processedIndex === undefined && anchorId !== id) {
        resolvedId = id;
        processedIndex = resolveFocusRowIndex(id);
      }

      if (processedIndex !== undefined) {
        timelineSync.cancelEventTimelineLoad();
        setAtBottom(false);
        if (vListRef.current) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
        }
        const landedId = processedEventsRef.current[processedIndex]?.id ?? resolvedId;
        scrollAnchorRef.current = landedId;
        timelineSync.setFocusItem({ eventId: landedId, scrollTo: false, highlight: true });
      } else {
        jumpToEvent(anchorId);
      }
    },
  });

  // renderMatrixEvent keeps a stable identity and reads these through a ref, so
  // the row memo has to compare them itself to notice a power-level change.
  const rowPermissions = { canRedact, canDeleteOwn, canSendReaction, canPinEvent };

  const [selectedMediaEventId, setSelectedMediaEventId] = useState<string>();
  const [roomMedia, setRoomMedia] = useState<RoomMediaItem[]>([]);
  const openRoomMedia = useCallback(
    (mEvent: MatrixEvent) => {
      const mediaEventId = mEvent.getId();
      if (!isMobile || !mediaEventId || !getRoomMediaItem(mEvent, room, nicknames)) return false;
      setRoomMedia(
        timelineSyncRef.current.timeline.linkedTimelines.flatMap((timeline) =>
          timeline.getEvents().flatMap((timelineEvent) => {
            const item = getRoomMediaItem(timelineEvent, room, nicknames);
            return item ? [item] : [];
          })
        )
      );
      setSelectedMediaEventId(mediaEventId);
      return true;
    },
    [isMobile, room, nicknames]
  );

  const renderMatrixEvent = useTimelineEventRenderer({
    room,
    mx,
    pushProcessor,
    nicknames,
    getProfile: getGlobalProfile,
    imagePackRooms,
    settings,
    state: { focusItem: timelineSync.focusItem, editId, activeReplyId, openThreadId },
    permissions: rowPermissions,
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
      onOpenMedia: openRoomMedia,
    },
    utils: { htmlReactParserOptions, linkifyOpts, getMemberPowerTag, parseMemberEvent },
  });

  const tryAutoMarkAsRead = useCallback(() => {
    if (isInactivePanel) return; // Don't clear unread while room is behind the list
    if (!atBottomRef.current) return;
    if (!readUptoEventIdRef.current) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
      return;
    }
    const evtTimeline = getEventTimeline(room, readUptoEventIdRef.current);
    const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
    if (latestTimeline === room.getLiveTimeline()) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
    }
  }, [mx, room, hideReads, isInactivePanel]);

  useDocumentFocusChange(
    useCallback(
      (inFocus) => {
        if (inFocus) {
          if (atBottomState && timelineSync.liveTimelineLinked) tryAutoMarkAsRead();
          return;
        }
        // Re-anchor the divider at the last read when tabbing out while caught up.
        if (atBottomState && timelineSync.liveTimelineLinked) {
          readUptoEventIdRef.current = undefined;
          setUnreadInfo(undefined);
        }
      },
      [tryAutoMarkAsRead, atBottomState, timelineSync.liveTimelineLinked, setUnreadInfo]
    )
  );

  // Reading elsewhere clears the room list badge, so clear the in-room marker too.
  useMatrixEvent(
    room,
    RoomEvent.Receipt,
    useCallback(
      (mEvent: MatrixEvent) => {
        const myUserId = mx.getUserId();
        if (!myUserId) return;
        const content =
          mEvent.getContent<Record<string, Record<string, Record<string, unknown>>>>();
        const isMyReceipt = Object.values(content).some((byType) =>
          Object.values(byType ?? {}).some((byUser) => myUserId in (byUser ?? {}))
        );
        // Re-anchoring on a partial remote read would move the divider mid-read.
        if (!isMyReceipt || getRoomUnreadInfo(room)) return;
        readUptoEventIdRef.current = undefined;
        setUnreadInfo(undefined);
      },
      [mx, room]
    )
  );

  useEffect(() => {
    if (atBottomState && isWindowFocused() && timelineSync.liveTimelineLinked) tryAutoMarkAsRead();
  }, [
    atBottomState,
    timelineSync.liveTimelineLinked,
    tryAutoMarkAsRead,
    timelineSync.eventsLength,
  ]);

  useEffect(() => {
    const messageListEl = messageListRef.current;
    if (!messageListEl) return () => {};
    const setFocusedPaginationIntent = (direction: 'backward' | 'forward') => {
      hasUserScrollIntentRef.current = true;
      scrollAnchorRef.current = undefined;
      if (eventId === undefined && !timelineSyncRef.current.focusItem) return;
      focusedPaginationIntentRef.current = direction;
    };
    const recordWheelIntent = (evt: WheelEvent) => {
      if (evt.deltaY === 0) return;
      setFocusedPaginationIntent(evt.deltaY < 0 ? 'backward' : 'forward');
    };
    const recordKeyIntent = (evt: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(evt.key)) return;
      if (evt.key === 'Home' || evt.key === 'PageUp' || evt.key === 'ArrowUp') {
        setFocusedPaginationIntent('backward');
      } else if (evt.key === 'End' || evt.key === 'PageDown' || evt.key === 'ArrowDown') {
        setFocusedPaginationIntent('forward');
      } else {
        setFocusedPaginationIntent(evt.shiftKey ? 'backward' : 'forward');
      }
    };
    const recordTouchStart = (evt: TouchEvent) => {
      touchStartYRef.current = evt.touches[0]?.clientY;
    };
    const recordTouchIntent = (evt: TouchEvent) => {
      const startY = touchStartYRef.current;
      const currentY = evt.touches[0]?.clientY;
      if (startY === undefined || currentY === undefined || startY === currentY) return;
      setFocusedPaginationIntent(currentY < startY ? 'forward' : 'backward');
      touchStartYRef.current = currentY;
    };
    messageListEl.addEventListener('wheel', recordWheelIntent, { passive: true });
    messageListEl.addEventListener('keydown', recordKeyIntent);
    messageListEl.addEventListener('touchstart', recordTouchStart, { passive: true });
    messageListEl.addEventListener('touchmove', recordTouchIntent, { passive: true });
    return () => {
      messageListEl.removeEventListener('wheel', recordWheelIntent);
      messageListEl.removeEventListener('keydown', recordKeyIntent);
      messageListEl.removeEventListener('touchstart', recordTouchStart);
      messageListEl.removeEventListener('touchmove', recordTouchIntent);
    };
  }, [eventId]);

  const prefetchPreviews = useUrlPreviewPrefetch(mx, settings.showUrlPreview, processedEventsRef);

  const prefetchAroundViewport = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const { scrollOffset, viewportSize } = v;
    prefetchPreviews(v.findItemIndex(scrollOffset), v.findItemIndex(scrollOffset + viewportSize));
  }, [prefetchPreviews]);

  useEffect(prefetchAroundViewport, [prefetchAroundViewport, timelineSync.eventsLength]);

  const handleVListScroll = useCallback(
    (offset: number) => {
      notifyScroll();
      const v = vListRef.current;
      if (!v) return;

      prefetchAroundViewport();

      const distanceFromBottom = v.scrollSize - offset - v.viewportSize;
      syncAtBottom(offset);

      if (hasUserScrollIntentRef.current && distanceFromBottom >= 100) {
        initialScrollCancelledRef.current = true;
        if (initialScrollTimerRef.current !== undefined) {
          clearTimeout(initialScrollTimerRef.current);
          initialScrollTimerRef.current = undefined;
        }
        setIsReady(true);
      }

      if (eventId !== undefined || timelineSyncRef.current.focusItem) {
        const intent = focusedPaginationIntentRef.current;
        if (
          intent === 'backward' &&
          offset <= FOCUSED_PAGINATION_EDGE_PX &&
          canPaginateBackRef.current &&
          backwardStatusRef.current === 'idle'
        ) {
          focusedPaginationIntentRef.current = undefined;
          void timelineSyncRef.current.handleTimelinePagination(true);
        } else if (
          intent === 'forward' &&
          distanceFromBottom <= FOCUSED_PAGINATION_EDGE_PX &&
          canPaginateForwardRef.current &&
          forwardStatusRef.current === 'idle'
        ) {
          focusedPaginationIntentRef.current = undefined;
          void timelineSyncRef.current.handleTimelinePagination(false);
        }
        return;
      }

      if (scrollAnchorRef.current !== undefined) return;

      if (offset < 500 && canPaginateBackRef.current && backwardStatusRef.current === 'idle') {
        void timelineSyncRef.current.handleTimelinePagination(true);
      }
      if (
        distanceFromBottom < 500 &&
        canPaginateForwardRef.current &&
        forwardStatusRef.current === 'idle'
      ) {
        void timelineSyncRef.current.handleTimelinePagination(false);
      }
    },
    [eventId, notifyScroll, syncAtBottom, prefetchAroundViewport]
  );
  const handleVListScrollEnd = useCallback(() => {
    if (!timelineSyncRef.current.focusItem?.scrollTo) return;
    restoreScrollAnchor();
    timelineSyncRef.current.setFocusItem((prev) =>
      prev ? { ...prev, scrollTo: false } : undefined
    );
  }, [restoreScrollAnchor]);

  // A failed backfill keeps its pagination token, so the placeholder condition
  // would otherwise hold forever and never reach the error and its Retry.
  const showEmptyPaginationError = timelineSync.eventsLength === 0 && timelineSync.backwardError;

  const showLoadingPlaceholders =
    timelineSync.eventsLength === 0 &&
    !showEmptyPaginationError &&
    (!isReady || timelineSync.canPaginateBack || timelineSync.backwardStatus === 'loading');

  let backPaginationJSX: ReactNode | undefined;
  if (
    timelineSync.canPaginateBack ||
    timelineSync.backwardStatus !== 'idle' ||
    timelineSync.backwardError
  ) {
    if (timelineSync.backwardError) {
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
    }
  }

  let frontPaginationJSX: ReactNode | undefined;
  if (
    !timelineSync.liveTimelineLinked ||
    timelineSync.forwardStatus !== 'idle' ||
    timelineSync.forwardError
  ) {
    if (timelineSync.forwardError) {
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
    }
  }

  const showBackPaginationSpinner =
    timelineSync.backwardStatus === 'loading' && timelineSync.eventsLength > 0;
  const showFrontPaginationSpinner =
    timelineSync.forwardStatus === 'loading' && timelineSync.eventsLength > 0;
  const hasPowerLevelState = !!room
    .getLiveTimeline()
    ?.getState(EventTimeline.FORWARDS)
    ?.getStateEvents(EventType.RoomPowerLevels, '');
  const hideTimelineForRoomState = roomSyncLoading && hideMemberInReadOnly && !hasPowerLevelState;
  const timelineBottomFloatLift =
    !atBottomState && isReady ? { bottom: `calc(${config.space.S400} + ${toRem(52)})` } : undefined;
  const timelineTopFloatLift =
    unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady
      ? { top: `calc(${config.space.S400} + ${toRem(52)})` }
      : undefined;

  let vListItemCount = timelineSync.eventsLength;
  if (showLoadingPlaceholders) vListItemCount = 3;
  // One row so the error and its Retry have somewhere to render.
  else if (showEmptyPaginationError) vListItemCount = 1;
  const vListIndices = useMemo(() => {
    // Keep the cache-busting timeline identity explicit for exhaustive-deps.
    void timelineSync.timeline;
    return Array.from({ length: vListItemCount }, (_, i) => i);
  }, [vListItemCount, timelineSync.timeline]);

  const processedEvents = useProcessedTimeline({
    items: vListIndices,
    linkedTimelines: timelineSync.timeline.linkedTimelines,
    ignoredUsersSet,
    hiddenEvents,
    mxUserId: mx.getUserId(),
    readUptoEventId: readUptoEventIdRef.current,
    hideMembershipEvents,
    hideNickAvatarEvents,
    isReadOnly,
    hideMemberInReadOnly,
  });

  processedEventsRef.current = processedEvents;
  const previousProcessedEventIdsRef = useRef<string[] | undefined>(undefined);
  const processedEventIds = useMemo(
    () => processedEvents.map((event) => event.id),
    [processedEvents]
  );
  const previousProcessedEventIds = previousProcessedEventIdsRef.current;
  const shouldShift =
    previousProcessedEventIds !== undefined &&
    processedEventIds.length > previousProcessedEventIds.length &&
    previousProcessedEventIds.every(
      (id, index) =>
        id ===
        processedEventIds[index + processedEventIds.length - previousProcessedEventIds.length]
    );
  useLayoutEffect(() => {
    previousProcessedEventIdsRef.current = processedEventIds;
  }, [processedEventIds]);
  useLayoutEffect(() => {
    if (!pendingReadyRef.current) return;
    if (processedEvents.length === 0) return;
    pendingReadyRef.current = false;
    restoreScrollPosition();
    setIsReady(true);
  }, [processedEvents.length, restoreScrollPosition]);

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
            e.mEvent.getType() === (EventType.RoomMessage as string) &&
            !e.mEvent.isRedacted()
        );
      if (found?.mEvent.getId()) actions.handleEdit(found.mEvent.getId());
    };
  }, [onEditLastMessageRef, mx, actions]);

  useEffect(() => {
    viewportFillCountRef.current = 0;
  }, [room.roomId]);

  // Fill an initially short live timeline. Focused history is user-owned and must not
  // auto-continue after its anchor is released.
  useEffect(() => {
    if (scrollOwner !== 'live') return () => {};
    if (!canPaginateBackRef.current) return () => {};
    if (scrollAnchorRef.current !== undefined) return () => {};

    let rafId: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    const check = () => {
      if (scrollAnchorRef.current !== undefined) return;

      const v = vListRef.current;
      if (!v) return;

      if (v.viewportSize === 0) {
        attempts += 1;
        if (attempts <= MAX_ATTEMPTS) rafId = requestAnimationFrame(check);
        return;
      }

      if (!canPaginateBackRef.current) return;
      if (backwardStatusRef.current !== 'idle') return;

      if (viewportFillCountRef.current >= MAX_VIEWPORT_FILL_PAGINATIONS) return;

      if (v.scrollSize <= v.viewportSize + 300) {
        viewportFillCountRef.current += 1;
        void timelineSyncRef.current.handleTimelinePagination(true, true);
      }
    };

    rafId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(rafId);
  }, [room.roomId, scrollOwner, timelineSync.eventsLength, timelineSync.backwardStatus]);

  return (
    <Box grow="Yes" style={{ position: 'relative', minWidth: 0, minHeight: 0, width: '100%' }}>
      {(hideTimelineForRoomState || (roomSyncLoading && timelineSync.eventsLength === 0)) && (
        <Box
          justifyContent="Center"
          alignItems="Center"
          style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
        >
          <Spinner variant="Secondary" size="400" />
        </Box>
      )}
      {unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady && (
        <TimelineFloat position="Top" style={{ background: 'transparent' }}>
          <Chip
            variant="Primary"
            radii="Pill"
            outlined
            before={chipIcon(ChatTeardropDots)}
            onClick={() => jumpToEvent(unreadInfo.readUptoEventId)}
          >
            <Text size="L400">Jump to Unread</Text>
          </Chip>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={chipIcon(Checks)}
            onClick={() => markAsRead(mx, room.roomId, hideReads, true)}
          >
            <Text size="L400">Mark as Read</Text>
          </Chip>
        </TimelineFloat>
      )}

      <div
        ref={messageListRef}
        data-testid="timeline"
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          position: 'relative',
          opacity: hideTimelineForRoomState ? 0 : 1,
        }}
      >
        <TimelineScrollingProvider value={isTimelineScrolling}>
          <VList<ProcessedEvent>
            key={`${room.roomId}:${timelineSync.liveTimelineLinked ? 'live' : (timelineSync.focusItem?.eventId ?? scrollAnchorRef.current)}`}
            ref={vListRef}
            data={processedEvents}
            shift={shouldShift}
            id="timeline-scroller"
            className={css.messageList}
            style={{
              flex: 1,
              minHeight: 0,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              paddingTop: topSpacerHeight > 0 ? topSpacerHeight : config.space.S600,
              paddingBottom: config.space.S600,
            }}
            onScroll={handleVListScroll}
            onScrollEnd={handleVListScrollEnd}
          >
            {(eventData, index) => (
              <MemoizedTimelineItem
                key={
                  eventData
                    ? `${eventData.id}:${eventData.isRedacted ? 'redacted' : 'message'}`
                    : `placeholder-${index}`
                }
                eventData={eventData}
                index={index}
                showLoadingPlaceholders={showLoadingPlaceholders}
                canPaginateBack={timelineSync.canPaginateBack}
                backPaginationJSX={backPaginationJSX}
                room={room}
                messageLayout={messageLayout}
                messageSpacing={messageSpacing}
                settings={settings as unknown as Record<string, unknown>}
                permissions={rowPermissions}
                renderMatrixEvent={renderMatrixEvent}
                focusItem={timelineSync.focusItem}
                editId={editId}
                activeReplyId={activeReplyId}
                openThreadId={openThreadId}
              />
            )}
          </VList>
        </TimelineScrollingProvider>
      </div>
      {selectedMediaEventId && (
        <RoomMediaViewer
          items={roomMedia}
          selectedEventId={selectedMediaEventId}
          selectEvent={setSelectedMediaEventId}
          requestClose={() => setSelectedMediaEventId(undefined)}
        />
      )}

      {showBackPaginationSpinner && (
        <TimelineFloat position="Top" style={timelineTopFloatLift}>
          <Spinner variant="Secondary" size="400" style={{ backgroundColor: 'transparent' }} />
        </TimelineFloat>
      )}

      {showFrontPaginationSpinner && (
        <TimelineFloat position="Bottom" style={timelineBottomFloatLift}>
          <Spinner variant="Secondary" size="400" style={{ backgroundColor: 'transparent' }} />
        </TimelineFloat>
      )}

      {frontPaginationJSX && (
        <TimelineFloat position="Bottom" style={timelineBottomFloatLift}>
          {frontPaginationJSX}
        </TimelineFloat>
      )}

      {(!atBottomState || !timelineSync.liveTimelineLinked) && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={chipIcon(ArrowDown)}
            onClick={() => {
              scrollAnchorRef.current = undefined;
              if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
              timelineSync.focusLiveTimeline();
              setAtBottom(true);
              scrollToBottom();
            }}
            style={{
              WebkitUserSelect: 'none',
              msUserSelect: 'none',
              userSelect: 'none',
              MozUserSelect: 'none',
            }}
          >
            <Text size="L400">Jump to Latest</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}
