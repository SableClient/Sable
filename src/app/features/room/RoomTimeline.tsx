import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from 'slate';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { PushProcessor, Direction } from '$types/matrix-sdk';
import type { VListHandle } from 'virtua';
import { Chip, Icon, Icons, Text } from 'folds';
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
import { settingsAtom } from '$state/settings';
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
  getProcessedRowIndexForRawTimelineIndex,
  useProcessedTimeline,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import { useTimelineEventRenderer } from '$hooks/timeline/useTimelineEventRenderer';
import { TimelinePaginationStatusRow } from './TimelinePaginationStatus';
import { TimelineFloat, TimelineViewport } from './TimelineViewport';
import { useTimelineViewportController } from './useTimelineViewportController';

const TIMELINE_BUFFER_SIZE_PX = 160;

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

  useEffect(() => {
    if (eventId) return;
    setUnreadInfo((prev) => {
      if (!prev?.scrollTo) return prev;
      return { ...prev, scrollTo: false };
    });
  }, [room.roomId, eventId]);

  const processedEventsRef = useRef<ProcessedEvent[]>([]);
  const processedIndexByRawIndexRef = useRef<Map<number, number>>(new Map());
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

  const getRawIndexToProcessedIndex = useCallback((rawIndex: number): number | undefined => {
    return processedIndexByRawIndexRef.current.get(rawIndex);
  }, []);

  const vListItemCount = timelineSync.eventsLength;
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
  processedIndexByRawIndexRef.current = new Map(
    processedEvents.map((event, index) => [event.itemIndex, index])
  );

  const {
    shift,
    topSpacerHeight,
    isReady,
    beginJumpLoad,
    settleTimelineAnchor,
    handleVListScroll,
    markUserScrollIntent,
  } = useTimelineViewportController({
    roomId: room.roomId,
    eventId,
    timelineSync,
    timelineSyncRef,
    vListRef,
    messageListRef,
    processedEventsRef,
    atBottomRef,
    setAtBottom,
    getRawIndexToProcessedIndex,
  });

  const showLoadingPlaceholders = !isReady && timelineSync.eventsLength === 0;
  const hideInlineBackPagination =
    topSpacerHeight > 0 && atBottomState && timelineSync.backwardStatus === 'loading';

  const vListData = useMemo<Array<ProcessedEvent | undefined>>(() => {
    if (showLoadingPlaceholders) return [];
    if (isReady && processedEvents.length === 0) return [undefined];
    return processedEvents;
  }, [isReady, processedEvents, showLoadingPlaceholders]);

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
          const focusEventId = processedEventsRef.current[processedIndex]?.id;
          if (focusEventId) {
            settleTimelineAnchor({ kind: 'message-center', eventId: focusEventId });
          }
        }
        timelineSync.setFocusItem({ index: focusRawIndex, scrollTo: false, highlight: true });
      } else {
        beginJumpLoad(anchorId);
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

  let backPaginationJSX: ReactNode | undefined;
  if (timelineSync.canPaginateBack || timelineSync.backwardStatus !== 'idle') {
    backPaginationJSX = (
      <TimelinePaginationStatusRow
        direction="backward"
        eventsLength={timelineSync.eventsLength}
        hasMore={timelineSync.canPaginateBack}
        status={timelineSync.backwardStatus}
        onRetry={() => timelineSync.handleTimelinePagination(true)}
        hidden={hideInlineBackPagination}
      />
    );
  }

  let frontPaginationJSX: ReactNode | undefined;
  if (!timelineSync.liveTimelineLinked || timelineSync.forwardStatus !== 'idle') {
    frontPaginationJSX = (
      <TimelinePaginationStatusRow
        direction="forward"
        eventsLength={timelineSync.eventsLength}
        hasMore={!timelineSync.liveTimelineLinked}
        status={timelineSync.forwardStatus}
        onRetry={() => timelineSync.handleTimelinePagination(false)}
      />
    );
  }

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

  const unreadBanner =
    unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady ? (
      <TimelineFloat position="Top">
        <Chip
          variant="Primary"
          radii="Pill"
          outlined
          before={<Icon size="50" src={Icons.MessageUnread} />}
          onClick={() => beginJumpLoad(unreadInfo.readUptoEventId)}
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
    ) : undefined;

  return (
    <TimelineViewport
      room={room}
      isReady={isReady}
      atBottom={atBottomState}
      unreadBanner={unreadBanner}
      messageListRef={messageListRef}
      vListRef={vListRef}
      data={vListData}
      bufferSize={TIMELINE_BUFFER_SIZE_PX}
      shift={shift}
      topSpacerHeight={topSpacerHeight}
      messageLayout={messageLayout}
      messageSpacing={messageSpacing}
      canPaginateBack={timelineSync.canPaginateBack}
      backPagination={backPaginationJSX}
      frontPagination={frontPaginationJSX}
      onScroll={handleVListScroll}
      onUserScrollIntent={markUserScrollIntent}
      onJumpLatest={() => {
        if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
        timelineSync.setTimeline(getInitialTimeline(room));
        settleTimelineAnchor({ kind: 'bottom' });
      }}
      renderMatrixEvent={renderMatrixEvent}
    />
  );
}
