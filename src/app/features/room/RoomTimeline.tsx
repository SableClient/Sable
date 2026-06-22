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
import { useLocation, useNavigate } from 'react-router-dom';
import type { Editor } from 'slate';
import { useAtomValue, useAtom, useSetAtom } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { PushProcessor, Direction } from '$types/matrix-sdk';
import classNames from 'classnames';
import type { VListHandle } from 'virtua';
import { VList } from 'virtua';
import type { ContainerColor } from 'folds';
import { as, Box, Chip, Line, Text, Badge, color, config, toRem, Spinner } from 'folds';
import * as Sentry from '@sentry/react';
import { ArrowDown, ChatTeardropDots, Checks, chipIcon } from '$components/icons/phosphor';
import { MessageBase, CompactPlaceholder, DefaultPlaceholder } from '$components/message';
import { RoomIntro } from '$components/room-intro';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { createLogger } from '$utils/debug';
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
import { unwrapRelationJumpTarget, canEditEvent } from '$utils/room';
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
import { useKeyboardHeight } from '$hooks/ios-keyboard-fix';
import { settingsAtom, MessageLayout } from '$state/settings';
import { useHiddenEventSettings, useSetting } from '$state/hooks/settings';
import { nicknamesAtom } from '$state/nicknames';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import { buildAbbrReplaceTextNode } from '$components/message/RenderBody';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import {
  roomIdToReplyDraftAtomFamily,
  roomIdToEditDraftAtomFamily,
  roomIdToEditNavRequestAtomFamily,
} from '$state/room/roomInputDrafts';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import {
  getRoomUnreadInfo,
  getUnreadInfoAfterJumpToLatest,
  getEventTimeline,
  getFirstLinkedTimeline,
  getEmptyTimeline,
  getEventIdAbsoluteIndex,
} from '$utils/timeline';
import { useTimelineSync, type TimelineJumpMode } from '$hooks/timeline/useTimelineSync';
import { useTimelineActions } from '$hooks/timeline/useTimelineActions';
import { stripRoomEventSegment } from '$pages/pathUtils';
import {
  useProcessedTimeline,
  getProcessedRowIndexForRawTimelineIndex,
  getProcessedRowIndexForRawTimelineIndexForward,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import { useTimelineEventRenderer } from '$hooks/timeline/useTimelineEventRenderer';
import { completeRoomTimelineRender } from '$utils/perfTelemetry';
import { mobileOrTabletLayout } from '$utils/user-agent';
import * as css from './RoomTimeline.css';

const log = createLogger('RoomTimeline');

function findLastOwnEditableProcessedEvent(
  events: ProcessedEvent[],
  myUserId: string | null | undefined
): ProcessedEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event) continue;
    if (
      event.mEvent.getSender() === myUserId &&
      event.mEvent.getEffectiveEvent()?.type === 'm.room.message' &&
      !event.mEvent.isRedacted()
    ) {
      return event;
    }
  }
  return undefined;
}

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

const SCROLL_SETTLE_MS = 250;

export type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  jumpMode?: TimelineJumpMode;
  hasDesktopRightDrawer?: boolean;
  hasTypingIndicator?: boolean;
  editor: Editor;
  onEditorReset?: () => void;
  onEditLastMessageRef?: React.MutableRefObject<(() => void) | undefined>;
};

export function RoomTimeline({
  room,
  eventId,
  jumpMode,
  hasDesktopRightDrawer = false,
  hasTypingIndicator = false,
  editor,
  onEditorReset,
  onEditLastMessageRef,
}: Readonly<RoomTimelineProps>) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const location = useLocation();
  const alive = useAlive();
  const screenSize = useScreenSizeContext();

  const { editId, handleEdit } = useMessageEdit(editor, {
    onReset: onEditorReset,
    alive,
  });
  const { navigateRoom } = useRoomNavigate();

  const [editInInput] = useSetting(settingsAtom, 'editInInput');
  const setEditDraft = useSetAtom(roomIdToEditDraftAtomFamily(room.roomId));
  const handleEditCallback = useCallback(
    (id?: string) => {
      if (editInInput) {
        setEditDraft(id ? { eventId: id } : undefined);
        return;
      }
      handleEdit(id);
    },
    [editInInput, handleEdit, setEditDraft]
  );

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
  const hiddenEvents = useHiddenEventSettings(settingsAtom);
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
  const [messageGroupingThreshold] = useSetting(settingsAtom, 'messageGroupingThreshold');

  const [showInteractiveMap] = useSetting(settingsAtom, 'showInteractiveMap');
  const [showEncInteractiveMap] = useSetting(settingsAtom, 'showEncInteractiveMap');
  const showMaps = room.hasEncryptionStateEvent() ? showEncInteractiveMap : showInteractiveMap;

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
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const roomUnread = roomToUnread.get(room.roomId);

  const readUptoEventIdRef = useRef<string | undefined>(undefined);
  if (unreadInfo) readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  const hideReadsRef = useRef(hideReads);
  hideReadsRef.current = hideReads;

  const prevViewportHeightRef = useRef(0);
  const prevScrollSizeRef = useRef(0);
  // Tracks the VList-reported viewport size (as opposed to prevViewportHeightRef
  // which tracks the DOM element height via ResizeObserver). Used in
  // handleVListScroll to detect viewport size changes (keyboard opens OR closes)
  // without a ResizeObserver race: when VList fires onScroll with a different
  // viewportSize, we chase the bottom immediately instead of letting
  // setAtBottom(false) fire.
  const prevVListViewportRef = useRef(0);
  // Track when viewport last changed (keyboard open/close) to suppress
  // setAtBottom(false) during the settle window.
  const lastViewportChangeTimeRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);

  const mediaAuthentication = useMediaAuthentication();
  const spoilerClickHandler = useSpoilerClickHandler();
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const { isKeyboardVisible, keyboardHeight } = useKeyboardHeight();
  const prevKeyboardVisibleRef = useRef(false);
  const prevKeyboardHeightRef = useRef(0);
  const lastKeyboardCloseTimeRef = useRef(0);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const openUserRoomProfile = useOpenUserRoomProfile();
  const optionalSpace = useSpaceOptionally();
  const roomParents = useAtomValue(roomToParentsAtom);
  const isMobileScreen = screenSize === ScreenSize.Mobile || mobileOrTabletLayout();
  const timelineBottomSpacing = hasTypingIndicator ? config.space.S700 : config.space.S600;
  const timelineRightSpacing = isMobileScreen
    ? config.space.S200
    : hasDesktopRightDrawer
      ? config.space.S400
      : config.space.S0;
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

  // Preserved scroll offset from just before the thread drawer was opened, so
  // we can restore position when the drawer closes and the main column reflows
  // to a wider width (remeasured items would otherwise leave the VList at an
  // unexpected position).
  const scrollOffsetBeforeThreadRef = useRef<number | undefined>(undefined);
  const wasAtBottomBeforeThreadRef = useRef(false);

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
  // Short-lived guard set for ~350 ms after a jump scrollToIndex so that
  // intermediate scroll events from the animation don't flip atBottom prematurely.
  const jumpScrollBlockRef = useRef(false);
  const jumpReanchorScrollUntilRef = useRef(0);
  const jumpScrollBlockTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Stored in a ref so eventsLength fluctuations (e.g. onLifecycle timeline reset
  // firing within the window) cannot cancel it via useLayoutEffect cleanup.
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set to true when the 80 ms timer fires but processedEvents is still empty
  // (e.g. the onLifecycle reset cleared the timeline before events refilled it).
  // A recovery useLayoutEffect watches for processedEvents becoming non-empty
  // and performs the final scroll + setIsReady when this flag is set.
  const pendingReadyRef = useRef(false);
  const currentRoomIdRef = useRef(room.roomId);
  const lastRenderedTailRef = useRef<string | undefined>(undefined);

  const [isReady, setIsReady] = useState(false);
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;
  const jumpRetryIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const jumpRecenterTimeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const jumpRouteCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const jumpHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const jumpAnchorKeyRef = useRef<string | undefined>(undefined);
  const jumpLayoutReanchorRafRef = useRef<number | undefined>(undefined);
  const lastJumpLayoutReanchorAtRef = useRef(0);
  const jumpLockEventIdRef = useRef<string | undefined>(undefined);
  const jumpLockActiveRef = useRef(false);
  const userScrollIntentAtRef = useRef(0);
  const jumpLockReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Track whether the initial eventId load is in progress. Used to prevent the
  // recovery scroll from firing prematurely when the live timeline loads before
  // the target event context finishes loading (which causes the blank → bottom jump).
  const eventIdLoadInProgressRef = useRef(false);
  // Track which eventId is currently being loaded to prevent duplicate loads when
  // the user clicks the jump button repeatedly before the first load completes.
  const loadingEventIdRef = useRef<string | null>(null);
  // AbortController to cancel in-flight jump operations when a new jump starts.
  // This prevents multiple concurrent jumps from interfering with each other.
  const jumpAbortControllerRef = useRef<AbortController | null>(null);
  // Track whether the permalink jump succeeded (focusItem was set). Once set,
  // recovery scroll should never fire for this eventId, even after focusItem
  // is cleared (highlight ends). Reset only when eventId or room changes.
  const jumpSucceededRef = useRef(false);

  const lastProgrammaticBottomPinAtRef = useRef(0);

  if (currentRoomIdRef.current !== room.roomId) {
    hasInitialScrolledRef.current = false;
    mountScrollWindowRef.current = Date.now() + 3000;
    currentRoomIdRef.current = room.roomId;
    pendingReadyRef.current = false;
    jumpSucceededRef.current = false;
    if (initialScrollTimerRef.current !== undefined) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = undefined;
    }
    if (jumpLayoutReanchorRafRef.current !== undefined) {
      cancelAnimationFrame(jumpLayoutReanchorRafRef.current);
      jumpLayoutReanchorRafRef.current = undefined;
    }
    setIsReady(false);
  }

  const processedEventsRef = useRef<ProcessedEvent[]>([]);
  const timelineSyncRef = useRef<typeof timelineSync>(null as unknown as typeof timelineSync);
  const timelineRenderMetricRoomRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    timelineRenderMetricRoomRef.current = undefined;
  }, [room.roomId, eventId]);

  const scrollToBottom = useCallback(() => {
    if (!vListRef.current) return;
    const lastIndex = processedEventsRef.current.length - 1;
    if (lastIndex < 0) return;
    vListRef.current.scrollTo(vListRef.current.scrollSize);
  }, []);

  const handleMarkAsRead = useCallback(() => {
    setUnreadInfo((prev) =>
      prev
        ? {
            ...prev,
            inLiveTimeline: true,
            scrollTo: false,
          }
        : undefined
    );
    void markAsRead(mx, room.roomId, hideReads).finally(() => {
      requestAnimationFrame(() => {
        setUnreadInfo(getRoomUnreadInfo(room));
      });
    });
  }, [hideReads, mx, room]);

  // Start a short scroll-settle block after a programmatic jump scrollToIndex.
  // After 350 ms the block lifts and atBottom is recomputed from the actual
  // VList position so "Jump to Latest" appears correctly.
  const startJumpScrollBlock = useCallback(() => {
    jumpScrollBlockRef.current = true;
    if (jumpScrollBlockTimerRef.current !== undefined)
      clearTimeout(jumpScrollBlockTimerRef.current);
    jumpScrollBlockTimerRef.current = setTimeout(() => {
      jumpScrollBlockRef.current = false;
      jumpScrollBlockTimerRef.current = undefined;
      const v = vListRef.current;
      if (v) {
        const dist = v.scrollSize - v.scrollOffset - v.viewportSize;
        setAtBottom(dist < 100);
      }
    }, 350);
  }, [setAtBottom]);

  const reanchorJumpTarget = useCallback(
    (
      reason: 'delayed_settle' | 'content_growth' | 'timeline_remeasure' | 'loaded_history_jump',
      options?: {
        eventId?: string;
        align?: 'center' | 'end';
        scrollDelta?: number;
        delayMs?: number;
      }
    ): boolean => {
      const targetEventId = options?.eventId ?? jumpLockEventIdRef.current;
      if (!targetEventId || !vListRef.current) return false;

      const targetIndex = processedEventsRef.current.findIndex(
        (event) => event.mEvent.getId() === targetEventId
      );
      if (targetIndex < 0) return false;

      setAtBottom(false);
      jumpReanchorScrollUntilRef.current = Date.now() + 150;
      startJumpScrollBlock();
      vListRef.current.scrollToIndex(targetIndex, { align: options?.align ?? 'center' });
      log.log(
        `[PermalinkJump] Re-anchored target after ${reason}: eventId=${targetEventId}, processedIndex=${targetIndex}, scrollDelta=${options?.scrollDelta ?? 0}, delay=${options?.delayMs ?? 0}`
      );
      Sentry.addBreadcrumb({
        category: 'timeline.permalink',
        message: 'Re-anchored jump target',
        level: 'info',
        data: {
          reason,
          eventId: targetEventId,
          processedIndex: targetIndex,
          scrollDelta: options?.scrollDelta,
          delayMs: options?.delayMs,
          roomId: room.roomId,
        },
      });
      return true;
    },
    [room.roomId, setAtBottom, startJumpScrollBlock]
  );

  const releaseJumpLock = useCallback(
    (reason: 'missing_target' | 'user_scroll' | 'route_change' | 'jump_to_latest') => {
      if (!jumpLockActiveRef.current && !jumpLockEventIdRef.current) return;
      jumpLockActiveRef.current = false;
      jumpLockEventIdRef.current = undefined;
      if (jumpLockReleaseTimerRef.current !== undefined) {
        clearTimeout(jumpLockReleaseTimerRef.current);
        jumpLockReleaseTimerRef.current = undefined;
      }
      Sentry.addBreadcrumb({
        category: 'timeline.permalink',
        message: 'Released jump lock',
        level: 'info',
        data: { reason, roomId: room.roomId },
      });
    },
    [room.roomId]
  );

  const activateJumpLock = useCallback(
    (targetEventId?: string) => {
      if (!targetEventId) return;
      jumpLockEventIdRef.current = targetEventId;
      jumpLockActiveRef.current = true;
      if (jumpLockReleaseTimerRef.current !== undefined) {
        clearTimeout(jumpLockReleaseTimerRef.current);
        jumpLockReleaseTimerRef.current = undefined;
      }
      setAtBottom(false);
      Sentry.addBreadcrumb({
        category: 'timeline.permalink',
        message: 'Activated jump lock',
        level: 'info',
        data: { targetEventId, roomId: room.roomId },
      });
    },
    [room.roomId, setAtBottom]
  );

  const timelineSync = useTimelineSync({
    room,
    mx,
    eventId,
    jumpMode,
    isAtBottom: atBottomState,
    isAtBottomRef: atBottomRef,
    scrollToBottom,
    unreadInfo,
    setUnreadInfo,
    hideReadsRef,
    readUptoEventIdRef,
  });

  timelineSyncRef.current = timelineSync;

  useEffect(() => {
    const nextUnreadInfo = getRoomUnreadInfo(room);
    setUnreadInfo((prev) => {
      if (!nextUnreadInfo) return undefined;

      const next = {
        ...nextUnreadInfo,
        scrollTo: prev?.scrollTo ?? nextUnreadInfo.scrollTo,
      };

      if (
        prev?.readUptoEventId === next.readUptoEventId &&
        prev?.inLiveTimeline === next.inLiveTimeline &&
        prev?.scrollTo === next.scrollTo
      ) {
        return prev;
      }

      return next;
    });
  }, [room, roomUnread?.highlight, roomUnread?.total]);

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

  // Caps consecutive auto-pagination calls so a sparse timeline that never fills
  // the viewport cannot loop indefinitely. Reset on every timeline clear/room jump.
  const autopagAttemptsRef = useRef(0);

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
      if (jumpScrollBlockTimerRef.current !== undefined)
        clearTimeout(jumpScrollBlockTimerRef.current);
      if (jumpRetryIntervalRef.current !== undefined) clearInterval(jumpRetryIntervalRef.current);
      jumpRecenterTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
      if (jumpHighlightTimeoutRef.current !== undefined)
        clearTimeout(jumpHighlightTimeoutRef.current);
      if (jumpLockReleaseTimerRef.current !== undefined)
        clearTimeout(jumpLockReleaseTimerRef.current);
      if (jumpRouteCleanupTimerRef.current !== undefined)
        clearTimeout(jumpRouteCleanupTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (jumpRouteCleanupTimerRef.current !== undefined) {
      clearTimeout(jumpRouteCleanupTimerRef.current);
      jumpRouteCleanupTimerRef.current = undefined;
    }
    releaseJumpLock('route_change');
  }, [eventId, location.pathname, location.search, room.roomId, releaseJumpLock]);

  // If the timeline was blanked while content was already visible — e.g. a
  // TimelineReset fired by mx.retryImmediately() when the app comes back from
  // background — hide the timeline (opacity 0) and re-arm the initial-scroll so
  // it runs again once events refill the live timeline.
  useLayoutEffect(() => {
    if (!isReady) return;
    if (timelineSync.eventsLength > 0) return;
    setIsReady(false);
    hasInitialScrolledRef.current = false;
    autopagAttemptsRef.current = 0;
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
          scrollToBottom();
        });
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
      if (wasAtBottomBeforePaginationRef.current && !jumpLockActiveRef.current) {
        vListRef.current?.scrollToIndex(processedEventsRef.current.length - 1, {
          align: 'end',
        });
      }
    }
  }, [timelineSync.backwardStatus]);

  useEffect(() => {
    if (timelineSync.focusItem) {
      // Mark that the jump succeeded (focusItem was set). This prevents recovery
      // scroll from firing even after focusItem is cleared (highlight ends).
      jumpSucceededRef.current = true;

      const {
        index,
        eventId: focusEventId,
        scrollTo,
        align,
        jumpMode: focusJumpMode,
      } = timelineSync.focusItem;
      log.log(
        `[PermalinkJump] focusItem set: eventId=${focusEventId}, index=${index}, scrollTo=${scrollTo}, align=${align ?? 'center'}, jumpMode=${focusJumpMode ?? jumpMode ?? 'history_context'}`
      );
      Sentry.addBreadcrumb({
        category: 'timeline.permalink',
        message: 'focusItem set',
        level: 'info',
        data: {
          eventId: focusEventId,
          index,
          scrollTo,
          align: align ?? 'center',
          jumpMode: focusJumpMode ?? jumpMode ?? 'history_context',
          roomId: room.roomId,
        },
      });

      const anchorKey = `${focusEventId ?? 'no-event'}:${index}`;
      const isNewAnchor = jumpAnchorKeyRef.current !== anchorKey;
      if (isNewAnchor) {
        jumpAnchorKeyRef.current = anchorKey;
        if (jumpRetryIntervalRef.current !== undefined) {
          clearInterval(jumpRetryIntervalRef.current);
          jumpRetryIntervalRef.current = undefined;
        }
        jumpRecenterTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
        jumpRecenterTimeoutIdsRef.current = [];
        if (jumpHighlightTimeoutRef.current !== undefined) {
          clearTimeout(jumpHighlightTimeoutRef.current);
          jumpHighlightTimeoutRef.current = undefined;
        }
        if (jumpRouteCleanupTimerRef.current !== undefined) {
          clearTimeout(jumpRouteCleanupTimerRef.current);
          jumpRouteCleanupTimerRef.current = undefined;
        }
      }

      let scrollSucceeded = false;
      const resolveProcessedIndex = () => {
        const currentFocusItem = timelineSyncRef.current.focusItem;
        if (!currentFocusItem) return undefined;
        if (currentFocusItem.tail === 'live') {
          const lastRowIndex = processedEventsRef.current.length - 1;
          if (lastRowIndex < 0) return undefined;
          return {
            processedIndex: lastRowIndex,
            lockEventId: processedEventsRef.current[lastRowIndex]?.mEvent.getId(),
          };
        }

        let nextProcessedIndex = getRawIndexToProcessedIndex(currentFocusItem.index);
        let resolvedEventId =
          nextProcessedIndex !== undefined
            ? processedEventsRef.current[nextProcessedIndex]?.mEvent.getId()
            : undefined;
        if (nextProcessedIndex === undefined && currentFocusItem.eventId) {
          const found = processedEventsRef.current.findIndex(
            (e) => e.mEvent.getId() === currentFocusItem.eventId
          );
          if (found >= 0) {
            nextProcessedIndex = found;
            resolvedEventId = processedEventsRef.current[found]?.mEvent.getId();
          }
        }

        if (nextProcessedIndex !== undefined) {
          return {
            processedIndex: nextProcessedIndex,
            lockEventId: resolvedEventId,
          };
        }

        const nearest =
          (currentFocusItem.align === 'end'
            ? getProcessedRowIndexForRawTimelineIndex(
                processedEventsRef.current,
                currentFocusItem.index
              )
            : getProcessedRowIndexForRawTimelineIndexForward(
                processedEventsRef.current,
                currentFocusItem.index
              )) ??
          getProcessedRowIndexForRawTimelineIndex(
            processedEventsRef.current,
            currentFocusItem.index
          );

        if (!nearest) return undefined;

        return {
          processedIndex: nearest.rowIndex,
          lockEventId: processedEventsRef.current[nearest.rowIndex]?.mEvent.getId(),
        };
      };

      const attemptScroll = () => {
        if (!timelineSync.focusItem?.scrollTo || !vListRef.current || scrollSucceeded) return false;

        const resolvedTarget = resolveProcessedIndex();

        if (!resolvedTarget) {
          if (timelineSync.focusItem.eventId) {
            log.log(
              `[PermalinkJump] Event not found in processedEvents yet: eventId=${timelineSync.focusItem.eventId}, processedEvents.length=${processedEventsRef.current.length}`
            );
          }
          return false;
        }

        log.log(
          `[PermalinkJump] Scroll succeeded: processedIndex=${resolvedTarget.processedIndex}, eventId=${timelineSync.focusItem.eventId}`
        );
        Sentry.addBreadcrumb({
          category: 'timeline.permalink',
          message: 'Scroll succeeded',
          level: 'info',
          data: {
            processedIndex: resolvedTarget.processedIndex,
            eventId: timelineSync.focusItem.eventId,
            roomId: room.roomId,
          },
        });

        // An event-targeted jump should no longer be treated as bottom-pinned.
        // If we leave atBottom=true from the room's previous state, the scroll
        // handler can immediately "chase" the live bottom after this jump.
        setAtBottom(false);
        startJumpScrollBlock();
        if (timelineSync.focusItem.tail !== 'live') {
          activateJumpLock(resolvedTarget.lockEventId ?? focusEventId);
        }

        // Reveal timeline and scroll in the same frame to avoid flash
        setIsReady(true);
        vListRef.current.scrollToIndex(resolvedTarget.processedIndex, {
          align: timelineSync.focusItem.align ?? 'center',
        });
        timelineSync.setFocusItem((prev) => (prev ? { ...prev, scrollTo: false } : undefined));

        scrollSucceeded = true;

        // Stop retry loop now that scroll succeeded
        if (jumpRetryIntervalRef.current !== undefined) {
          clearInterval(jumpRetryIntervalRef.current);
          jumpRetryIntervalRef.current = undefined;
        }

        // Media loads and preview expansion can keep shifting layout after the
        // first successful jump. Re-center a few bounded times and resolve the
        // target row fresh each time so the event stays anchored while history
        // and measured heights settle.
        if (jumpRecenterTimeoutIdsRef.current.length === 0) {
          [150, 600, 1500, 3000].forEach((delay) => {
            const recenterTimeoutId = setTimeout(() => {
              const delayedProcessedIndex = resolveProcessedIndex();
              if (vListRef.current && delayedProcessedIndex !== undefined) {
                reanchorJumpTarget('delayed_settle', {
                  eventId: timelineSyncRef.current.focusItem?.eventId,
                  align: timelineSyncRef.current.focusItem?.align ?? 'center',
                  delayMs: delay,
                });
              }
            }, delay);
            jumpRecenterTimeoutIdsRef.current.push(recenterTimeoutId);
          });
        }

        if (
          focusEventId &&
          eventId === focusEventId &&
          (focusJumpMode ?? jumpMode) === 'notification_live'
        ) {
          jumpRouteCleanupTimerRef.current = setTimeout(() => {
            const currentFocusItem = timelineSyncRef.current.focusItem;
            if (currentFocusItem?.eventId !== focusEventId || !liveTimelineLinkedRef.current) {
              return;
            }

            const nextSearchParams = new URLSearchParams(location.search);
            nextSearchParams.delete('jumpMode');
            nextSearchParams.delete('joinCall');
            const nextSearch = nextSearchParams.toString();
            const nextPathname = stripRoomEventSegment(location.pathname, focusEventId);
            navigate(nextSearch ? `${nextPathname}?${nextSearch}` : nextPathname, {
              replace: true,
            });
            jumpRouteCleanupTimerRef.current = undefined;
          }, 3200);
        }

        return true;
      };

      // Try immediate scroll
      if (!attemptScroll()) {
        // If immediate scroll failed (event not in processedEvents yet), retry periodically.
        // This handles the case where pagination just loaded the event but React hasn't
        // finished processing/rendering it yet.
        if (jumpRetryIntervalRef.current !== undefined) {
          clearInterval(jumpRetryIntervalRef.current);
        }
        jumpRetryIntervalRef.current = setInterval(() => {
          if (attemptScroll()) {
            if (jumpRetryIntervalRef.current !== undefined) {
              clearInterval(jumpRetryIntervalRef.current);
              jumpRetryIntervalRef.current = undefined;
            }
          }
        }, 200);
      }
    } else {
      jumpAnchorKeyRef.current = undefined;
      if (jumpRetryIntervalRef.current !== undefined) {
        clearInterval(jumpRetryIntervalRef.current);
        jumpRetryIntervalRef.current = undefined;
      }
      jumpRecenterTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
      jumpRecenterTimeoutIdsRef.current = [];
      if (jumpLayoutReanchorRafRef.current !== undefined) {
        cancelAnimationFrame(jumpLayoutReanchorRafRef.current);
        jumpLayoutReanchorRafRef.current = undefined;
      }
      if (jumpHighlightTimeoutRef.current !== undefined) {
        clearTimeout(jumpHighlightTimeoutRef.current);
        jumpHighlightTimeoutRef.current = undefined;
      }
      if (jumpRouteCleanupTimerRef.current !== undefined) {
        clearTimeout(jumpRouteCleanupTimerRef.current);
        jumpRouteCleanupTimerRef.current = undefined;
      }
    }
  }, [
    timelineSync.focusItem,
    timelineSync,
    reducedMotion,
    getRawIndexToProcessedIndex,
    setAtBottom,
    startJumpScrollBlock,
    activateJumpLock,
    reanchorJumpTarget,
    room.roomId,
    jumpMode,
    eventId,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    const focusItem = timelineSync.focusItem;
    if (!focusItem) {
      if (jumpHighlightTimeoutRef.current !== undefined) {
        clearTimeout(jumpHighlightTimeoutRef.current);
        jumpHighlightTimeoutRef.current = undefined;
      }
      return;
    }

    const paginationLoading =
      timelineSync.backwardStatus === 'loading' || timelineSync.forwardStatus === 'loading';

    if (jumpHighlightTimeoutRef.current !== undefined) {
      clearTimeout(jumpHighlightTimeoutRef.current);
      jumpHighlightTimeoutRef.current = undefined;
    }

    // Keep the highlight alive while surrounding context is still loading. Once
    // pagination settles, leave the highlight around a bit longer so the target
    // remains easy to re-find after previews/images finish reflowing.
    if (paginationLoading) return;

    const highlightDuration = focusItem.highlight ? 8000 : 4000;
    jumpHighlightTimeoutRef.current = setTimeout(() => {
      timelineSync.setFocusItem(undefined);
      jumpHighlightTimeoutRef.current = undefined;
    }, highlightDuration);
  }, [
    timelineSync.focusItem,
    timelineSync.backwardStatus,
    timelineSync.forwardStatus,
    timelineSync,
  ]);

  useEffect(() => {
    if (timelineSync.focusItem) {
      setIsReady(true);
    }
  }, [timelineSync.focusItem]);

  useEffect(() => {
    if (!eventId) return;
    log.log(`[PermalinkJump] Starting load: eventId=${eventId}, roomId=${room.roomId}`);
    Sentry.addBreadcrumb({
      category: 'timeline.permalink',
      message: 'Starting permalink load',
      level: 'info',
      data: { eventId, jumpMode: jumpMode ?? 'history_context', roomId: room.roomId },
    });

    setIsReady(false);
    // Re-arm the initial-scroll guard so that if the jump fails and falls back
    // to the live timeline, the useLayoutEffect can fire via the normal path.
    hasInitialScrolledRef.current = false;
    // Reset auto-pagination cap so the new timeline can fill the viewport.
    autopagAttemptsRef.current = 0;
    // Reset jump success tracking for this new eventId.
    jumpSucceededRef.current = false;
    // Reset "was at bottom" flag so pagination after the jump doesn't scroll to bottom.
    wasAtBottomBeforePaginationRef.current = false;
    // Cancel any pending error-recovery scroll timer from a previous eventId load
    // so it cannot reveal the timeline mid-flight of a new load.
    if (initialScrollTimerRef.current !== undefined) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = undefined;
    }
    // Clear the stale live-timeline content immediately so loading placeholders
    // are shown while the event-context API call is in flight, rather than
    // having the entire message area go invisible (opacity:0) with no feedback.
    timelineSyncRef.current.setTimeline(getEmptyTimeline());
    // Mark the eventId load as in-progress to prevent premature recovery scroll
    eventIdLoadInProgressRef.current = true;
    loadingEventIdRef.current = eventId;
    void timelineSyncRef.current
      .loadEventTimeline(eventId, undefined, { jumpMode })
      .then(() => {
        log.log(
          `[PermalinkJump] loadEventTimeline succeeded: eventId=${eventId}, eventsLength=${timelineSyncRef.current.eventsLength}`
        );
        Sentry.addBreadcrumb({
          category: 'timeline.permalink',
          message: 'loadEventTimeline succeeded',
          level: 'info',
          data: {
            eventId,
            eventsLength: timelineSyncRef.current.eventsLength,
            jumpMode: jumpMode ?? 'history_context',
            roomId: room.roomId,
          },
        });
      })
      .catch((err) => {
        log.warn(`[PermalinkJump] loadEventTimeline failed: eventId=${eventId}`, err);
        Sentry.addBreadcrumb({
          category: 'timeline.permalink',
          message: 'loadEventTimeline failed',
          level: 'error',
          data: {
            eventId,
            error: String(err),
            jumpMode: jumpMode ?? 'history_context',
            roomId: room.roomId,
          },
        });
      })
      .finally(() => {
        // Clear the flag whether the load succeeded or failed. If it succeeded,
        // focusItem will be set and the focus scroll will handle it. If it failed,
        // the recovery scroll can now safely fire.
        eventIdLoadInProgressRef.current = false;
        loadingEventIdRef.current = null;
      });
  }, [eventId, jumpMode, room.roomId]);

  // Recovery: loadEventTimeline's onError callback restores the live timeline but
  // scrollToBottom fires before the VList has rendered the new events (the list is
  // still empty at that point), so it returns early and no scroll happens.
  // Detect the "eventId load failed, fell back to live" state and reveal the
  // timeline scrolled to the bottom so the room is usable rather than stuck at
  // opacity-0 or stranded at the top of history.
  useEffect(() => {
    if (!eventId) return;
    if (isReady) return;
    if (timelineSync.eventsLength === 0) return;
    // Do NOT fire recovery scroll if the jump already succeeded. Once focusItem
    // was set (even if later cleared after highlight), the jump worked correctly.
    if (jumpSucceededRef.current) return;
    // Do NOT fire recovery scroll while the eventId load is still in progress.
    // The live timeline may receive events from sliding sync before the target
    // event context finishes loading, which would cause a premature scroll to bottom.
    if (eventIdLoadInProgressRef.current) return;
    // If focusItem is set or scrollTo is still pending, the focus scroll will handle it.
    // Wait for it to complete before falling back to recovery scroll.
    if (timelineSync.focusItem?.scrollTo) return;
    if (!timelineSync.liveTimelineLinked) return;
    // Guard: don't start a second timer if one is already in flight.
    if (initialScrollTimerRef.current !== undefined) return;

    // Delay recovery scroll to give the focusItem scroll enough time to succeed.
    // If the permalink jump is working, focusItem will be active for 2-4s (highlight duration).
    // Only fall back to recovery if focusItem doesn't exist or was never set.
    initialScrollTimerRef.current = setTimeout(() => {
      log.log(
        `[PermalinkJump] Recovery scroll 1s timer fired: focusItem=${!!timelineSyncRef.current.focusItem}, isReady=${isReadyRef.current}, eventsLength=${timelineSyncRef.current.eventsLength}`
      );
      initialScrollTimerRef.current = undefined;

      // Don't fire recovery if focusItem exists at all - that means the permalink scroll
      // is active (even if scrollTo is false, which happens after successful scroll).
      // Only recover when focusItem is completely undefined (scroll never started or failed).
      if (timelineSyncRef.current.focusItem) return;
      if (isReadyRef.current) return;
      if (timelineSyncRef.current.eventsLength === 0) return;
      if (!timelineSyncRef.current.liveTimelineLinked) return;

      // Virtua has no measured item heights yet when data first populates
      // (transition from 0 → N items).  A single scrollToIndex call lands at the
      // estimated position (often 0) because every item is still at its default
      // height.  Scroll once immediately to warm up virtua's layout pass, then
      // schedule a second scroll after 80ms when heights are measured.
      scrollToBottom();

      initialScrollTimerRef.current = setTimeout(() => {
        initialScrollTimerRef.current = undefined;
        // Final bail-out checks before revealing
        if (isReadyRef.current) return;
        if (timelineSyncRef.current.focusItem) return;
        if (timelineSyncRef.current.eventsLength === 0) return;
        if (!timelineSyncRef.current.liveTimelineLinked) return;

        scrollToBottom();
        setIsReady(true);
      }, 80);
    }, 1000);
  }, [
    eventId,
    isReady,
    scrollToBottom,
    timelineSync.eventsLength,
    timelineSync.focusItem,
    timelineSync.liveTimelineLinked,
    room.roomId,
  ]);

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
      const changed = newHeight !== prev;
      const heightDelta = newHeight - prev;

      // Detect if this viewport expansion is from keyboard closing.
      // If the viewport grew by roughly the keyboard height that just disappeared,
      // record the time so handleVListScroll can use an extended settle window
      // (500ms instead of 250ms) to fully suppress the jump button during the
      // keyboard close animation.
      const keyboardJustClosed =
        prevKeyboardVisibleRef.current &&
        !isKeyboardVisible &&
        heightDelta > 0 &&
        prevKeyboardHeightRef.current > 0 &&
        Math.abs(heightDelta - prevKeyboardHeightRef.current) < 50;

      if (keyboardJustClosed) {
        lastKeyboardCloseTimeRef.current = Date.now();
      }

      // Handle both viewport shrinking (keyboard open) and expanding (keyboard close)
      // to prevent the "Jump to Present" button from flashing during these transitions.
      if (changed && atBottom) {
        // Record the programmatic pin so handleVListScroll sees withinSettleWindow=true
        // and doesn't flip atBottom to false while VList commits the new scroll position.
        lastProgrammaticBottomPinAtRef.current = Date.now();
        vListRef.current?.scrollTo(vListRef.current.scrollSize);
      }
      prevViewportHeightRef.current = newHeight;
      prevKeyboardVisibleRef.current = isKeyboardVisible;
      prevKeyboardHeightRef.current = keyboardHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isKeyboardVisible, keyboardHeight, setAtBottom]);

  // When the thread drawer opens/closes on desktop, the main timeline column
  // changes width and Virtua remeasures all item heights.  Save the scroll
  // offset just before the open so we can restore it after the close once
  // layout has settled (two RAFs to let Virtua finish its resize cycle).
  useEffect(() => {
    if (openThreadId) {
      scrollOffsetBeforeThreadRef.current = vListRef.current?.scrollOffset;
      wasAtBottomBeforeThreadRef.current = atBottomRef.current;
    } else if (scrollOffsetBeforeThreadRef.current !== undefined) {
      const savedOffset = scrollOffsetBeforeThreadRef.current;
      scrollOffsetBeforeThreadRef.current = undefined;
      const shouldSnapToBottom = wasAtBottomBeforeThreadRef.current;
      wasAtBottomBeforeThreadRef.current = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (shouldSnapToBottom) {
            scrollToBottom();
            return;
          }
          vListRef.current?.scrollTo(savedOffset);
        });
      });
    }
  }, [openThreadId, scrollToBottom]);

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
          // A direct jump into already-loaded history should no longer be treated
          // as bottom-pinned, otherwise the bottom-follow recovery paths can pull
          // the timeline straight back to latest while this jump is settling.
          setAtBottom(false);
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
          startJumpScrollBlock();
          activateJumpLock(anchorId);
        }
        timelineSync.setFocusItem({
          index: focusRawIndex,
          eventId: anchorId,
          scrollTo: false,
          highlight: true,
          align: 'center',
          jumpMode: 'history_context',
        });
      } else {
        // Cancel any in-flight jump operation to prevent concurrent jumps
        if (jumpAbortControllerRef.current) {
          log.log(
            `[PermalinkJump] Cancelling previous jump for ${loadingEventIdRef.current || 'unknown'}`
          );
          jumpAbortControllerRef.current.abort();
        }

        // Create new AbortController for this jump
        jumpAbortControllerRef.current = new AbortController();
        const currentAbortController = jumpAbortControllerRef.current;

        // Prepare for loading: hide timeline and show skeletons
        setIsReady(false);
        timelineSync.setTimeline(getEmptyTimeline());
        eventIdLoadInProgressRef.current = true;
        loadingEventIdRef.current = anchorId;

        log.log(`[PermalinkJump] Starting load for ${anchorId} from handleOpenEvent`);
        Sentry.addBreadcrumb({
          category: 'timeline.permalink',
          message: 'handleOpenEvent initiating load',
          level: 'info',
          data: { eventId: anchorId, roomId: room.roomId },
        });

        void timelineSync
          .loadEventTimeline(anchorId, currentAbortController.signal, {
            jumpMode: 'history_context',
          })
          .catch((err) => {
            // Ignore aborted operations
            if (err?.name === 'AbortError' || currentAbortController.signal.aborted) {
              log.log(`[PermalinkJump] Jump to ${anchorId} was cancelled`);
              return;
            }
            // Let other errors propagate to the error handler in useEventTimelineLoader
            throw err;
          })
          .finally(() => {
            // Only clean up if this is still the active controller
            if (jumpAbortControllerRef.current === currentAbortController) {
              eventIdLoadInProgressRef.current = false;
              loadingEventIdRef.current = null;
              jumpAbortControllerRef.current = null;
            }
          });
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
      showMaps,
      autoplayStickers,
      hideMemberInReadOnly,
      isReadOnly,
      hideMembershipEvents,
      hideNickAvatarEvents,
      hiddenEvents,
    },
    state: {
      focusItem: timelineSync.focusItem,
      editId: editInInput ? undefined : editId,
      activeReplyId,
      openThreadId,
    },
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
      onEditId: handleEditCallback,
      onResend: actions.handleResend,
      onDeleteFailedSend: actions.handleDeleteFailedSend,
      setOpenThread: actions.setOpenThread,
      handleOpenReply: actions.handleOpenReply,
    },
    utils: {
      htmlReactParserOptions,
      linkifyOpts,
      getMemberPowerTag,
      parseMemberEvent,
    },
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

      // Use extended settle window (500ms) when keyboard just closed to fully
      // suppress the jump button during the close animation. Otherwise use the
      // standard 250ms window.
      const keyboardCloseRecent = Date.now() - lastKeyboardCloseTimeRef.current < 500;
      const settleMs = keyboardCloseRecent ? 500 : SCROLL_SETTLE_MS;
      const withinSettleWindow = Date.now() - lastProgrammaticBottomPinAtRef.current < settleMs;

      // When the user is pinned to the bottom and content grows (images, embeds,
      // video thumbnails loading), scrollSize increases while offset stays put,
      // pushing distanceFromBottom above the threshold. Instead of flipping
      // atBottom to false (which shows the "Jump to Latest" button), chase the
      // bottom so the user stays pinned.
      const previousScrollSize = prevScrollSizeRef.current;
      const contentGrew = v.scrollSize > previousScrollSize;
      const scrollSizeDelta = v.scrollSize - previousScrollSize;
      prevScrollSizeRef.current = v.scrollSize;

      // When the keyboard opens/closes the VList viewportSize changes. The
      // scrollOffset doesn't immediately follow, so distanceFromBottom spikes
      // and isNowAtBottom becomes false — flashing the "Jump to Present" button.
      // This is especially common when the keyboard opens/closes quickly before
      // the chase RAF from a previous event has had a chance to execute.
      // Detect the change here (inside onScroll, race-free) and chase the
      // bottom before setAtBottom(false) is called.
      const viewportChanged =
        prevVListViewportRef.current > 0 && v.viewportSize !== prevVListViewportRef.current;
      if (viewportChanged) {
        lastViewportChangeTimeRef.current = Date.now();
      }
      prevVListViewportRef.current = v.viewportSize;

      // Skip content-chase and cache saves during init: the timeline is hidden
      // (opacity 0) while VList measures items and fires intermediate scroll
      // events.  Chasing the bottom here causes cascading scrollTo calls that
      // upstream doesn't have, producing visible layout churn after isReady.
      if (!isReadyRef.current) return;

      // While a jump scroll is settling (briefly after scrollToIndex), VList
      // fires intermediate scroll events that can incorrectly flip atBottom.
      // Use a short-lived block instead of the full focusItem lifetime so that
      // normal scrolling resumes quickly and atBottom is recomputed correctly.
      if (jumpScrollBlockRef.current) return;

      if (
        jumpLockActiveRef.current &&
        contentGrew &&
        Date.now() - userScrollIntentAtRef.current >= 250 &&
        Date.now() - lastJumpLayoutReanchorAtRef.current >= 120 &&
        jumpLayoutReanchorRafRef.current === undefined
      ) {
        jumpLayoutReanchorRafRef.current = requestAnimationFrame(() => {
          jumpLayoutReanchorRafRef.current = undefined;
          lastJumpLayoutReanchorAtRef.current = Date.now();
          reanchorJumpTarget('content_growth', {
            scrollDelta: scrollSizeDelta,
            align: timelineSyncRef.current.focusItem?.align ?? 'center',
          });
        });
      }

      if (
        jumpLockActiveRef.current &&
        Date.now() >= jumpReanchorScrollUntilRef.current &&
        Date.now() - userScrollIntentAtRef.current < 400
      ) {
        if (jumpLockReleaseTimerRef.current !== undefined) {
          clearTimeout(jumpLockReleaseTimerRef.current);
        }
        jumpLockReleaseTimerRef.current = setTimeout(() => {
          jumpLockReleaseTimerRef.current = undefined;
          releaseJumpLock('user_scroll');
        }, 120);
      }

      if (
        atBottomRef.current &&
        !isNowAtBottom &&
        (contentGrew || viewportChanged || withinSettleWindow)
      ) {
        // Defer the chase to the next animation frame so VList finishes its
        // current layout pass. Synchronous scrollTo causes cascading scroll
        // events that produce visible jumps when images/embeds load.
        requestAnimationFrame(() => {
          const vl = vListRef.current;
          if (vl && atBottomRef.current) {
            lastProgrammaticBottomPinAtRef.current = Date.now();
            vl.scrollTo(vl.scrollSize);
          }
        });
        return;
      }
      // Don't flip atBottom to false while viewport change is settling (keyboard
      // open/close). Wait for the chase RAF to complete and subsequent scroll
      // events to stabilize before re-evaluating atBottom. 500ms window allows
      // for slower devices and multiple rapid viewport changes (keyboard animations,
      // address bar hiding, etc.) to complete before checking scroll position.
      const withinViewportChangeWindow = Date.now() - lastViewportChangeTimeRef.current < 500;
      if (isNowAtBottom !== atBottomRef.current && !withinViewportChangeWindow) {
        setAtBottom(isNowAtBottom);
      }

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
    [reanchorJumpTarget, releaseJumpLock, setAtBottom]
  );

  const showLoadingPlaceholders =
    timelineSync.eventsLength === 0 &&
    !isReady &&
    (eventIdLoadInProgressRef.current ||
      timelineSync.canPaginateBack ||
      timelineSync.backwardStatus === 'loading');

  // Log skeleton visibility for debugging
  useEffect(() => {
    if (eventId && showLoadingPlaceholders) {
      log.log(
        `[PermalinkJump] Showing loading skeletons: eventsLength=${timelineSync.eventsLength}, isReady=${isReady}, eventIdLoadInProgress=${eventIdLoadInProgressRef.current}`
      );
    }
  }, [eventId, showLoadingPlaceholders, timelineSync.eventsLength, isReady]);

  // When showing loading placeholders, provide dummy data so VList renders items.
  // Without this, VList receives an empty array and renders nothing, causing a blank timeline.
  const placeholderDummyData = useMemo(() => Array(5).fill(null) as ProcessedEvent[], []);

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
  const timelineBottomFloatLift =
    !atBottomState && isReady ? { bottom: `calc(${config.space.S400} + ${toRem(52)})` } : undefined;
  const timelineTopFloatLift =
    unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady
      ? { top: `calc(${config.space.S400} + ${toRem(52)})` }
      : undefined;

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
    hiddenEvents,
    mxUserId: mx.getUserId(),
    readUptoEventId: readUptoEventIdRef.current,
    hideMembershipEvents,
    hideNickAvatarEvents,
    isReadOnly,
    hideMemberInReadOnly,
    messageGroupingThreshold,
  });

  processedEventsRef.current = processedEvents;

  useLayoutEffect(() => {
    if (!jumpLockActiveRef.current) return;
    const targetEventId = jumpLockEventIdRef.current;
    if (!targetEventId) return;
    if (jumpScrollBlockRef.current) return;
    if (Date.now() - userScrollIntentAtRef.current < 250) return;

    const targetIndex = processedEventsRef.current.findIndex(
      (e) => e.mEvent.getId() === targetEventId
    );
    if (targetIndex < 0) {
      // Keep the lock alive while the initial jump retry loop is still trying to
      // surface the target row. Releasing here would disable later re-anchors
      // during decrypt/reflow churn even though the target may still appear.
      if (jumpRetryIntervalRef.current !== undefined || timelineSync.focusItem?.scrollTo) {
        return;
      }
      releaseJumpLock('missing_target');
      return;
    }

    if (jumpLockReleaseTimerRef.current !== undefined) {
      clearTimeout(jumpLockReleaseTimerRef.current);
      jumpLockReleaseTimerRef.current = undefined;
    }

    setAtBottom(false);
    reanchorJumpTarget('timeline_remeasure', { eventId: targetEventId, align: 'center' });
  }, [
    processedEvents,
    timelineSync.eventsLength,
    timelineSync.backwardStatus,
    timelineSync.forwardStatus,
    timelineSync.focusItem,
    reanchorJumpTarget,
    releaseJumpLock,
    setAtBottom,
  ]);

  useLayoutEffect(() => {
    const lastEventId = processedEvents.at(-1)?.id;
    const prevLastEventId = lastRenderedTailRef.current;
    lastRenderedTailRef.current = lastEventId;

    if (!isReady) return;
    if (!timelineSync.liveTimelineLinked) return;
    if (!atBottomRef.current) return;
    if (jumpLockActiveRef.current) return;
    if (jumpScrollBlockRef.current) return;
    if (!lastEventId || lastEventId === prevLastEventId) return;

    lastProgrammaticBottomPinAtRef.current = Date.now();
    scrollToBottom();

    requestAnimationFrame(() => {
      if (!atBottomRef.current) return;
      const v = vListRef.current;
      if (!v) return;
      lastProgrammaticBottomPinAtRef.current = Date.now();
      v.scrollTo(v.scrollSize);
    });
  }, [processedEvents, isReady, timelineSync.liveTimelineLinked, scrollToBottom]);

  // Use dummy data for VList when showing loading placeholders, otherwise use actual events.
  const vListData = showLoadingPlaceholders ? placeholderDummyData : processedEvents;

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return undefined;

    const markUserScrollIntent = () => {
      userScrollIntentAtRef.current = Date.now();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' '
      ) {
        markUserScrollIntent();
      }
    };

    el.addEventListener('wheel', markUserScrollIntent, { passive: true });
    el.addEventListener('touchmove', markUserScrollIntent, { passive: true });
    el.addEventListener('pointerdown', markUserScrollIntent, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      el.removeEventListener('wheel', markUserScrollIntent);
      el.removeEventListener('touchmove', markUserScrollIntent);
      el.removeEventListener('pointerdown', markUserScrollIntent);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
    if (!isReady || processedEvents.length === 0) return;
    const renderKey = `${room.roomId}:${eventId ?? 'live'}`;
    if (timelineRenderMetricRoomRef.current === renderKey) return;
    timelineRenderMetricRoomRef.current = renderKey;
    completeRoomTimelineRender(
      room.roomId,
      eventId ? 'permalink_context' : 'live_timeline',
      processedEvents.length
    );
  }, [eventId, isReady, processedEvents.length, room.roomId]);

  useEffect(() => {
    if (!onEditLastMessageRef) return;
    const ref = onEditLastMessageRef;
    ref.current = () => {
      const myUserId = mx.getUserId();
      const found = findLastOwnEditableProcessedEvent(processedEventsRef.current, myUserId);
      if (found?.mEvent.getId()) handleEditCallback(found.mEvent.getId());
    };
  }, [onEditLastMessageRef, mx, handleEditCallback]);

  // Keep stable refs so the edit-nav effect below doesn't stale-close over them.
  const editIdRef = useRef(editId);
  editIdRef.current = editId;
  const handleEditRef = useRef(handleEdit);
  handleEditRef.current = handleEdit;

  const [editNavRequest, setEditNavRequest] = useAtom(
    roomIdToEditNavRequestAtomFamily(room.roomId)
  );

  useEffect(() => {
    if (!editNavRequest) return;
    const editableEvents = processedEventsRef.current.filter(
      (e) => !e.mEvent.isRedacted() && canEditEvent(mx, e.mEvent)
    );
    if (editableEvents.length === 0) {
      setEditNavRequest(undefined);
      return;
    }

    const currentEditId = editIdRef.current;
    const doHandleEdit = handleEditRef.current;

    if (currentEditId === undefined) {
      // No active edit — start at the most recent editable message.
      const latest = editableEvents.at(-1)!;
      const id = latest.mEvent.getId();
      if (id) doHandleEdit(id);
      setEditNavRequest(undefined);
      return;
    }

    const currentIdx = editableEvents.findIndex((e) => e.mEvent.getId() === currentEditId);
    const next =
      editNavRequest.dir === 'prev'
        ? editableEvents[currentIdx - 1]
        : editableEvents[currentIdx + 1];
    setEditNavRequest(undefined);
    if (!next) return;
    const id = next.mEvent.getId();
    if (id) doHandleEdit(id);
  }, [editNavRequest, mx, setEditNavRequest]);

  useEffect(() => {
    const v = vListRef.current;
    if (!v) return;
    if (
      canPaginateBackRef.current &&
      backwardStatusRef.current === 'idle' &&
      v.scrollSize <= v.viewportSize
    ) {
      void timelineSyncRef.current.handleTimelinePagination(true);
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
        if (autopagAttemptsRef.current < 20) {
          autopagAttemptsRef.current += 1;
          void timelineSyncRef.current.handleTimelinePagination(true);
        }
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
            before={chipIcon(ChatTeardropDots)}
            onClick={() =>
              timelineSync.loadEventTimeline(unreadInfo.readUptoEventId, undefined, {
                jumpMode: 'history_context',
                target: 'next',
              })
            }
          >
            <Text size="L400">Jump to Unread</Text>
          </Chip>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={chipIcon(Checks)}
            onClick={handleMarkAsRead}
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
          data={vListData}
          shift={shift}
          className={css.messageList}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            paddingLeft: config.space.S200,
            paddingRight: timelineRightSpacing,
            paddingTop: topSpacerHeight > 0 ? topSpacerHeight : config.space.S600,
            paddingBottom: timelineBottomSpacing,
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
                        paddingTop: config.space.S700,
                        paddingBottom: config.space.S600,
                        paddingInlineStart:
                          messageLayout === MessageLayout.Compact ? config.space.S0 : toRem(64),
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
                      <div className={css.dividerInset}>
                        <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
                          <Text size="L400">{getDayDividerText(eventData.mEvent.getTs())}</Text>
                        </Badge>
                      </div>
                    </TimelineDivider>
                  </MessageBase>
                )}
                {eventData.willRenderNewDivider && (
                  <MessageBase space={messageSpacing}>
                    <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
                      <div className={css.dividerInset}>
                        <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
                          <Text size="L400">New Messages</Text>
                        </Badge>
                      </div>
                    </TimelineDivider>
                  </MessageBase>
                )}
              </>
            ) : null;

            if (index === 0) {
              return (
                <Fragment key="first-item-block">
                  {!timelineSync.canPaginateBack && (
                    <div
                      style={{
                        paddingTop: config.space.S700,
                        paddingBottom: config.space.S600,
                        paddingInlineStart:
                          messageLayout === MessageLayout.Compact ? config.space.S0 : toRem(64),
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

      {showBackPaginationSpinner && (
        <TimelineFloat position="Top" style={timelineTopFloatLift}>
          <Spinner variant="Secondary" size="400" />
        </TimelineFloat>
      )}

      {showFrontPaginationSpinner && (
        <TimelineFloat position="Bottom" style={timelineBottomFloatLift}>
          <Spinner variant="Secondary" size="400" />
        </TimelineFloat>
      )}

      {(!atBottomState || !timelineSync.liveTimelineLinked) && isReady && (
        <TimelineFloat position="Bottom">
          {frontPaginationJSX}
          {!frontPaginationJSX && (
            <Chip
              variant="SurfaceVariant"
              radii="Pill"
              outlined
              before={chipIcon(ArrowDown)}
              onClick={() => {
                if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
                releaseJumpLock('jump_to_latest');
                setUnreadInfo((prev) => getUnreadInfoAfterJumpToLatest(prev));
                timelineSync.jumpToLatest();
              }}
            >
              <Text size="L400">Jump to Latest</Text>
            </Chip>
          )}
        </TimelineFloat>
      )}
      {!isReady && !showLoadingPlaceholders && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: `0 0 ${config.space.S600} 0`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <MessageBase space={messageSpacing}>
            {messageLayout === MessageLayout.Compact ? (
              <CompactPlaceholder />
            ) : (
              <DefaultPlaceholder />
            )}
          </MessageBase>
          <MessageBase space={messageSpacing}>
            {messageLayout === MessageLayout.Compact ? (
              <CompactPlaceholder />
            ) : (
              <DefaultPlaceholder />
            )}
          </MessageBase>
          <MessageBase space={messageSpacing}>
            {messageLayout === MessageLayout.Compact ? (
              <CompactPlaceholder />
            ) : (
              <DefaultPlaceholder />
            )}
          </MessageBase>
        </div>
      )}
    </Box>
  );
}
