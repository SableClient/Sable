import { ChangeEventHandler, useEffect, useRef, useState } from 'react';
import { Box, Header, Icon, IconButton, Icons, Input, Scroll, Text, Avatar, config } from 'folds';
import { MatrixEvent, Room, Thread, ThreadEvent } from '$types/matrix-sdk';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nicknamesAtom } from '$state/nicknames';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import { Time } from '$components/message';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import * as css from './ThreadDrawer.css';

type ThreadPreviewProps = {
  room: Room;
  thread: Thread;
  onClick: (threadId: string) => void;
};

function ThreadPreview({ room, thread, onClick }: ThreadPreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const { rootEvent } = thread;
  if (!rootEvent) return null;

  const senderId = rootEvent.getSender() ?? '';
  const displayName =
    getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;
  const avatarMxc = getMemberAvatarMxc(room, senderId);
  const avatarUrl = avatarMxc
    ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 36, 36, 'crop') ?? undefined)
    : undefined;

  const content = rootEvent.getContent();
  const bodyText: string = typeof content?.body === 'string' ? content.body : rootEvent.getType();

  const replyCount = thread.events.filter((ev: MatrixEvent) => ev.getId() !== thread.id).length;

  const lastReply = thread.events.filter((ev: MatrixEvent) => ev.getId() !== thread.id).at(-1);
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
      <Box gap="200" alignItems="Center">
        <Avatar size="200">
          <UserAvatar
            userId={senderId}
            src={avatarUrl}
            alt={displayName}
            renderFallback={() => <Icon size="100" src={Icons.User} filled />}
          />
        </Avatar>
        <Text size="B400" truncate>
          {displayName}
        </Text>
        <Time
          ts={rootEvent.getTs()}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      </Box>
      <Text size="T300" truncate style={{ paddingLeft: config.space.S600 }}>
        {bodyText.slice(0, 120)}
      </Text>
      {replyCount > 0 && (
        <Box gap="100" alignItems="Center" style={{ paddingLeft: config.space.S600 }}>
          <Text size="T200" priority="300">
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </Text>
          {lastReply && (
            <Text size="T200" priority="300" truncate>
              {'· '}
              <b>{lastDisplayName}</b>
              {lastBody ? `: ${lastBody.slice(0, 60)}` : ''}
            </Text>
          )}
        </Box>
      )}
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
  const [, forceUpdate] = useState(0);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Re-render when threads change.
  useEffect(() => {
    const onUpdate = () => forceUpdate((n) => n + 1);
    room.on(ThreadEvent.New as any, onUpdate);
    room.on(ThreadEvent.Update as any, onUpdate);
    room.on(ThreadEvent.NewReply as any, onUpdate);
    return () => {
      room.off(ThreadEvent.New as any, onUpdate);
      room.off(ThreadEvent.Update as any, onUpdate);
      room.off(ThreadEvent.NewReply as any, onUpdate);
    };
  }, [room]);

  const allThreads = room.getThreads().sort((a, b) => {
    const aTs = a.events.at(-1)?.getTs() ?? a.rootEvent?.getTs() ?? 0;
    const bTs = b.events.at(-1)?.getTs() ?? b.rootEvent?.getTs() ?? 0;
    return bTs - aTs;
  });

  const lowerQuery = query.trim().toLowerCase();
  const threads = lowerQuery
    ? allThreads.filter((t) => {
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
      <Header className={css.ThreadDrawerHeader} variant="Background" size="400">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Thread} />
          <Text size="H4" truncate>
            Threads
          </Text>
        </Box>
        <Box alignItems="Center" gap="200" shrink="No">
          <Text size="T300" priority="300" truncate>
            # {room.name}
          </Text>
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
          hideTrack
          style={{ flexGrow: 1 }}
        >
          {threads.length === 0 ? (
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
          ) : (
            <Box
              direction="Column"
              style={{ padding: `${config.space.S100} ${config.space.S200}` }}
            >
              {threads.map((thread) => (
                <ThreadPreview key={thread.id} room={room} thread={thread} onClick={onOpenThread} />
              ))}
            </Box>
          )}
        </Scroll>
      </Box>
    </Box>
  );
}
