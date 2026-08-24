import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Header, IconButton, Scroll, Spinner, Text, config, toRem } from 'folds';
import { Chats, composerIcon, X } from '$components/icons/phosphor';
import type { IEvent, Room, CryptoBackend } from '$types/matrix-sdk';
import {
  Direction,
  MatrixEvent,
  MatrixEventEvent,
  ReceiptType,
  RoomEvent,
  ThreadEvent,
} from '$types/matrix-sdk';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useTimelineActions } from '$hooks/timeline/useTimelineActions';
import { useTimelineRendererContext } from '$hooks/timeline/useTimelineRendererContext';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import {
  getThreadReplyEvents,
  isThreadRelationEvent,
  reactionOrEditEvent,
  unwrapRelationJumpTarget,
  getEditedEvent,
  getEventReactions,
} from '$utils/room/relations';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useIsInactivePanel } from '$hooks/useRoom';
import { nicknamesAtom } from '$state/nicknames';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useEditor } from '$components/editor';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useMessageEdit } from '$hooks/useMessageEdit';
import {
  useProcessedTimeline,
  getProcessedRowIndexForRawTimelineIndex,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import { useTimelineEventRenderer } from '$hooks/timeline/useTimelineEventRenderer';
import { RoomInput } from './RoomInput';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import * as css from './ThreadDrawer.css';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { isMobileOrTablet } from '$utils/platform';
import { useDismissOnBack } from '$utils/androidBack';
import type { Persona } from '$app/persona';

type ThreadDrawerProps = {
  room: Room;
  threadRootId: string;
  onClose: () => void;
  overlay?: boolean;
};

export function ThreadDrawer({ room, threadRootId, onClose, overlay }: ThreadDrawerProps) {
  const mx = useMatrixClient();
  const drawerRef = useRef<HTMLDivElement>(null);
  const editor = useEditor();
  const [forceUpdateCounter, forceUpdate] = useState(0);
  const [jumpToEventId, setJumpToEventId] = useState<string | undefined>(undefined);
  const [loadingOlderReplies, setLoadingOlderReplies] = useState(false);
  const [canPageBack, setCanPageBack] = useState(true);
  const paginatingOlderRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevReplyCountRef = useRef(0);
  const processedEventsRef = useRef<ProcessedEvent[]>([]);
  const serverFetchAttemptedRef = useRef<string | null>(null);
  const autoFillInProgressRef = useRef(false);
  const { editId, handleEdit } = useMessageEdit(editor);
  const nicknames = useAtomValue(nicknamesAtom);
  const jotaiStore = useStore();
  const getGlobalProfile = useCallback(
    (userId: string) => jotaiStore.get(profilesCacheAtom)[userId],
    [jotaiStore]
  );
  const pushProcessor = mx.pushProcessor;
  useDismissOnBack(onClose);
  const isInactivePanel = useIsInactivePanel();

  // Shared renderer context — replaces 17+ inline useSetting calls,
  // linkifyOpts useMemo, htmlReactParserOptions useMemo, and the
  // permissions block that were duplicated with RoomTimeline.
  const rendererCtx = useTimelineRendererContext(room);

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

  // ThreadDrawer overrides on top of the shared settings:
  //   - hideThreadChip: true (thread replies don't show a nested thread chip)
  //   - hideMembershipEvents: true (thread view never shows membership)
  //   - hideNickAvatarEvents: true (thread view never shows nick changes)
  const threadSettings = useMemo(
    () => ({
      ...settings,
      hideThreadChip: true as const,
      hideMembershipEvents: true,
      hideNickAvatarEvents: true,
    }),
    [settings]
  );

  const hiddenEvents = settings.hiddenEvents;
  const hideMemberInReadOnly = settings.hideMemberInReadOnly;
  const hideReads = settings.hideReads;

  // Ignored users
  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  // Image packs
  const roomToParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms: Room[] = useImagePackRooms(room.roomId, roomToParents);

  // Reply draft (keyed by threadRootId to match RoomInput's draftKey logic)
  const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(threadRootId));
  const replyDraft = useAtomValue(roomIdToReplyDraftAtomFamily(threadRootId));
  const activeReplyId = replyDraft?.eventId;
  const suppressMark = !replyDraft?.body;

  // User profile popup
  const openUserRoomProfile = useOpenUserRoomProfile();
  const optionalSpace = useSpaceOptionally();

  // Shared timeline actions — replaces inline handleUserClick,
  // handleUsernameClick, handleReplyClick, handleReactionToggle,
  // handleResend, handleDeleteFailedSend (~65 lines).
  // handleOpenEvent is caller-specific (ThreadDrawer's scroll architecture).
  // setOpenThread is a no-op (thread drawer can't open sub-threads).
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
    activeReplyBody: replyDraft?.body,
    setReplyDraft: setReplyDraft as unknown as (draft: unknown) => void,
    threadRootId,
    openThreadId: threadRootId,
    setOpenThread: () => {},
    handleEdit,
    handleOpenEvent: (id) => {
      let anchorId = unwrapRelationJumpTarget(room, id);
      const threadLive = thread?.timelineSet.getLiveTimeline();
      const threadEvents = threadLive?.getEvents();
      const rawIndex = threadEvents?.findIndex((e) => e.getId() === anchorId) ?? -1;
      if (rawIndex >= 0) {
        const nearest = getProcessedRowIndexForRawTimelineIndex(
          processedEventsRef.current,
          rawIndex
        );
        if (nearest) {
          const rowEv = processedEventsRef.current[nearest.rowIndex];
          if (rowEv) anchorId = rowEv.id;
        }
      }
      const isRoot = anchorId === threadRootId;
      const isInReplies = processedEventsRef.current.some((e) => e.id === anchorId);
      if (!isRoot && !isInReplies) return;
      setJumpToEventId(anchorId);
      setTimeout(() => setJumpToEventId(undefined), 2500);
      const el = drawerRef.current;
      if (el) {
        const target = el.querySelector(`[data-message-id="${anchorId}"]`);
        target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
  });

  // Thread timeline data for useProcessedTimeline
  const thread = room.getThread(threadRootId);
  const threadTimeline = thread?.timelineSet.getLiveTimeline();

  // Prefer the event from the main timeline (already indexed), but fall back
  // to thread.rootEvent — populated from bundled /threads server data even when
  // the root is outside the currently-loaded timeline window.
  const rootEvent = room.findEventById(threadRootId) ?? thread?.rootEvent;
  const totalEvents = threadTimeline?.getEvents().length ?? 0;
  const linkedTimelines = useMemo(() => {
    void totalEvents;
    return threadTimeline ? [threadTimeline] : [];
  }, [threadTimeline, totalEvents]);
  const items = useMemo(() => Array.from({ length: totalEvents }, (_, i) => i), [totalEvents]);

  const processedEvents = useProcessedTimeline({
    items,
    linkedTimelines,
    skipThreadFilter: true,
    ignoredUsersSet,
    hiddenEvents,
    mxUserId: mx.getUserId(),
    readUptoEventId: undefined,
    hideMembershipEvents: true,
    hideNickAvatarEvents: true,
    isReadOnly,
    hideMemberInReadOnly,
  });

  // When the thread's own timeline is empty (server-side threads not yet fetched,
  // or classic sync before backfill completes), fall back to scanning the main
  // room timeline directly so replies are shown immediately.
  const displayReplies = useMemo((): ProcessedEvent[] => {
    // `forceUpdateCounter` is a cache-busting key for thread/timeline updates.
    void forceUpdateCounter;
    const filtered = processedEvents.filter((e) => e.id !== threadRootId);
    if (filtered.length > 0) return filtered;
    const timelineSet = thread?.timelineSet ?? room.getUnfilteredTimelineSet();
    return getThreadReplyEvents(room, threadRootId).map((ev, idx) => ({
      id: ev.getId() ?? `thread-reply-${idx}`,
      itemIndex: idx,
      mEvent: ev,
      isRedacted: ev.isRedacted(),
      timelineSet,
      eventSender: ev.getSender() ?? null,
      collapsed: false,
      willRenderNewDivider: false,
      willRenderDayDivider: false,
      editId: getEditedEvent(ev.getId() ?? '', ev, timelineSet)?.getId(),
      reactionsKey:
        getEventReactions(timelineSet, ev.getId() ?? '')
          ?.getSortedAnnotationsByKey()
          ?.map((r) => `${r[0]}:${r[1].size}`)
          .join(',') ?? '',
      content: ev.getContent(),
      sendStatus: ev.getAssociatedStatus(),
    }));
    // forceUpdateCounter makes this recompute whenever events arrive
  }, [room, threadRootId, thread, processedEvents, forceUpdateCounter]);

  processedEventsRef.current = displayReplies;

  const processedReplies = displayReplies;

  // Ensure the Thread object exists and has its reply events loaded.
  useEffect(() => {
    // Case A: create thread shell; SDK handles the rest asynchronously.
    if (!room.getThread(threadRootId)) {
      const localRoot = room.findEventById(threadRootId);
      if (localRoot) {
        room.createThread(threadRootId, localRoot, [], false);
      } else {
        // Root not in local timeline — fetch it from the server without
        // touching the main timeline (no TimelineRefresh side-effect).
        mx.fetchRoomEvent(room.roomId, threadRootId)
          .then((rawEvt) => {
            if (room.getThread(threadRootId)) return; // created concurrently
            room.createThread(threadRootId, new MatrixEvent(rawEvt as IEvent), [], false);
          })
          .catch(() => {});
      }
    }

    const currThread = room.getThread(threadRootId);
    // Case B: SDK is actively initialising — don't interfere.
    if (!currThread || !currThread.initialEventsFetched) return;

    // Case C: SDK is done (or classic sync). Backfill from live timeline if
    // thread.events is still empty (classic sync path; server-side was already
    // populated by paginateEventTimeline inside updateThreadMetadata).
    const hasRepliesInThread = currThread.events.some(
      (ev) =>
        ev.getId() !== threadRootId &&
        !reactionOrEditEvent(ev) &&
        isThreadRelationEvent(ev, threadRootId)
    );
    if (hasRepliesInThread) return;

    const liveEvents = getThreadReplyEvents(room, threadRootId);
    if (liveEvents.length > 0) {
      // thread.addEvents() is typed as void but is internally async; schedule
      // forceUpdate in a microtask so the timeline has been updated first.
      currThread.addEvents(liveEvents, false);
      Promise.resolve().then(() => forceUpdate((n) => n + 1));
      return;
    }

    if (serverFetchAttemptedRef.current === threadRootId) return;
    serverFetchAttemptedRef.current = threadRootId;

    mx.paginateEventTimeline(currThread.timelineSet.getLiveTimeline(), { backwards: true })
      .then(() => forceUpdate((n) => n + 1))
      .catch(() => {});
    // forceUpdateCounter must be in deps so this effect re-runs after
    // ThreadEvent.Update fires (which flips initialEventsFetched from false to
    // true).
  }, [mx, room, threadRootId, forceUpdate, forceUpdateCounter]);

  // Re-render when new thread events arrive (including reactions via ThreadEvent.Update).
  useEffect(() => {
    const isEventInThread = (mEvent: MatrixEvent): boolean => {
      // Direct thread message or the root itself
      if (mEvent.getId() === threadRootId || isThreadRelationEvent(mEvent, threadRootId)) {
        return true;
      }

      // Check if this is a reaction/edit targeting an event in this thread
      if (reactionOrEditEvent(mEvent)) {
        const relation = mEvent.getRelation();
        const targetEventId = relation?.event_id;
        if (targetEventId) {
          const targetEvent = room.findEventById(targetEventId);
          if (
            targetEvent &&
            (targetEvent.getId() === threadRootId ||
              isThreadRelationEvent(targetEvent, threadRootId))
          ) {
            return true;
          }
        }
      }

      return false;
    };

    const onTimeline = (mEvent: MatrixEvent) => {
      if (isEventInThread(mEvent)) {
        forceUpdate((n) => n + 1);
      }
    };
    const onRedaction = (mEvent: MatrixEvent) => {
      // Redactions (removing reactions/messages) should also trigger updates
      if (isEventInThread(mEvent)) {
        forceUpdate((n) => n + 1);
      }
    };
    const onDecrypted = (mEvent: MatrixEvent) => {
      if (isEventInThread(mEvent)) {
        const currThread = room.getThread(threadRootId);
        if (currThread && !currThread.events.includes(mEvent)) {
          currThread.addEvents([mEvent], false);
        }
        forceUpdate((n) => n + 1);
      }
    };
    const onThreadUpdate = () => forceUpdate((n) => n + 1);
    mx.on(RoomEvent.Timeline, onTimeline);
    room.on(RoomEvent.Redaction, onRedaction);
    room.on(ThreadEvent.Update, onThreadUpdate);
    room.on(ThreadEvent.NewReply, onThreadUpdate);
    mx.on(MatrixEventEvent.Decrypted, onDecrypted);
    return () => {
      mx.off(RoomEvent.Timeline, onTimeline);
      room.removeListener(RoomEvent.Redaction, onRedaction);
      room.removeListener(ThreadEvent.Update, onThreadUpdate);
      room.removeListener(ThreadEvent.NewReply, onThreadUpdate);
      mx.removeListener(MatrixEventEvent.Decrypted, onDecrypted);
    };
  }, [mx, room, threadRootId]);

  // Retry decryption for thread root events that failed because they were fetched before keys arrived
  useEffect(() => {
    if (!rootEvent?.isEncrypted() || !rootEvent.isDecryptionFailure()) return undefined;
    const crypto = mx.getCrypto();
    if (!crypto) return undefined;

    const retryDecrypt = async () => {
      try {
        await rootEvent.attemptDecryption(crypto as CryptoBackend);
        if (!rootEvent.isDecryptionFailure()) forceUpdate((n) => n + 1);
      } catch {
        // ignore
      }
    };

    // Piggyback on other decryptions as a proxy signal for key arrival
    const sentinels = room
      .getLiveTimeline()
      .getEvents()
      .slice(-50)
      .filter((e) => e.isEncrypted());
    sentinels.forEach((e) => e.on(MatrixEventEvent.Decrypted, retryDecrypt));

    // Attempt immediately in case keys arrived since the initial failure
    retryDecrypt();

    return () => {
      sentinels.forEach((e) => e.off(MatrixEventEvent.Decrypted, retryDecrypt));
    };
  }, [rootEvent, room, mx]);

  // Mark thread as read when viewing it
  useEffect(() => {
    if (isInactivePanel) return; // Don't send read receipt while room is behind the list
    const markThreadAsRead = async () => {
      const currentThread = room.getThread(threadRootId);
      if (!currentThread) return;

      const events = currentThread.events || [];
      if (events.length === 0) return;

      const lastEvent = events[events.length - 1];
      if (!lastEvent || lastEvent.isSending()) return;

      const userId = mx.getUserId();
      if (!userId) return;

      const readUpToId = currentThread.getEventReadUpTo(userId, false);
      const lastEventId = lastEvent.getId();

      // Only send receipt if we haven't already read up to the last event
      if (readUpToId !== lastEventId) {
        try {
          await mx.sendReadReceipt(lastEvent, ReceiptType.Read);
        } catch (err) {
          console.warn('Failed to send thread read receipt:', err);
        }
      }
    };

    // Mark as read when opened and when new messages arrive
    markThreadAsRead();
  }, [mx, room, threadRootId, forceUpdateCounter, isInactivePanel]);

  const replyEvents = getThreadReplyEvents(room, threadRootId);
  const isThreadLoading = !!thread && !thread.initialEventsFetched && replyEvents.length === 0;

  const hasOlderReplies =
    canPageBack &&
    !!thread?.initialEventsFetched &&
    thread?.timelineSet.getLiveTimeline().getPaginationToken(Direction.Backward) != null;

  // Keep a ref so the scroll handler always reads the latest value without deps.
  const hasOlderRepliesRef = useRef(hasOlderReplies);
  hasOlderRepliesRef.current = hasOlderReplies;

  const loadOlderReplies = useCallback(() => {
    const t = room.getThread(threadRootId);
    if (!t || !t.initialEventsFetched || paginatingOlderRef.current) return;
    paginatingOlderRef.current = true;
    setLoadingOlderReplies(true);
    mx.paginateEventTimeline(t.timelineSet.getLiveTimeline(), { backwards: true })
      .then((hasMore) => {
        paginatingOlderRef.current = false;
        if (!hasMore) setCanPageBack(false);
        setLoadingOlderReplies(false);
        forceUpdate((n) => n + 1);
      })
      .catch(() => {
        paginatingOlderRef.current = false;
        setLoadingOlderReplies(false);
      });
  }, [mx, room, threadRootId, forceUpdate]);

  const loadOlderRepliesRef = useRef(loadOlderReplies);
  loadOlderRepliesRef.current = loadOlderReplies;

  useEffect(() => {
    setCanPageBack(true);
    autoFillInProgressRef.current = false;
  }, [threadRootId]);

  const handleRepliesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 200 && hasOlderRepliesRef.current && !paginatingOlderRef.current) {
      loadOlderRepliesRef.current();
    }
  }, []);

  // Auto-scroll to bottom when event count grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (prevReplyCountRef.current === 0 || isAtBottom || autoFillInProgressRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevReplyCountRef.current = processedReplies.length;
  }, [processedReplies.length]);

  // Auto-fill viewport: paginate backwards until content overflows the scroll
  // container, then stop.  The scroll handler (handleRepliesScroll) loads more
  // when the user scrolls back up past the top threshold.
  useEffect(() => {
    if (paginatingOlderRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (!hasOlderReplies) {
      autoFillInProgressRef.current = false;
      return;
    }
    if (el.scrollHeight <= el.clientHeight) {
      // Content doesn't yet fill the viewport — paginate one more page.
      autoFillInProgressRef.current = true;
      loadOlderRepliesRef.current();
    } else {
      // Content now overflows — fill is complete.
      autoFillInProgressRef.current = false;
    }
  }, [processedReplies.length, hasOlderReplies]);

  const handleEditLastMessage = useCallback(() => {
    const userId = mx.getUserId();
    const ownReply = [...processedEventsRef.current]
      .toReversed()
      .find(
        (e) =>
          e.id !== threadRootId &&
          e.mEvent.getSender() === userId &&
          !e.mEvent.isRedacted() &&
          !reactionOrEditEvent(e.mEvent)
      );
    const ownId = ownReply?.id;
    if (ownId) {
      handleEdit(ownId);
      const el = drawerRef.current;
      if (el) {
        el.querySelector(`[data-message-id="${ownId}"]`)?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [mx, threadRootId, handleEdit]);

  const focusItem = jumpToEventId
    ? { eventId: jumpToEventId, highlight: true, scrollTo: false as const }
    : undefined;

  const renderMatrixEvent = useTimelineEventRenderer({
    room,
    mx,
    pushProcessor,
    nicknames,
    getProfile: getGlobalProfile,
    imagePackRooms,
    settings: threadSettings,
    state: { focusItem, editId, activeReplyId, openThreadId: threadRootId, suppressMark },
    permissions: {
      canRedact,
      canDeleteOwn,
      canSendReaction,
      canPinEvent,
    },
    callbacks: {
      onUserClick: actions.handleUserClick,
      onUsernameClick: actions.handleUsernameClick,
      onReplyClick: actions.handleReplyClick,
      onReactionToggle: actions.handleReactionToggle,
      onEditId: actions.handleEdit,
      onResend: actions.handleResend,
      onDeleteFailedSend: actions.handleDeleteFailedSend,
      setOpenThread: () => {},
      handleOpenReply: actions.handleOpenReply,
    },
    utils: { htmlReactParserOptions, linkifyOpts, getMemberPowerTag, parseMemberEvent },
  });

  // Latest thread event for the following indicator (latest reply, or root if no replies)
  const threadParticipantIds = new Set(
    processedEvents.map((e) => e.mEvent.getSender()).filter(Boolean) as string[]
  );
  const latestThreadEventId = processedEvents.at(-1)?.id ?? rootEvent?.getId();

  const [threadSidebarWidth, setThreadSidebarWidth] = useSetting(
    settingsAtom,
    'threadSidebarWidth'
  );
  const [curWidth, setCurWidth] = useState(threadSidebarWidth);
  useEffect(() => {
    setCurWidth(threadSidebarWidth);
  }, [threadSidebarWidth]);

  const [threadRootHeight, setThreadRootHeight] = useSetting(settingsAtom, 'threadRootHeight');
  const [curHeight, setCurHeight] = useState(threadRootHeight);
  useEffect(() => {
    setCurHeight(threadRootHeight);
  }, [threadRootHeight]);
  return (
    <Box
      ref={drawerRef}
      className={overlay ? css.ThreadDrawerOverlay : css.ThreadDrawer}
      direction="Column"
      shrink="No"
      style={{
        position: overlay ? 'absolute' : 'relative',
        isolation: 'isolate',
        width: overlay ? '100%' : toRem(curWidth),
      }}
    >
      {!isMobileOrTablet() && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={threadSidebarWidth}
          setSidebarWidth={setThreadSidebarWidth}
          minValue={250}
          maxValue={600}
          isReversed
        />
      )}
      {/* Header */}
      <Header className={css.ThreadDrawerHeader} variant="Background" size="600">
        <Box grow="Yes" alignItems="Center" gap="200">
          {composerIcon(Chats)}
          <Text size="H4" truncate>
            Thread
          </Text>
        </Box>
        <Box alignItems="Center" gap="200" shrink="No">
          <IconButton
            onClick={onClose}
            variant="SurfaceVariant"
            size="300"
            radii="300"
            aria-label="Close thread"
          >
            {composerIcon(X)}
          </IconButton>
        </Box>
      </Header>

      {/* Thread root message */}
      {rootEvent && (
        <Box className={css.threadRootShell}>
          <Box className={css.threadRootScrollShadow}>
            <Scroll
              variant="Background"
              visibility="Hover"
              direction="Vertical"
              size="300"
              hideTrack
              style={{
                height: toRem(curHeight),
                flexShrink: 0,
              }}
            >
              <Box
                className={css.messageList}
                direction="Column"
                style={{
                  padding: `${config.space.S200} 0 ${config.space.S100} 0`,
                }}
              >
                {renderMatrixEvent(
                  rootEvent.getType(),
                  typeof rootEvent.getStateKey() === 'string',
                  rootEvent.getId()!,
                  rootEvent,
                  processedEvents.find((e) => e.id === threadRootId)?.itemIndex ?? 0,
                  thread?.timelineSet ?? room.getUnfilteredTimelineSet(),
                  false
                )}
              </Box>
            </Scroll>
          </Box>
          <SidebarResizer
            setCurWidth={setCurHeight}
            sidebarWidth={threadRootHeight}
            setSidebarWidth={setThreadRootHeight}
            minValue={60}
            maxValue={700}
            topSided
          />
        </Box>
      )}
      {/* Replies */}
      <Box className={css.ThreadDrawerContent} grow="Yes" direction="Column">
        <Scroll
          ref={scrollRef}
          variant="Background"
          visibility="Hover"
          direction="Vertical"
          size="300"
          onScroll={handleRepliesScroll}
          style={{ flexGrow: 1 }}
        >
          {(() => {
            if (isThreadLoading)
              return (
                <Box
                  direction="Column"
                  alignItems="Center"
                  justifyContent="Center"
                  style={{ padding: config.space.S400 }}
                >
                  <Spinner variant="Secondary" size="400" />
                </Box>
              );
            if (processedReplies.length === 0)
              return (
                <Box
                  direction="Column"
                  alignItems="Center"
                  justifyContent="Center"
                  style={{ padding: config.space.S400, gap: config.space.S200 }}
                >
                  {composerIcon(Chats, { style: { opacity: 0.6 } })}
                  <Text size="T300" align="Center">
                    No replies yet. Start the thread below!
                  </Text>
                </Box>
              );
            return (
              <>
                {loadingOlderReplies && (
                  <Box
                    justifyContent="Center"
                    style={{ padding: config.space.S300, flexShrink: 0 }}
                  >
                    <Spinner variant="Secondary" size="200" />
                  </Box>
                )}
                {/* Reply count label inside scroll area */}
                <Box
                  style={{
                    padding: `${config.space.S200} ${config.space.S400}`,
                    flexShrink: 0,
                  }}
                >
                  <Text size="T300" priority="300">
                    {processedReplies.length} {processedReplies.length === 1 ? 'reply' : 'replies'}
                  </Text>
                </Box>
                <Box
                  className={css.messageList}
                  direction="Column"
                  style={{ padding: `0 0 ${config.space.S600} 0` }}
                >
                  {processedReplies.map((e) =>
                    renderMatrixEvent(
                      e.mEvent.getType(),
                      typeof e.mEvent.getStateKey() === 'string',
                      e.id,
                      e.mEvent,
                      e.itemIndex,
                      e.timelineSet,
                      e.collapsed
                    )
                  )}
                </Box>
              </>
            );
          })()}
        </Scroll>
      </Box>

      {/* Thread input */}
      <Box className={css.ThreadDrawerInput} direction="Column" shrink="No">
        <div style={{ padding: `0 ${config.space.S400}` }}>
          <RoomInput
            key={threadRootId}
            room={room}
            roomId={room.roomId}
            threadRootId={threadRootId}
            editor={editor}
            fileDropContainerRef={drawerRef}
            onEditLastMessage={handleEditLastMessage}
          />
        </div>
        {hideReads ? (
          <RoomViewFollowingPlaceholder />
        ) : (
          <RoomViewFollowing
            room={room}
            threadEventId={latestThreadEventId}
            participantIds={threadParticipantIds}
          />
        )}
      </Box>
    </Box>
  );
}
