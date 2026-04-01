import type { MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Line, Scroll, Text, color, config } from 'folds';
import { useAtom, useAtomValue } from 'jotai';
import type { EventTimeline, MatrixEvent, Room } from 'matrix-js-sdk';
import { Direction, EventType, RoomEvent } from 'matrix-js-sdk';
import { type RoomEventHandlerMap } from 'matrix-js-sdk/lib/models/room';
import type { Thread } from 'matrix-js-sdk/lib/models/thread';
import { ThreadEvent } from 'matrix-js-sdk/lib/models/thread';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { useRoom } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { Page, PageContent, PageContentCenter, PageHeroSection } from '$components/page';
import { CaretUp, Chats, composerIcon, sizedIcon } from '$components/icons/phosphor';
import { MembersDrawer } from '$features/room/MembersDrawer';
import { ThreadDrawer, getThreadReplyEvents } from '$features/room/ThreadDrawer';
import { useSetting } from '$state/hooks/settings';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { settingsAtom } from '$state/settings';
import { ForumHeader } from './ForumHeader';
import { ForumHero } from './ForumHero';
import { ForumThreadItem } from './ForumThreadItem';
import { ScrollTopContainer } from '$components/scroll-top-container';
import { PowerLevelsContextProvider, usePowerLevels } from '$hooks/usePowerLevels';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomMembers } from '$hooks/useRoomMembers';
import { reactionOrEditEvent } from '$utils/room';
import { mxcUrlToHttp, toggleReaction } from '$utils/matrix';
import { useStateEvent } from '$hooks/useStateEvent';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useEditor } from '$components/editor';
import { RoomInputPlaceholder } from '$features/room/RoomInputPlaceholder';
import { RoomTombstone } from '$features/room/RoomTombstone';
import { RoomInput } from '$features/room/RoomInput';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { CustomStateEvent } from '$types/matrix/room';
import type { RoomBannerContent } from '$types/matrix-sdk-events';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';

type ForumPost = {
  eventId: string;
  mEvent: MatrixEvent;
  thread?: Thread;
  ts: number;
};

/**
 * Collect all top-level messages (not thread replies, not reactions/edits/redacted)
 * and return them as ForumPost items, sorted by latest activity descending.
 */
const collectForumPosts = (room: Room): ForumPost[] => {
  const threadMap = new Map<string, Thread>();
  room.getThreads().forEach((thread) => {
    threadMap.set(thread.id, thread);
  });

  const posts = new Map<string, ForumPost>();

  // Add all thread roots (even if not in the visible timeline)
  threadMap.forEach((thread, threadId) => {
    const { rootEvent } = thread;
    if (!rootEvent) return;
    // Skip redacted root messages with no visible replies
    if (rootEvent.isRedacted()) {
      const replies = getThreadReplyEvents(room, threadId);
      if (replies.length === 0) return;
    }
    const lastTs = thread.events.at(-1)?.getTs() ?? rootEvent.getTs();
    posts.set(threadId, {
      eventId: threadId,
      mEvent: rootEvent,
      thread,
      ts: lastTs,
    });
  });

  // Add top-level timeline messages that are NOT thread replies
  const timeline = room.getLiveTimeline();
  timeline.getEvents().forEach((ev) => {
    const evId = ev.getId();
    if (!evId) return;
    if (posts.has(evId)) return; // already added as thread root
    if (ev.isRedacted()) return;
    if (reactionOrEditEvent(ev)) return;
    // Skip actual thread replies (rel_type: m.thread), but keep plain replies
    // that just reference a thread root via m.in_reply_to
    if (ev.getRelation()?.rel_type === 'm.thread') return;
    if (ev.isState()) return; // skip state events
    if (!ev.getContent()?.msgtype) return; // not a displayable message

    posts.set(evId, {
      eventId: evId,
      mEvent: ev,
      thread: undefined,
      ts: ev.getTs(),
    });
  });

  // Sort by latest activity descending
  return Array.from(posts.values()).toSorted((a, b) => b.ts - a.ts);
};

export function ForumView() {
  const mx = useMatrixClient();
  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const members = useRoomMembers(mx, room.roomId);

  const useAuthentication = useMediaAuthentication();
  const bannerState = useStateEvent(room, CustomStateEvent.RoomBanner);
  const bannerMxc = bannerState?.getContent<RoomBannerContent>()?.url;
  const bannerUrl = bannerMxc
    ? (mxcUrlToHttp(mx, bannerMxc, useAuthentication) ?? undefined)
    : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null);
  const heroSectionRef = useRef<HTMLDivElement>(null);
  const editor = useEditor();
  const [isDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const screenSize = useScreenSizeContext();
  const [onTop, setOnTop] = useState(true);

  const [openThreadId, setOpenThread] = useAtom(roomIdToOpenThreadAtomFamily(room.roomId));
  const [updateKey, forceUpdate] = useState(0);
  const [editId, setEditId] = useState<string | undefined>(undefined);

  // Settings
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');

  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) =>
          renderMatrixMention(mx, room.roomId, href, makeMentionCustomProps(mentionClickHandler)),
        mentionClickHandler
      ),
    }),
    [mx, room, mentionClickHandler, settingsLinkBaseUrl]
  );

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [
      mx,
      room,
      settingsLinkBaseUrl,
      linkifyOpts,
      spoilerClickHandler,
      mentionClickHandler,
      useAuthentication,
    ]
  );

  // Power levels & permissions
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(EventType.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(EventType.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent('m.room.pinned_events', mx.getSafeUserId());
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());
  const tombstoneEvent = useStateEvent(room, EventType.RoomTombstone);

  // Image packs
  const roomToParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms: Room[] = useImagePackRooms(room.roomId, roomToParents);

  // User profile popup
  const openUserRoomProfile = useOpenUserRoomProfile();

  // Fetch threads from server on mount (same as RoomViewHeader does)
  useEffect(() => {
    const scanTimelineForThreads = (timeline: EventTimeline) => {
      const events = timeline.getEvents();
      const threadRoots = new Set<string>();

      events.forEach((event: MatrixEvent) => {
        if (event.isThreadRoot) {
          const rootId = event.getId();
          if (rootId && !room.getThread(rootId)) {
            threadRoots.add(rootId);
          }
        }

        const { threadRootId } = event;
        if (threadRootId && !room.getThread(threadRootId)) {
          threadRoots.add(threadRootId);
        }
      });

      threadRoots.forEach((rootId) => {
        const rootEvent = room.findEventById(rootId);
        if (rootEvent) {
          room.createThread(rootId, rootEvent, [], false);
        }
      });
    };

    const liveTimeline = room.getLiveTimeline();
    scanTimelineForThreads(liveTimeline);

    let backwardTimeline = liveTimeline.getNeighbouringTimeline(Direction.Backward);
    while (backwardTimeline) {
      scanTimelineForThreads(backwardTimeline);
      backwardTimeline = backwardTimeline.getNeighbouringTimeline(Direction.Backward);
    }

    // Initialize thread timeline sets then fetch threads from server
    room
      .createThreadsTimelineSets()
      .then(() => room.fetchRoomThreads())
      .then(() => {
        forceUpdate((n) => n + 1);
      })
      .catch(() => {
        // Silently ignore — server may not support threads
      });
  }, [room]);

  // Re-render when threads or timeline change
  useEffect(() => {
    const createdThreads = new Set<string>();
    const onThreadNew: RoomEventHandlerMap[ThreadEvent.New] = () => {
      forceUpdate((n) => n + 1);
    };
    const onThreadUpdate: RoomEventHandlerMap[ThreadEvent.Update] = () => {
      forceUpdate((n) => n + 1);
    };
    const onThreadReply: RoomEventHandlerMap[ThreadEvent.NewReply] = () => {
      forceUpdate((n) => n + 1);
    };
    const onTimeline: RoomEventHandlerMap[RoomEvent.Timeline] = (mEvent) => {
      if (mEvent.isThreadRoot) {
        const rootId = mEvent.getId();
        if (rootId && !room.getThread(rootId) && !createdThreads.has(rootId)) {
          const rootEvent = room.findEventById(rootId);
          if (rootEvent) {
            createdThreads.add(rootId);
            room.createThread(rootId, rootEvent, [], false);
          }
        }
        forceUpdate((n) => n + 1);
        return;
      }

      const { threadRootId } = mEvent;
      if (threadRootId) {
        if (!room.getThread(threadRootId) && !createdThreads.has(threadRootId)) {
          const rootEvent = room.findEventById(threadRootId);
          if (rootEvent) {
            createdThreads.add(threadRootId);
            room.createThread(threadRootId, rootEvent, [], false);
          }
        }
        forceUpdate((n) => n + 1);
        return;
      }
      if (mEvent.isState()) return;
      if (reactionOrEditEvent(mEvent)) return;
      if (!mEvent.getContent()?.msgtype) return;
      forceUpdate((n) => n + 1);
    };
    const onRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (mEvent) => {
      if (mEvent.threadRootId || mEvent.isThreadRoot) {
        forceUpdate((n) => n + 1);
        return;
      }
      forceUpdate((n) => n + 1);
    };

    const onUnreadNotifications = () => forceUpdate((n) => n + 1);

    room.on(RoomEvent.Timeline, onTimeline);
    room.on(RoomEvent.Redaction, onRedaction);
    room.on(RoomEvent.UnreadNotifications, onUnreadNotifications);
    room.on(ThreadEvent.New, onThreadNew);
    room.on(ThreadEvent.Update, onThreadUpdate);
    room.on(ThreadEvent.NewReply, onThreadReply);
    const cleanup = () => {
      room.removeListener(RoomEvent.Timeline, onTimeline);
      room.removeListener(RoomEvent.Redaction, onRedaction);
      room.removeListener(RoomEvent.UnreadNotifications, onUnreadNotifications);
      room.removeListener(ThreadEvent.New, onThreadNew);
      room.removeListener(ThreadEvent.Update, onThreadUpdate);
      room.removeListener(ThreadEvent.NewReply, onThreadReply);
    };

    return cleanup;
  }, [room]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const posts = useMemo(() => collectForumPosts(room), [room, updateKey]);

  const handleOpenThread = useCallback(
    (eventId: string) => {
      setOpenThread(eventId);
    },
    [setOpenThread]
  );

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
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
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;
      // In forum view, username click opens profile (no editor to insert mention into)
      openUserRoomProfile(
        room.roomId,
        undefined,
        userId,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [room, openUserRoomProfile]
  );

  const handleReplyClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) return;
      // In forum view, clicking reply opens the thread
      setOpenThread(replyId);
    },
    [setOpenThread]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) => {
      const thread = room.getThread(targetEventId);
      const threadTimelineSet = thread?.timelineSet;
      toggleReaction(mx, room, targetEventId, key, shortcode, threadTimelineSet);
    },
    [mx, room]
  );

  const handleEdit = useCallback((evtId?: string) => {
    setEditId(evtId);
  }, []);

  const handleOpenReply: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const targetId = evt.currentTarget.getAttribute('data-event-id');
      if (!targetId) return;
      // Scroll to the post or open thread
      setOpenThread(targetId);
    },
    [setOpenThread]
  );

  return (
    <PowerLevelsContextProvider value={powerLevels}>
      <Box grow="Yes">
        <Page>
          <ForumHeader showProfile={!onTop} room={room} powerLevels={powerLevels} />
          <Box style={{ position: 'relative' }} grow="Yes">
            <Scroll ref={scrollRef} hideTrack visibility="Hover">
              <PageContent>
                <PageContentCenter>
                  <ScrollTopContainer
                    scrollRef={scrollRef}
                    anchorRef={heroSectionRef}
                    onVisibilityChange={setOnTop}
                  >
                    <IconButton
                      onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                      variant="SurfaceVariant"
                      radii="Pill"
                      outlined
                      size="300"
                      aria-label="Scroll to Top"
                    >
                      {composerIcon(CaretUp)}
                    </IconButton>
                  </ScrollTopContainer>
                  <PageHeroSection
                    ref={heroSectionRef}
                    style={{
                      padding: bannerUrl ? 40 : 0,
                      borderTopLeftRadius: config.radii.R400,
                      borderTopRightRadius: config.radii.R400,
                      overflow: 'hidden',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      backgroundImage: bannerUrl
                        ? `linear-gradient(to bottom, transparent, ${color.Surface.Container} 77%), url(${bannerUrl})`
                        : undefined,
                      maxWidth: bannerUrl ? 'unset' : undefined,
                      textShadow: bannerUrl
                        ? `1px 1px 0px ${color.Surface.Container}, -1px -1px 0px ${color.Surface.Container}, 1px -1px 0px ${color.Surface.Container}, -1px 1px 0px ${color.Surface.Container}`
                        : undefined,
                    }}
                  >
                    <ForumHero room={room} />
                  </PageHeroSection>
                  <Box
                    ref={roomViewRef}
                    shrink="No"
                    direction="Column"
                    style={{ padding: `${config.space.S400} 0` }}
                  >
                    {tombstoneEvent ? (
                      <RoomTombstone
                        roomId={room.roomId}
                        body={tombstoneEvent.getContent().body}
                        replacementRoomId={tombstoneEvent.getContent().replacement_room}
                      />
                    ) : (
                      <>
                        {canMessage && (
                          <RoomInput
                            room={room}
                            editor={editor}
                            roomId={room.roomId}
                            fileDropContainerRef={roomViewRef}
                          />
                        )}
                        {!canMessage && (
                          <RoomInputPlaceholder
                            style={{ padding: config.space.S200 }}
                            alignItems="Center"
                            justifyContent="Center"
                          >
                            <Text align="Center">
                              You do not have permission to post in this room
                            </Text>
                          </RoomInputPlaceholder>
                        )}
                      </>
                    )}
                  </Box>
                  {posts.map((post) => (
                    <ForumThreadItem
                      key={post.eventId}
                      room={room}
                      mEvent={post.mEvent}
                      thread={post.thread}
                      editId={editId}
                      onEditId={handleEdit}
                      messageLayout={messageLayout}
                      messageSpacing={messageSpacing}
                      canDelete={canRedact || canDeleteOwn}
                      canSendReaction={canSendReaction}
                      canPinEvent={canPinEvent}
                      imagePackRooms={imagePackRooms}
                      hour24Clock={hour24Clock}
                      dateFormatString={dateFormatString}
                      onUserClick={handleUserClick}
                      onUsernameClick={handleUsernameClick}
                      onReplyClick={handleReplyClick}
                      onReactionToggle={handleReactionToggle}
                      linkifyOpts={linkifyOpts}
                      htmlReactParserOptions={htmlReactParserOptions}
                      showHideReads={hideReads}
                      showDeveloperTools={showDeveloperTools}
                      onReferenceClick={handleOpenReply}
                      onClick={handleOpenThread}
                    />
                  ))}
                  {posts.length === 0 && (
                    <Box
                      direction="Column"
                      alignItems="Center"
                      justifyContent="Center"
                      style={{ padding: config.space.S700, gap: config.space.S300 }}
                    >
                      {sizedIcon(Chats, '400')}
                      <Text size="T300" align="Center" priority="300">
                        No posts yet.
                      </Text>
                    </Box>
                  )}
                </PageContentCenter>
              </PageContent>
            </Scroll>
          </Box>
        </Page>
        {screenSize === ScreenSize.Desktop && openThreadId && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <ThreadDrawer
              key={`thread-${room.roomId}-${openThreadId}`}
              room={room}
              threadRootId={openThreadId}
              onClose={() => setOpenThread(undefined)}
            />
          </>
        )}
        {screenSize === ScreenSize.Desktop && !openThreadId && isDrawer && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <MembersDrawer key={room.roomId} room={room} members={members} />
          </>
        )}
        {screenSize !== ScreenSize.Desktop && openThreadId && (
          <ThreadDrawer
            key={`thread-${room.roomId}-${openThreadId}`}
            room={room}
            threadRootId={openThreadId}
            onClose={() => setOpenThread(undefined)}
            overlay
          />
        )}
      </Box>
    </PowerLevelsContextProvider>
  );
}
