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
import { inAppBannerAtom } from '$state/sessions';
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
  getEmptyTimeline,
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

  // Preserved scroll offset from just before the thread drawer was opened, so
  // we can restore position when the drawer closes and the main column reflows
  // to a wider width (remeasured items would otherwise leave the VList at an
  // unexpected position).
  const scrollOffsetBeforeThreadRef = useRef<number | undefined>(undefined);

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
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

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

  const lastProgrammaticBottomPinAtRef = useRef(0);

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

  const setInAppBanner = useSetAtom(inAppBannerAtom);
  const handleDisconnectedFragment = useCallback(
    (evtId: string) => {
      // Show a notification banner when a disconnected timeline fragment is detected
      // and we're falling back to the live timeline.
      setInAppBanner({
        id: `disconnected-${evtId}-${Date.now()}`,
        title: 'Jumped to latest messages',
        body: "Couldn't find the target message in recent history — showing latest messages instead.",
        onClick: () => {
          setInAppBanner(null);
        },
      });

      // Auto-dismiss after 8 seconds
      setTimeout(() => setInAppBanner(null), 8000);
    },
    [setInAppBanner]
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
    onDisconnectedFragment: handleDisconnectedFragment,
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
    let retryIntervalId: ReturnType<typeof setInterval> | undefined;
    let recenterTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;

    if (timelineSync.focusItem) {
      // Reveal the timeline in the same effect that scrolls to the focus event so
      // both the scroll and opacity-1 land in a single commit — no intermediate
      // frame where events are rendered but still opacity-0.
      setIsReady(true);
      if (timelineSync.focusItem.scrollTo && vListRef.current) {
        const processedIndex = getRawIndexToProcessedIndex(timelineSync.focusItem.index);
        if (processedIndex !== undefined) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
          timelineSync.setFocusItem((prev) => (prev ? { ...prev, scrollTo: false } : undefined));
          scrollSucceeded = true;

          // Stop retry loop now that scroll succeeded
          if (retryIntervalId !== undefined) {
            clearInterval(retryIntervalId);
            retryIntervalId = undefined;
          }

          // Use ResizeObserver to wait for layout to stabilize (images loading, etc.)
          // before re-centering. This prevents the scroll target from being pushed out
          // of view when media loads above it.
          if (messageListRef.current && 'ResizeObserver' in globalThis) {
            let resizeDebounceTimer: ReturnType<typeof setTimeout> | undefined;

            resizeObserver = new ResizeObserver(() => {
              // Clear any pending re-center and schedule a new one after 100ms of no resize
              if (resizeDebounceTimer !== undefined) {
                clearTimeout(resizeDebounceTimer);
              }

              resizeDebounceTimer = setTimeout(() => {
                // Layout has settled (no resize for 100ms) — re-center now
                if (vListRef.current && processedIndex !== undefined) {
                  log.log(
                    `[PermalinkJump] Re-centering after layout settled: processedIndex=${processedIndex}`
                  );
                  vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
                }

                // Stop observing after first stable re-center
                if (resizeObserver) {
                  resizeObserver.disconnect();
                  resizeObserver = undefined;
                }
              }, 100);
            });

            resizeObserver.observe(messageListRef.current);

            // Fallback: stop observing after 2 seconds regardless
            recenterTimeoutId = setTimeout(() => {
              if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = undefined;
              }
            }, 2000);
          } else {
            // Fallback for browsers without ResizeObserver: use timeout
            recenterTimeoutId = setTimeout(() => {
              if (vListRef.current && processedIndex !== undefined) {
                vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
              }
            }, 600);
          }

          return true;
        }
        return false;
      };

      // Try immediate scroll
      if (!attemptScroll()) {
        // If immediate scroll failed (event not in processedEvents yet), retry periodically.
        // This handles the case where pagination just loaded the event but React hasn't
        // finished processing/rendering it yet.
        retryIntervalId = setInterval(() => {
          if (attemptScroll()) {
            // attemptScroll() now clears the interval itself when it succeeds
          }
        }, 100);
      }
      timeoutId = setTimeout(() => {
        timelineSync.setFocusItem(undefined);
      }, 2000);
    }
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (retryIntervalId !== undefined) clearInterval(retryIntervalId);
      if (recenterTimeoutId !== undefined) clearTimeout(recenterTimeoutId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [timelineSync.focusItem, timelineSync, reducedMotion, getRawIndexToProcessedIndex]);

  useEffect(() => {
    if (!eventId) return;
    setIsReady(false);
    // Re-arm the initial-scroll guard so that if the jump fails and falls back
    // to the live timeline, the useLayoutEffect can fire via the normal path.
    hasInitialScrolledRef.current = false;
    // Reset auto-pagination cap so the new timeline can fill the viewport.
    autopagAttemptsRef.current = 0;
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
      .loadEventTimeline(eventId)
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
          data: { eventId, error: String(err), roomId: room.roomId },
        });
      })
      .finally(() => {
        // Clear the flag whether the load succeeded or failed. If it succeeded,
        // focusItem will be set and the focus scroll will handle it. If it failed,
        // the recovery scroll can now safely fire.
        eventIdLoadInProgressRef.current = false;
        loadingEventIdRef.current = null;
      });
  }, [eventId, room.roomId]);

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
      const lastIdx = processedEventsRef.current.length - 1;
      if (lastIdx >= 0) vListRef.current?.scrollToIndex(lastIdx, { align: 'end' });

      initialScrollTimerRef.current = setTimeout(() => {
        initialScrollTimerRef.current = undefined;
        // Final bail-out checks before revealing
        if (isReadyRef.current) return;
        if (timelineSyncRef.current.focusItem) return;
        if (timelineSyncRef.current.eventsLength === 0) return;
        if (!timelineSyncRef.current.liveTimelineLinked) return;

        const idx = processedEventsRef.current.length - 1;
        if (idx >= 0) vListRef.current?.scrollToIndex(idx, { align: 'end' });
        setIsReady(true);
      }, 80);
    }, 1000);
  }, [
    eventId,
    isReady,
    timelineSync.eventsLength,
    timelineSync.focusItem,
    timelineSync.liveTimelineLinked,
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
      const shrank = newHeight < prev;

      if (shrank && atBottom) {
        vListRef.current?.scrollTo(vListRef.current.scrollSize);
      }
      prevViewportHeightRef.current = newHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // When the thread drawer opens/closes on desktop, the main timeline column
  // changes width and Virtua remeasures all item heights.  Save the scroll
  // offset just before the open so we can restore it after the close once
  // layout has settled (two RAFs to let Virtua finish its resize cycle).
  useEffect(() => {
    if (openThreadId) {
      scrollOffsetBeforeThreadRef.current = vListRef.current?.scrollOffset;
    } else if (scrollOffsetBeforeThreadRef.current !== undefined) {
      const savedOffset = scrollOffsetBeforeThreadRef.current;
      scrollOffsetBeforeThreadRef.current = undefined;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          vListRef.current?.scrollTo(savedOffset);
        });
      });
    }
  }, [openThreadId]);

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
          .loadEventTimeline(anchorId, currentAbortController.signal)
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
    [setAtBottom]
  );

  const showLoadingPlaceholders =
    timelineSync.eventsLength === 0 &&
    (!isReady || timelineSync.canPaginateBack || timelineSync.backwardStatus === 'loading');

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

  // Use dummy data for VList when showing loading placeholders, otherwise use actual events.
  const vListData = showLoadingPlaceholders ? placeholderDummyData : processedEvents;

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
          data={vListData}
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
              before={<Icon size="50" src={Icons.ArrowBottom} />}
              onClick={() => {
                if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
                timelineSync.setTimeline(getInitialTimeline(room));
                scrollToBottom();
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
