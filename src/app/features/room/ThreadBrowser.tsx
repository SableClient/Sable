import type { ChangeEventHandler, MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Spinner,
  Text,
  Avatar,
  config,
  Chip,
} from 'folds';
import type { EventTimelineSet, MatrixEvent, Room, Thread } from '$types/matrix-sdk';
import { NotificationCountType, RoomEvent, ThreadEvent } from '$types/matrix-sdk';
import { useAtomValue } from 'jotai';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { nicknamesAtom } from '$state/nicknames';
import { getMemberAvatarMxc, getMemberDisplayName, reactionOrEditEvent } from '$utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import {
  AvatarBase,
  ModernLayout,
  RedactedContent,
  Time,
  Username,
  UsernameBold,
  Reply,
} from '$components/message';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import type { GetContentCallback } from '$types/matrix/room';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { UnreadBadge, UnreadBadgeCenter } from '$components/unread-badge';
import { EncryptedContent } from './message';
import * as css from './ThreadDrawer.css';

type ThreadPreviewProps = {
  room: Room;
  thread: Thread;
  onClick: (threadId: string) => void;
  onJump?: () => void;
};

function ThreadPreview({ room, thread, onClick, onJump }: ThreadPreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { navigateRoom } = useRoomNavigate();
  const nicknames = useAtomValue(nicknamesAtom);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href: string) =>
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
    [mx, room.roomId, nicknames, mentionClickHandler, settingsLinkBaseUrl]
  );

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        useAuthentication,
        nicknames,
      }),
    [
      mx,
      room,
      linkifyOpts,
      mentionClickHandler,
      spoilerClickHandler,
      useAuthentication,
      nicknames,
      settingsLinkBaseUrl,
    ]
  );

  const handleJumpClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.stopPropagation();
      navigateRoom(room.roomId, thread.id);
      onJump?.();
    },
    [navigateRoom, room.roomId, thread.id, onJump]
  );

  const [, forceUnread] = useState(0);
  useEffect(() => {
    const onUnread = (_count: unknown, threadId?: string) => {
      if (!threadId || threadId === thread.id) forceUnread((n) => n + 1);
    };
    room.on(RoomEvent.UnreadNotifications, onUnread);
    return () => {
      room.off(RoomEvent.UnreadNotifications, onUnread);
    };
  }, [room, thread.id]);
  const unreadTotal = room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Total);
  const unreadHighlight = room.getThreadUnreadNotificationCount(
    thread.id,
    NotificationCountType.Highlight
  );

  const { rootEvent } = thread;
  if (!rootEvent) return null;

  const senderId = rootEvent.getSender() ?? '';
  const displayName =
    getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;
  const senderAvatarMxc = getMemberAvatarMxc(room, senderId);
  const getContent = (() => rootEvent.getContent()) as GetContentCallback;

  const localReplyCount = thread.events.filter(
    (ev: MatrixEvent) => ev.getId() !== thread.id && !reactionOrEditEvent(ev)
  ).length;
  // Use Math.max so we never show fewer replies than the server reports.
  const replyCount = Math.max(localReplyCount, thread.length ?? 0);

  const lastReply = thread.events.findLast(
    (ev: MatrixEvent) => ev.getId() !== thread.id && !reactionOrEditEvent(ev)
  );
  const lastSenderId = lastReply?.getSender() ?? '';
  const lastDisplayName =
    getMemberDisplayName(room, lastSenderId, nicknames) ??
    getMxIdLocalPart(lastSenderId) ??
    lastSenderId;
  const lastContent = lastReply?.getContent();
  const lastBody: string = typeof lastContent?.body === 'string' ? lastContent.body : '';

  return (
    <Box
      as="button"
      direction="Column"
      gap="100"
      className={css.ThreadBrowserItem}
      onClick={() => onClick(thread.id)}
    >
      <ModernLayout
        before={
          <AvatarBase>
            <Avatar size="300">
              <UserAvatar
                userId={senderId}
                src={
                  senderAvatarMxc
                    ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ??
                      undefined)
                    : undefined
                }
                alt={displayName}
                renderFallback={() => <Icon size="200" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarBase>
        }
      >
        <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
          <Box gap="200" alignItems="Baseline">
            <Username>
              <Text as="span" truncate>
                <UsernameBold>{displayName}</UsernameBold>
              </Text>
            </Username>
            <Time
              ts={rootEvent.getTs()}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
          </Box>
          <Box shrink="No" alignItems="Center" gap="200">
            {unreadTotal > 0 && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={unreadHighlight > 0} count={unreadTotal} />
              </UnreadBadgeCenter>
            )}
            <Chip data-event-id={thread.id} onClick={handleJumpClick} radii="Pill">
              <Text size="T200">Jump</Text>
            </Chip>
          </Box>
        </Box>
        {rootEvent.replyEventId && (
          <Reply
            room={room}
            replyEventId={rootEvent.replyEventId}
            threadRootId={rootEvent.threadRootId}
            mentions={rootEvent.getContent()['m.mentions']}
            onClick={handleJumpClick}
          />
        )}
        <Box style={{ maxHeight: '200px', overflow: 'auto', flexShrink: 0 }}>
          <EncryptedContent mEvent={rootEvent}>
            {() => {
              if (rootEvent.isRedacted()) {
                return <RedactedContent />;
              }

              return (
                <RenderMessageContent
                  displayName={displayName}
                  msgType={rootEvent.getContent().msgtype ?? ''}
                  ts={rootEvent.getTs()}
                  getContent={getContent}
                  edited={!!rootEvent.replacingEvent()}
                  mediaAutoLoad={mediaAutoLoad}
                  urlPreview={urlPreview}
                  htmlReactParserOptions={htmlReactParserOptions}
                  linkifyOpts={linkifyOpts}
                  outlineAttachment
                />
              );
            }}
          </EncryptedContent>
        </Box>
        {replyCount > 0 && (
          <Box gap="100" alignItems="Center" style={{ marginTop: config.space.S200 }}>
            <Text size="T200" priority="300" style={{ flexShrink: 0 }}>
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </Text>
            {lastReply && lastBody && (
              <Text
                size="T200"
                priority="300"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                · {lastDisplayName}: {lastBody.slice(0, 60)}
              </Text>
            )}
          </Box>
        )}
      </ModernLayout>
    </Box>
  );
}

type ThreadBrowserProps = {
  room: Room;
  onOpenThread: (threadId: string) => void;
  onClose: () => void;
  overlay?: boolean;
};

export function ThreadBrowser({ room, onOpenThread, onClose, overlay }: ThreadBrowserProps) {
  const mx = useMatrixClient();
  const [, forceUpdate] = useState(0);
  const [query, setQuery] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const threadListTimelineSetRef = useRef<EventTimelineSet | null>(null);
  const loadingMoreRef = useRef(false);
  const canLoadMoreRef = useRef(false);
  canLoadMoreRef.current = canLoadMore;

  // On mount, set up thread event listeners, create the server-side thread
  // timeline sets, then fetch page 1 via paginate.  The two operations are
  // sequenced in a single effect so that createThreadsTimelineSets() always
  // resolves before fetchRoomThreads() runs — the SDK's fetchRoomThreadList
  // has an early-return guard (`if (this.threadsTimelineSets.length === 0)`)
  // that silently no-ops when the sets haven't been created yet, so running
  // both in parallel (the old two-effect approach) caused fetchRoomThreads to
  // always be a no-op and left threadsReady=true prematurely.
  useEffect(() => {
    const onUpdate = () => forceUpdate((n) => n + 1);
    room.on(ThreadEvent.New, onUpdate);
    room.on(ThreadEvent.Update, onUpdate);
    room.on(ThreadEvent.NewReply, onUpdate);

    let cancelled = false;
    const loadThreads = async () => {
      setLoadingMore(true);
      try {
        // Create the timeline sets first — required before fetchRoomThreads().
        const sets = await room.createThreadsTimelineSets();
        if (!sets || cancelled) return;
        const [allThreadsSet] = sets;
        threadListTimelineSetRef.current = allThreadsSet;

        // Now fetch page 1 from the /threads endpoint.  threadsTimelineSets is
        // populated so fetchRoomThreadList will not early-return.
        await room.fetchRoomThreads().catch((err: unknown) => {
          console.warn('ThreadBrowser: fetchRoomThreads failed', err);
        });

        // Paginate to load the first page into the timeline set.
        const hasMore = await mx.paginateEventTimeline(allThreadsSet.getLiveTimeline(), {
          backwards: true,
        });
        // Ensure Thread objects exist for server-returned thread roots not yet
        // known locally (threads outside the current sliding-sync window).
        // fetchRoomThreads() creates Thread objects internally but uses
        // room.findEventById() to set rootEvent — if the root event isn't in
        // the sliding-sync cache, rootEvent ends up undefined, and
        // ThreadPreview returns null for those threads.  Backfill here using
        // the event we already have from the threads timeline set.
        allThreadsSet
          .getLiveTimeline()
          .getEvents()
          .filter((event) => !!event.getId())
          .forEach((event) => {
            const id = event.getId()!;
            const existingThread = room.getThread(id);

            if (!existingThread) {
              room.createThread(id, event, [], false);
            } else {
              if (!existingThread.rootEvent) {
                existingThread.rootEvent = event;
                existingThread.setEventMetadata(event);
              }
            }
          });
        if (!cancelled) {
          setCanLoadMore(hasMore);
          forceUpdate((n) => n + 1);
        }
      } catch {
        // Server doesn't support thread list API; fall back to locally known threads.
      } finally {
        if (!cancelled) setLoadingMore(false);
      }
    };
    loadThreads();

    return () => {
      cancelled = true;
      room.off(ThreadEvent.New, onUpdate);
      room.off(ThreadEvent.Update, onUpdate);
      room.off(ThreadEvent.NewReply, onUpdate);
    };
  }, [room, mx]);

  const handleLoadMore = useCallback(async () => {
    const tls = threadListTimelineSetRef.current;
    if (!tls || loadingMore) return;
    setLoadingMore(true);
    try {
      const hasMore = await mx.paginateEventTimeline(tls.getLiveTimeline(), {
        backwards: true,
      });
      tls
        .getLiveTimeline()
        .getEvents()
        .filter((event) => !!event.getId())
        .forEach((event) => {
          const id = event.getId()!;
          const existingThread = room.getThread(id);

          if (!existingThread) {
            room.createThread(id, event, [], false);
          } else {
            if (!existingThread.rootEvent) {
              existingThread.rootEvent = event;
              existingThread.setEventMetadata(event);
            }
          }
        });
      setCanLoadMore(hasMore);
      forceUpdate((n) => n + 1);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [mx, room, loadingMore]);

  const handleLoadMoreRef = useRef(handleLoadMore);
  handleLoadMoreRef.current = handleLoadMore;

  const handleThreadsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 200 && canLoadMoreRef.current && !loadingMoreRef.current) {
      handleLoadMoreRef.current();
    }
  }, []);

  const allThreads = room.getThreads().toSorted((a: Thread, b: Thread) => {
    const aTs = a.events.at(-1)?.getTs() ?? a.rootEvent?.getTs() ?? 0;
    const bTs = b.events.at(-1)?.getTs() ?? b.rootEvent?.getTs() ?? 0;
    return bTs - aTs;
  });

  const lowerQuery = query.trim().toLowerCase();
  const threads = lowerQuery
    ? allThreads.filter((t: Thread) => {
        const body = t.rootEvent?.getContent()?.body ?? '';
        return typeof body === 'string' && body.toLowerCase().includes(lowerQuery);
      })
    : allThreads;

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    setQuery(e.target.value);
  };

  return (
    <Box
      className={overlay ? css.ThreadDrawerOverlay : css.ThreadDrawer}
      direction="Column"
      shrink="No"
    >
      <Header className={css.ThreadDrawerHeader} variant="Background" size="600">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Thread} />
          <Text size="H4" truncate>
            Threads
          </Text>
        </Box>
        <Box alignItems="Center" gap="200" shrink="No">
          <IconButton
            onClick={onClose}
            variant="SurfaceVariant"
            size="300"
            radii="300"
            aria-label="Close threads"
          >
            <Icon size="200" src={Icons.Cross} />
          </IconButton>
        </Box>
      </Header>

      <Box
        direction="Column"
        gap="100"
        style={{ padding: `${config.space.S200} ${config.space.S300}` }}
        shrink="No"
      >
        <Input
          ref={searchRef}
          value={query}
          onChange={handleSearchChange}
          placeholder="Search threads..."
          variant="Surface"
          size="400"
          radii="400"
          before={<Icon size="50" src={Icons.Search} />}
          after={
            query ? (
              <IconButton
                size="300"
                radii="300"
                variant="SurfaceVariant"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <Icon size="50" src={Icons.Cross} />
              </IconButton>
            ) : undefined
          }
        />
      </Box>

      <Box className={css.ThreadDrawerContent} grow="Yes" direction="Column">
        <Scroll
          variant="Background"
          visibility="Hover"
          direction="Vertical"
          size="300"
          onScroll={handleThreadsScroll}
          style={{ flexGrow: 1 }}
        >
          {(() => {
            if (threads.length === 0 && loadingMore)
              return (
                <Box
                  direction="Column"
                  alignItems="Center"
                  justifyContent="Center"
                  style={{ padding: config.space.S400, gap: config.space.S200 }}
                >
                  <Spinner variant="Secondary" size="400" />
                </Box>
              );
            if (threads.length === 0)
              return (
                <Box
                  direction="Column"
                  alignItems="Center"
                  justifyContent="Center"
                  style={{ padding: config.space.S400, gap: config.space.S200 }}
                >
                  <Icon size="400" src={Icons.Thread} />
                  <Text size="T300" align="Center">
                    {lowerQuery ? 'No threads match your search.' : 'No threads yet.'}
                  </Text>
                </Box>
              );
            return (
              <>
                <Box
                  direction="Column"
                  style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                >
                  {threads.map((thread: Thread) => (
                    <ThreadPreview
                      key={thread.id}
                      room={room}
                      thread={thread}
                      onClick={onOpenThread}
                      onJump={onClose}
                    />
                  ))}
                </Box>
                {loadingMore && (
                  <Box
                    justifyContent="Center"
                    style={{ padding: config.space.S300, flexShrink: 0 }}
                  >
                    <Spinner variant="Secondary" size="400" />
                  </Box>
                )}
              </>
            );
          })()}
        </Scroll>
      </Box>
    </Box>
  );
}
