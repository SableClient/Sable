import type { ReactNode } from 'react';
import * as Sentry from '@sentry/react';
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
import type { Editor } from 'slate';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import type { Room, MatrixEvent, EventTimelineSet } from '$types/matrix-sdk';
import { Direction, EventTimeline, EventType, RoomEvent } from '$types/matrix-sdk';
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
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useSlidingSyncRoomLoading } from '$hooks/useSlidingSyncActiveRoom';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
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
  getFirstLinkedTimeline,
  getInitialTimeline,
  getEventIdAbsoluteIndex,
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
import { useTimelineRendererContext } from '$hooks/timeline/useTimelineRendererContext';
import { TimelineScrollingProvider, useScrollActivity } from '$hooks/useTimelineScrollActivity';
import * as css from './RoomTimeline.css';

const MAX_VIEWPORT_FILL_PAGINATIONS = 5;

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
  const index = 'index' in focusItem ? focusItem.index : undefined;
  // itemIndex -1 marks a merged relation row, which is never a focus target.
  return typeof index === 'number' && index >= 0 && index === eventData.itemIndex;
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
      prev.eventData.collapsed === next.eventData.collapsed &&
      prev.eventData.willRenderNewDivider === next.eventData.willRenderNewDivider &&
      prev.eventData.willRenderDayDivider === next.eventData.willRenderDayDivider &&
      prev.eventData.mEvent === next.eventData.mEvent &&
      prev.eventData.eventSender === next.eventData.eventSender &&
      prev.eventData.editId === next.eventData.editId &&
      prev.eventData.reactionsKey === next.eventData.reactionsKey &&
      prev.eventData.content === next.eventData.content
    );
  }
);
export type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  editor: Editor;
  onEditorReset?: () => void;
  onEditLastMessageRef?: React.MutableRefObject<(() => void) | undefined>;
  editId?: string;
  onEditId?: (editId?: string) => void;
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
  const alive = useAlive();
  const roomSyncLoading = useSlidingSyncRoomLoading(room.roomId);

  const internalEdit = useMessageEdit(editor, { onReset: onEditorReset, alive });
  const editId = propsOnEditId ? propsEditId : internalEdit.editId;
  const handleEdit = propsOnEditId ?? internalEdit.handleEdit;
  const { navigateRoom } = useRoomNavigate();
  const isInactivePanel = useIsInactivePanel();

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

  const readUptoEventIdRef = useRef<string | undefined>(undefined);
  if (unreadInfo) readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  const hideReadsRef = useRef(hideReads);
  hideReadsRef.current = hideReads;

  const prevViewportHeightRef = useRef(0);
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

  // Resizes move the bottom without emitting a scroll event.
  const syncAtBottom = useCallback(
    (offset?: number) => {
      const v = vListRef.current;
      if (!v) return;
      const scrollTop = offset ?? v.scrollOffset;
      let isNowAtBottom = v.scrollSize - scrollTop - v.viewportSize < 100;
      // Don't arm atBottom while a focus jump is pending: the swapped-in
      // context window transiently clamps to its bottom edge.
      if (isNowAtBottom && !atBottomRef.current && timelineSyncRef.current.focusItem) {
        isNowAtBottom = false;
      }
      if (isNowAtBottom !== atBottomRef.current) setAtBottom(isNowAtBottom);
    },
    [setAtBottom]
  );

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

  // VList owns the scroll container and renders it as the wrapper's only child.
  const scrollElRef = useRef<HTMLElement | null>(null);

  const scrollToBottom = useCallback(
    (behavior: 'instant' | 'smooth' = 'instant') => {
      const v = vListRef.current;
      const lastIndex = processedEventsRef.current.length - 1;
      if (!v || lastIndex < 0) return;

      // virtua aims at the last row's end from its cached item sizes, which
      // under-report while a just-grown row is still being measured, landing above
      // the real bottom. Overshoot by the shortfall; the browser clamps it.
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
    const scrollEl = messageListRef.current?.firstElementChild;
    scrollElRef.current = scrollEl instanceof HTMLElement ? scrollEl : null;
    if (!scrollElRef.current) {
      Sentry.captureMessage('Timeline: could not resolve the VList scroll container', {
        level: 'warning',
        tags: { feature: 'timeline' },
      });
    }
  }, []);

  // A jump target is by definition not the bottom. Clear the flag synchronously,
  // before the async load resolves: the growth-follow is a useLayoutEffect, so it
  // runs before any passive effect on the render that first paints the new rows.
  // setAtBottom writes the ref (disarms growth-follow, ResizeObserver repin,
  // post-pagination repin) and the state (disarms tryAutoMarkAsRead).
  const jumpToEvent = useCallback(
    (id: string) => {
      setAtBottom(false);
      void timelineSyncRef.current.loadEventTimeline(id);
    },
    [setAtBottom]
  );

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
    isEventVisible: useCallback(
      (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => {
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
      [hiddenEvents, hideMemberInReadOnly, isReadOnly, hideMembershipEvents, hideNickAvatarEvents]
    ),
  });

  timelineSyncRef.current = timelineSync;

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
      scrollToBottom();
      // Store in a ref rather than a local so subsequent eventsLength changes
      // (e.g. the onLifecycle timeline reset firing within 80 ms) do NOT
      // cancel this timer through the useLayoutEffect cleanup.
      initialScrollTimerRef.current = setTimeout(() => {
        initialScrollTimerRef.current = undefined;
        if (processedEventsRef.current.length > 0) {
          scrollToBottom();
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
  }, [
    timelineSync.eventsLength,
    timelineSync.liveTimelineLinked,
    eventId,
    room.roomId,
    scrollToBottom,
  ]);

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
        requestAnimationFrame(() => scrollToBottom());
      }
    }
  }, [scrollToBottom]);

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
        scrollToBottom();
      }
    }
  }, [timelineSync.backwardStatus, scrollToBottom]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timelineSync.focusItem) {
      if (timelineSync.focusItem.scrollTo && vListRef.current) {
        let processedIndex = getRawIndexToProcessedIndex(timelineSync.focusItem.index);
        let focusRawIndex = timelineSync.focusItem.index;
        if (processedIndex === undefined) {
          // Jump targets with no rendered row (thread replies, hidden
          // membership/name events): land on the nearest visible row.
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
  }, [timelineSync.focusItem, timelineSync, reducedMotion, getRawIndexToProcessedIndex]);

  useEffect(() => {
    if (timelineSync.focusItem) {
      setIsReady(true);
    }
  }, [timelineSync.focusItem]);

  useEffect(() => {
    if (!eventId) return;
    setIsReady(false);
    jumpToEvent(eventId);
  }, [eventId, room.roomId, jumpToEvent]);

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

    // Async content (e.g. link previews) grows the VList content element
    // without re-render, so observe it alongside the viewport wrapper.
    const contentEl = scrollElRef.current?.firstElementChild;
    let contentObserver: ResizeObserver | undefined;
    if (contentEl) {
      contentObserver = new ResizeObserver(() => {
        if (atBottomRef.current && liveTimelineLinkedRef.current) {
          if (processedEventsRef.current.length > 0) scrollToBottom();
        } else {
          syncAtBottom();
        }
      });
      contentObserver.observe(contentEl);
    }

    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]!.contentRect.height;
      const prev = prevViewportHeightRef.current;
      const atBottom = atBottomRef.current;
      const shrank = newHeight < prev;

      prevViewportHeightRef.current = newHeight;

      if (shrank && atBottom && processedEventsRef.current.length > 0) {
        // Geometry is still pre-scroll here; the repin's own scroll event resyncs.
        scrollToBottom();
        return;
      }
      syncAtBottom();
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      contentObserver?.disconnect();
    };
  }, [syncAtBottom, scrollToBottom]);

  // Decrypting rows and late-loading images grow without changing eventsLength,
  // so useTimelineSync's auto-scroll never re-fires for them.
  const lastScrollSizeRef = useRef(0);
  useLayoutEffect(() => {
    const v = vListRef.current;
    if (!v) return;

    const grew = v.scrollSize > lastScrollSizeRef.current;
    lastScrollSizeRef.current = v.scrollSize;

    if (!grew || !atBottomRef.current || !liveTimelineLinkedRef.current) return;

    scrollToBottom();
  });

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
        jumpToEvent(anchorId);
      }
    },
  });

  // renderMatrixEvent keeps a stable identity and reads these through a ref, so
  // the row memo has to compare them itself to notice a power-level change.
  const rowPermissions = { canRedact, canDeleteOwn, canSendReaction, canPinEvent };

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
    },
    utils: { htmlReactParserOptions, linkifyOpts, getMemberPowerTag, parseMemberEvent },
  });

  const tryAutoMarkAsRead = useCallback(() => {
    if (isInactivePanel) return; // Don't clear unread while room is behind the list
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
          if (atBottomState) tryAutoMarkAsRead();
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

  const handleVListScroll = useCallback(
    (offset: number) => {
      notifyScroll();
      const v = vListRef.current;
      if (!v) return;

      const distanceFromBottom = v.scrollSize - offset - v.viewportSize;
      syncAtBottom(offset);

      if (offset < 500 && canPaginateBackRef.current && backwardStatusRef.current === 'idle') {
        void timelineSyncRef.current.handleTimelinePagination(true);
      }
      if (
        distanceFromBottom < 500 &&
        !liveTimelineLinkedRef.current &&
        forwardStatusRef.current === 'idle'
      ) {
        void timelineSyncRef.current.handleTimelinePagination(false);
      }
    },
    [notifyScroll, syncAtBottom]
  );

  // A failed backfill keeps its pagination token, so the placeholder condition
  // would otherwise hold forever and never reach the error and its Retry.
  const showEmptyPaginationError =
    timelineSync.eventsLength === 0 && timelineSync.backwardStatus === 'error';

  const showLoadingPlaceholders =
    timelineSync.eventsLength === 0 &&
    !showEmptyPaginationError &&
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
    pendingEvents: timelineSync.pendingEvents,
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

  // Recovery: if the 80 ms initial-scroll timer fired while processedEvents was
  // empty (timeline was mid-reset), scroll to bottom and reveal the timeline once
  // events repopulate.  Fires on every processedEvents.length change but is
  // guarded by pendingReadyRef so it only acts once per initial-scroll attempt.
  useLayoutEffect(() => {
    if (!pendingReadyRef.current) return;
    if (processedEvents.length === 0) return;
    pendingReadyRef.current = false;
    scrollToBottom();
    setIsReady(true);
  }, [processedEvents.length, scrollToBottom]);

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
    lastScrollSizeRef.current = 0;
  }, [room.roomId]);

  // Re-enters on every length change, so an unfillable viewport pages to the start of the
  // room. Scrolling up is handled by handleVListScroll.
  useEffect(() => {
    if (!canPaginateBackRef.current) return () => {};

    let rafId: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

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

      if (viewportFillCountRef.current >= MAX_VIEWPORT_FILL_PAGINATIONS) return;

      if (v.scrollSize <= v.viewportSize + 300) {
        viewportFillCountRef.current += 1;
        void timelineSyncRef.current.handleTimelinePagination(true);
      }
    };

    rafId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(rafId);
  }, [room.roomId, timelineSync.eventsLength, timelineSync.backwardStatus]);

  return (
    <Box grow="Yes" style={{ position: 'relative' }}>
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
          opacity:
            !hideTimelineForRoomState &&
            (isReady || showLoadingPlaceholders || showEmptyPaginationError)
              ? 1
              : 0,
        }}
      >
        <TimelineScrollingProvider value={isTimelineScrolling}>
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
            {(eventData, index) => (
              <MemoizedTimelineItem
                key={eventData ? eventData.id : `placeholder-${index}`}
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

      {!atBottomState && isReady && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={chipIcon(ArrowDown)}
            onClick={() => {
              if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
              timelineSync.setTimeline(getInitialTimeline(room));
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
