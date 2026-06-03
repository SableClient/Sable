import type { MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Header, Icon, IconButton, Icons, Scroll, Spinner, Text, config, toRem } from 'folds';
import type { IEvent, Room } from '$types/matrix-sdk';
import {
  Direction,
  MatrixEvent,
  PushProcessor,
  ReceiptType,
  RelationType,
  RoomEvent,
  ThreadEvent,
  EventType,
} from '$types/matrix-sdk';
import { useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { ReactEditor } from 'slate-react';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import {
  getEditedEvent,
  getMemberDisplayName,
  isThreadRelationEvent,
  reactionOrEditEvent,
  unwrapRelationJumpTarget,
} from '$utils/room';
import { getMxIdLocalPart, toggleReaction } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { nicknamesAtom } from '$state/nicknames';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import { buildAbbrReplaceTextNode } from '$components/message/RenderBody';
import { createMentionElement, moveCursor, useEditor } from '$components/editor';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';

import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import type { IReplyDraft } from '$state/room/roomInputDrafts';
import {
  roomIdToReplyDraftAtomFamily,
  roomIdToEditDraftAtomFamily,
} from '$state/room/roomInputDrafts';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import { useMemberEventParser } from '$hooks/useMemberEventParser';
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
import { mobileOrTablet } from '$utils/user-agent';

/**
 * Resolve the list of reply events to show in the thread drawer.
 *
 * Prefers events from the SDK Thread object (authoritative, full history) but
 * falls back to scanning the main room timeline when the Thread object was
 * created without `initialEvents` (as happens with classic sync).  In that
 * case `thread.events` contains only the root event, so filtering it yields an
 * empty array — we must fall back rather than showing nothing.
 *
 * Exported for unit testing.
 */
export function getThreadReplyEvents(room: Room, threadRootId: string): MatrixEvent[] {
  const thread = room.getThread(threadRootId);
  const fromThread = thread?.events ?? [];
  const filteredFromThread = fromThread.filter(
    (ev) =>
      ev.getId() !== threadRootId &&
      !reactionOrEditEvent(ev) &&
      isThreadRelationEvent(ev, threadRootId)
  );

  Sentry.addBreadcrumb({
    category: 'thread',
    message: 'getThreadReplyEvents called',
    level: 'debug',
    data: {
      threadRootId,
      threadEventsTotal: fromThread.length,
      filteredFromThread: filteredFromThread.length,
      threadExists: !!thread,
      threadInitialized: thread?.initialEventsFetched ?? false,
    },
  });

  if (filteredFromThread.length > 0) {
    Sentry.addBreadcrumb({
      category: 'thread',
      message: 'Returning events from thread.events',
      level: 'debug',
      data: {
        threadRootId,
        count: filteredFromThread.length,
        eventIds: filteredFromThread.map((e) => e.getId()).filter(Boolean),
      },
    });
    return filteredFromThread;
  }

  const fallbackEvents = room
    .getUnfilteredTimelineSet()
    .getLiveTimeline()
    .getEvents()
    .filter(
      (ev) =>
        ev.getId() !== threadRootId &&
        !reactionOrEditEvent(ev) &&
        isThreadRelationEvent(ev, threadRootId)
    );

  Sentry.addBreadcrumb({
    category: 'thread',
    message: 'Returning fallback events from main timeline',
    level: 'debug',
    data: {
      threadRootId,
      count: fallbackEvents.length,
      eventIds: fallbackEvents.map((e) => e.getId()).filter(Boolean),
    },
  });

  return fallbackEvents;
}

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
  const [editInInput] = useSetting(settingsAtom, 'editInInput');
  const setEditDraft = useSetAtom(roomIdToEditDraftAtomFamily(threadRootId));
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
  const nicknames = useAtomValue(nicknamesAtom);
  const pushProcessor = useMemo(() => new PushProcessor(mx), [mx]);
  const useAuthentication = useMediaAuthentication();
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const spoilerClickHandler = useSpoilerClickHandler();

  // Settings
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [clientUrlPreview] = useSetting(settingsAtom, 'clientUrlPreview');
  const [encClientUrlPreview] = useSetting(settingsAtom, 'encClientUrlPreview');
  const [autoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');
  const [autoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [messageGroupingThreshold] = useSetting(settingsAtom, 'messageGroupingThreshold');
  const [showTombstoneEvents] = useSetting(settingsAtom, 'showTombstoneEvents');
  const [hideMemberInReadOnly] = useSetting(settingsAtom, 'hideMembershipInReadOnly');
  const [showBundledPreview] = useSetting(settingsAtom, 'bundledPreview');
  const showUrlPreview = room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview;
  const showClientUrlPreview = room.hasEncryptionStateEvent()
    ? clientUrlPreview && encClientUrlPreview
    : clientUrlPreview;

  // Memoized parsing options
  const linkifyOpts = useMemo<LinkifyOpts>(
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
    [mx, room, mentionClickHandler, nicknames, settingsLinkBaseUrl]
  );

  const abbrMap = useRoomAbbreviationsContext();

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        nicknames,
        autoplayEmojis,
        replaceTextNode: buildAbbrReplaceTextNode(abbrMap, linkifyOpts),
      }),
    [
      mx,
      room,
      linkifyOpts,
      spoilerClickHandler,
      mentionClickHandler,
      useAuthentication,
      nicknames,
      settingsLinkBaseUrl,
      autoplayEmojis,
      abbrMap,
    ]
  );

  // Power levels & permissions
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(EventType.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(EventType.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent(EventType.RoomPinnedEvents, mx.getSafeUserId());
  const isReadOnly = useMemo(() => {
    const myPowerLevel = powerLevels?.users?.[mx.getUserId()!] ?? powerLevels?.users_default ?? 0;
    const sendLevel = powerLevels?.events?.['m.room.message'] ?? powerLevels?.events_default ?? 0;
    return myPowerLevel < sendLevel;
  }, [powerLevels, mx]);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
  const parseMemberEvent = useMemberEventParser();

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
  // Keep a ref so handleReplyClick can read the latest draft without being
  // recreated on every keystroke (which would re-render all Message instances).
  const replyDraftRef = useRef(replyDraft);
  replyDraftRef.current = replyDraft;

  // User profile popup
  const openUserRoomProfile = useOpenUserRoomProfile();

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
    showHiddenEvents,
    showTombstoneEvents,
    mxUserId: mx.getUserId(),
    readUptoEventId: undefined,
    hideMembershipEvents: true,
    hideNickAvatarEvents: true,
    isReadOnly,
    hideMemberInReadOnly,
    messageGroupingThreshold,
  });

  // When the thread's own timeline is empty (server-side threads not yet fetched,
  // or classic sync before backfill completes), fall back to scanning the main
  // room timeline directly so replies are shown immediately.
  const displayReplies = useMemo((): ProcessedEvent[] => {
    // `forceUpdateCounter` is a cache-busting key for thread/timeline updates.
    void forceUpdateCounter;
    const filtered = processedEvents.filter((e) => e.id !== threadRootId);

    Sentry.addBreadcrumb({
      category: 'thread',
      message: 'Computing displayReplies',
      level: 'debug',
      data: {
        threadRootId,
        forceUpdateCounter,
        processedEventsCount: processedEvents.length,
        filteredCount: filtered.length,
        threadEventsCount: thread?.events.length ?? 0,
        threadInitialized: thread?.initialEventsFetched ?? false,
      },
    });

    if (filtered.length > 0) {
      Sentry.addBreadcrumb({
        category: 'thread',
        message: 'Using processedEvents for display',
        level: 'debug',
        data: { threadRootId, count: filtered.length },
      });
      return filtered;
    }

    const timelineSet = thread?.timelineSet ?? room.getUnfilteredTimelineSet();
    const fallbackEvents = getThreadReplyEvents(room, threadRootId);

    Sentry.addBreadcrumb({
      category: 'thread',
      message: 'Using fallback getThreadReplyEvents',
      level: 'debug',
      data: { threadRootId, count: fallbackEvents.length },
    });

    return fallbackEvents.map((ev, idx) => ({
      id: ev.getId() ?? `thread-reply-${idx}`,
      itemIndex: idx,
      mEvent: ev,
      timelineSet,
      eventSender: ev.getSender() ?? null,
      collapsed: false,
      willRenderNewDivider: false,
      willRenderDayDivider: false,
    }));
    // forceUpdateCounter makes this recompute whenever events arrive
  }, [room, threadRootId, thread, processedEvents, forceUpdateCounter]);

  processedEventsRef.current = displayReplies;

  const processedReplies = displayReplies;

  // Track thread initialization state to trigger backfill when ready.
  // Using a separate variable avoids running the entire init effect on every event update.
  const threadInitialized = thread?.initialEventsFetched ?? false;

  // Ensure the Thread object exists and has its reply events loaded.
  useEffect(() => {
    // Case A: create thread shell; SDK handles the rest asynchronously.
    if (!room.getThread(threadRootId)) {
      const localRoot = room.findEventById(threadRootId);
      if (localRoot) {
        room.createThread(threadRootId, localRoot, [], false);
        // Don't continue - wait for SDK to initialize the thread
        return;
      }
      // Root not in local timeline — fetch it from the server without
      // touching the main timeline (no TimelineRefresh side-effect).
      mx.fetchRoomEvent(room.roomId, threadRootId)
        .then((rawEvt) => {
          if (room.getThread(threadRootId)) return; // created concurrently
          room.createThread(threadRootId, new MatrixEvent(rawEvt as IEvent), [], false);
          // Force update to re-run this effect once thread is created
          forceUpdate((n) => n + 1);
        })
        .catch(() => {});
      return;
    }

    const currThread = room.getThread(threadRootId);
    // Case B: SDK is actively initialising — don't interfere.
    if (!currThread || !threadInitialized) return;

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

    const liveEvents = room
      .getUnfilteredTimelineSet()
      .getLiveTimeline()
      .getEvents()
      .filter(
        (ev) =>
          ev.getId() !== threadRootId &&
          !reactionOrEditEvent(ev) &&
          isThreadRelationEvent(ev, threadRootId)
      );
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
    // threadInitialized changes when initialEventsFetched becomes true,
    // triggering this effect to run backfill logic without running on every event.
  }, [mx, room, threadRootId, forceUpdate, threadInitialized]);

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
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Timeline event detected in thread',
          level: 'debug',
          data: {
            threadRootId,
            eventId: mEvent.getId(),
            eventType: mEvent.getType(),
            sender: mEvent.getSender(),
          },
        });

        // Manually add the event to the thread timeline if it's not already there.
        // The SDK should do this automatically, but with sliding sync there may be timing issues.
        const currentThread = room.getThread(threadRootId);
        if (currentThread && currentThread.initialEventsFetched) {
          const eventId = mEvent.getId();
          const existsInThread = currentThread.events.some((e) => e.getId() === eventId);
          if (!existsInThread && isThreadRelationEvent(mEvent, threadRootId)) {
            Sentry.addBreadcrumb({
              category: 'thread',
              message: 'Manually adding event to thread timeline',
              level: 'info',
              data: { threadRootId, eventId },
            });
            currentThread.addEvents([mEvent], false);
          }
        }

        // Schedule forceUpdate in a microtask to ensure the SDK has finished
        // adding the event to the thread timeline before we re-render.
        Promise.resolve().then(() => {
          Sentry.addBreadcrumb({
            category: 'thread',
            message: 'Force update after timeline event',
            level: 'debug',
            data: {
              threadRootId,
              eventId: mEvent.getId(),
              threadEventsCount: currentThread?.events.length ?? 0,
            },
          });
          forceUpdate((n) => n + 1);
        });
      }
    };
    const onRedaction = (mEvent: MatrixEvent) => {
      // Redactions (removing reactions/messages) should also trigger updates
      if (isEventInThread(mEvent)) {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Redaction event in thread',
          level: 'debug',
          data: {
            threadRootId,
            eventId: mEvent.getId(),
          },
        });
        Promise.resolve().then(() => forceUpdate((n) => n + 1));
      }
    };
    const onThreadUpdate = () => {
      const currentThread = room.getThread(threadRootId);
      Sentry.addBreadcrumb({
        category: 'thread',
        message: 'ThreadEvent.Update or NewReply fired',
        level: 'debug',
        data: {
          threadRootId,
          threadEventsCount: currentThread?.events.length ?? 0,
          initialEventsFetched: currentThread?.initialEventsFetched ?? false,
        },
      });
      // Thread metadata updates (reply count, participants) should also wait
      // for SDK to finish processing before re-rendering.
      Promise.resolve().then(() => {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Force update after thread metadata update',
          level: 'debug',
          data: { threadRootId },
        });
        forceUpdate((n) => n + 1);
      });
    };
    mx.on(RoomEvent.Timeline, onTimeline);
    room.on(RoomEvent.Redaction, onRedaction);
    room.on(ThreadEvent.Update, onThreadUpdate);
    room.on(ThreadEvent.NewReply, onThreadUpdate);
    return () => {
      mx.off(RoomEvent.Timeline, onTimeline);
      room.removeListener(RoomEvent.Redaction, onRedaction);
      room.removeListener(ThreadEvent.Update, onThreadUpdate);
      room.removeListener(ThreadEvent.NewReply, onThreadUpdate);
    };
  }, [mx, room, threadRootId]);

  // Listen directly on the thread for timeline and reset events.
  // This provides a shorter, more reliable signal path than the
  // timelineSet → thread → room → mx re-emission chain, and also
  // catches RoomEvent.TimelineReset (fired when the thread timeline
  // is cleared and re-populated during initialisation).
  useEffect(() => {
    if (!thread) return () => {};
    const onDirectTimelineUpdate = (event?: MatrixEvent) => {
      Sentry.addBreadcrumb({
        category: 'thread',
        message: 'Direct thread timeline event',
        level: 'debug',
        data: {
          threadRootId,
          eventId: event?.getId(),
          eventType: event?.getType(),
          threadEventsCount: thread.events.length,
        },
      });
      Sentry.metrics.count('sable.thread.direct_timeline_event', 1, {
        attributes: { threadId: threadRootId },
      });
      // Microtask delay to ensure SDK finishes processing before re-render
      Promise.resolve().then(() => {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Force update after direct thread event',
          level: 'debug',
          data: { threadRootId, eventId: event?.getId() },
        });
        forceUpdate((n) => n + 1);
      });
    };
    const onDirectTimelineReset = () => {
      Sentry.addBreadcrumb({
        category: 'thread',
        message: 'Direct thread timeline reset',
        level: 'info',
        data: { threadRootId, threadEventsCount: thread.events.length },
      });
      Promise.resolve().then(() => {
        forceUpdate((n) => n + 1);
      });
    };
    thread.on(RoomEvent.Timeline, onDirectTimelineUpdate);
    thread.on(RoomEvent.TimelineReset, onDirectTimelineReset);
    return () => {
      thread.off(RoomEvent.Timeline, onDirectTimelineUpdate);
      thread.off(RoomEvent.TimelineReset, onDirectTimelineReset);
    };
  }, [thread, threadRootId]);

  // Mark thread as read when viewing it
  useEffect(() => {
    const markThreadAsRead = async () => {
      const currentThread = room.getThread(threadRootId);
      if (!currentThread) {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Cannot mark as read: thread not found',
          level: 'warning',
          data: { threadRootId, roomId: room.roomId },
        });
        return;
      }

      // Use displayReplies instead of currentThread.events because displayReplies
      // includes the fallback path (scanning main timeline) when thread.events is empty.
      // This ensures we mark as read even when the SDK thread object hasn't been
      // populated yet but we're still showing replies from the main timeline.
      if (displayReplies.length === 0) {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Cannot mark as read: no visible replies',
          level: 'debug',
          data: {
            threadRootId,
            threadEventsCount: currentThread.events.length,
            displayRepliesCount: displayReplies.length,
          },
        });
        return;
      }

      // Get the last visible reply event
      const lastDisplayReply = displayReplies[displayReplies.length - 1];
      const lastEvent = lastDisplayReply?.mEvent;

      if (!lastEvent || lastEvent.isSending()) {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Cannot mark as read: last event invalid or sending',
          level: 'debug',
          data: {
            hasLastEvent: !!lastEvent,
            isSending: lastEvent?.isSending(),
          },
        });
        return;
      }

      const userId = mx.getUserId();
      if (!userId) return;

      const readUpToId = currentThread.getEventReadUpTo(userId, false);
      const lastEventId = lastEvent.getId();
      if (!lastEventId) return;

      // Only send receipt if we haven't already read up to the last event
      if (readUpToId !== lastEventId) {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Sending thread read receipts',
          level: 'info',
          data: {
            threadRootId,
            lastEventId,
            readUpToId,
            displayRepliesCount: displayReplies.length,
          },
        });
        try {
          // Send both read receipt AND read marker to ensure room-level unread badge clears.
          // Thread replies are part of the main room timeline, so we need to update both
          // the thread-specific receipt and the room-level marker.
          await Promise.all([
            mx.sendReadReceipt(lastEvent, ReceiptType.Read),
            mx.setRoomReadMarkers(room.roomId, lastEventId, lastEvent),
          ]);
          Sentry.addBreadcrumb({
            category: 'thread',
            message: 'Thread read receipts sent successfully',
            level: 'info',
            data: { threadRootId, lastEventId },
          });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: 'ThreadDrawer', operation: 'sendReadReceipt' },
            contexts: {
              thread: {
                threadRootId,
                lastEventId,
                readUpToId,
                displayRepliesCount: displayReplies.length,
              },
            },
          });
        }
      } else {
        Sentry.addBreadcrumb({
          category: 'thread',
          message: 'Already read up to latest event',
          level: 'debug',
          data: { threadRootId, lastEventId, readUpToId },
        });
      }
    };

    // Mark as read when opened and when new messages arrive
    markThreadAsRead();
  }, [mx, room, threadRootId, forceUpdateCounter, displayReplies]);

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

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      if (!evt.currentTarget) return;
      evt.preventDefault();
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;
      openUserRoomProfile(
        room.roomId,
        undefined,
        userId,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [room, openUserRoomProfile]
  );

  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;
      const localNicknames = undefined; // will be resolved via getMemberDisplayName in editor
      const name =
        getMemberDisplayName(room, userId, localNicknames) ?? getMxIdLocalPart(userId) ?? userId;
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
    [mx, room, editor]
  );

  const handleReplyClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) {
        // In thread mode, resetting means going back to base thread draft
        setReplyDraft({
          userId: mx.getUserId() ?? '',
          eventId: threadRootId,
          body: '',
          relation: { rel_type: RelationType.Thread, event_id: threadRootId },
        });
        return;
      }
      const replyEvt = room.findEventById(replyId);
      if (!replyEvt) return;
      const editedReply = getEditedEvent(replyId, replyEvt, room.getUnfilteredTimelineSet());
      const content = editedReply?.getContent()['m.new_content'] ?? replyEvt.getContent();
      const { body, formatted_body: formattedBody } = content;
      const senderId = replyEvt.getSender();
      if (senderId) {
        const draft: IReplyDraft = {
          userId: senderId,
          eventId: replyId,
          body: typeof body === 'string' ? body : '',
          formattedBody,
          relation: { rel_type: RelationType.Thread, event_id: threadRootId },
        };
        // Only toggle off if we're actively replying to this event (non-empty body distinguishes
        // a real reply draft from the seeded base-thread draft, which has body: '').
        if (activeReplyId === replyId && replyDraftRef.current?.body) {
          // Toggle off — reset to base thread draft
          setReplyDraft({
            userId: mx.getUserId() ?? '',
            eventId: threadRootId,
            body: '',
            relation: { rel_type: RelationType.Thread, event_id: threadRootId },
          });
        } else {
          setReplyDraft(draft);
        }
      }
    },
    [mx, room, setReplyDraft, activeReplyId, threadRootId]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) => {
      const threadTimelineSet = room.getThread(threadRootId)?.timelineSet;
      toggleReaction(mx, room, targetEventId, key, shortcode, threadTimelineSet);
    },
    [mx, room, threadRootId]
  );

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

  const handleResend = useCallback(
    (event: MatrixEvent) => {
      mx.resendEvent(event, room);
    },
    [mx, room]
  );

  const handleDeleteFailedSend = useCallback(
    (event: MatrixEvent) => {
      mx.cancelPendingEvent(event);
    },
    [mx]
  );

  const handleOpenReply: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const targetId = evt.currentTarget.getAttribute('data-event-id');
      if (!targetId) return;
      let anchorId = unwrapRelationJumpTarget(room, targetId);
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
    [threadRootId, room, thread]
  );

  // Map jumpToEventId to a focusItem index for useTimelineEventRenderer highlighting
  const jumpIndex = jumpToEventId ? processedEvents.findIndex((e) => e.id === jumpToEventId) : -1;
  const focusItem =
    jumpIndex >= 0 && processedEvents[jumpIndex]
      ? {
          index: processedEvents[jumpIndex].itemIndex,
          highlight: true,
          scrollTo: false as const,
        }
      : undefined;

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
      showUrlPreview,
      showClientUrlPreview,
      showBundledPreview,
      autoplayStickers,
      hideMemberInReadOnly,
      isReadOnly,
      hideMembershipEvents: true,
      hideNickAvatarEvents: true,
      showHiddenEvents,
      hideThreadChip: true,
    },
    state: {
      focusItem,
      editId: editInInput ? undefined : editId,
      activeReplyId,
      openThreadId: threadRootId,
    },
    permissions: {
      canRedact,
      canDeleteOwn,
      canSendReaction,
      canPinEvent,
    },
    callbacks: {
      onUserClick: handleUserClick,
      onUsernameClick: handleUsernameClick,
      onReplyClick: handleReplyClick,
      onReactionToggle: handleReactionToggle,
      onEditId: handleEditCallback,
      onResend: handleResend,
      onDeleteFailedSend: handleDeleteFailedSend,
      setOpenThread: () => {},
      handleOpenReply,
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
      className={overlay ? css.ThreadDrawerOverlay : css.ThreadDrawer}
      direction="Column"
      shrink="No"
      style={{
        position: 'relative',
        width: overlay ? '100%' : toRem(curWidth),
      }}
    >
      {!mobileOrTablet() && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={threadSidebarWidth}
          setSidebarWidth={setThreadSidebarWidth}
          minValue={150}
          maxValue={600}
          isReversed
        />
      )}
      {/* Header */}
      <Header className={css.ThreadDrawerHeader} variant="Background" size="600">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Thread} />
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
            <Icon size="200" src={Icons.Cross} />
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
                maxHeight: toRem(curHeight),
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
                  <Icon size="400" src={Icons.Thread} />
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
