import type { MouseEventHandler } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Badge, Box, Chip, Header, IconButton, Scroll, Spinner, Text, config } from 'folds';
import { useSearchParams } from 'react-router';
import { Virtualizer } from 'virtua';
import {
  ArrowLeft,
  CaretDown,
  CaretUp,
  ChatCircle,
  Check,
  Checks,
  composerIcon,
  sizedIcon,
} from '$components/icons/phosphor';
import { JoinRule, MatrixEvent } from '$types/matrix-sdk';
import type { Room } from '$types/matrix-sdk';
import { Page, PageContent, PageContentCenter, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { ScrollTopContainer } from '$components/scroll-top-container';
import { ContainerColor } from '$styles/ContainerColor.css';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { showToast } from '$state/toast';
import { markAsRead } from '$utils/notifications';
import { fetchNotificationEvent } from '$utils/notificationEvent';
import { getRoomAvatarUrl } from '$utils/room/display';
import { useRoomUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useLocalNotificationTimeline } from '$hooks/useLocalNotificationTimeline';
import {
  isStoredNotificationRead,
  type NotificationTab,
  type StoredNotification,
} from '$utils/localNotifications';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';

type NotificationRow = {
  notification: StoredNotification;
  showHeader: boolean;
};

const notificationRows = (items: StoredNotification[]): NotificationRow[] =>
  items.map((notification, index) => ({
    notification,
    showHeader: items[index - 1]?.room_id !== notification.room_id,
  }));

type NotificationItemProps = {
  room: Room;
  notification: StoredNotification;
  renderContent: ReturnType<typeof useRoomMessagePreviewRenderer>;
  onOpen: (roomId: string, eventId: string) => void;
  hour24Clock: boolean;
  dateFormatString: string;
};

function NotificationItem({
  room,
  notification,
  renderContent,
  onOpen,
  hour24Clock,
  dateFormatString,
}: NotificationItemProps) {
  const mx = useMatrixClient();
  const liveEvent = useMemo(
    () => room.findEventById(notification.event.event_id),
    [room, notification.event.event_id]
  );
  const storedEvent = useMemo(() => new MatrixEvent(notification.event), [notification.event]);
  const [remoteEvent, setRemoteEvent] = useState<MatrixEvent>();

  useEffect(() => {
    setRemoteEvent(undefined);
    if (liveEvent) return undefined;

    let mounted = true;
    fetchNotificationEvent(mx, room.roomId, notification.event.event_id)
      .then((event) => mounted && setRemoteEvent(event))
      // Offline, or the event is gone: storedEvent stays as the fallback.
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [mx, room.roomId, notification.event.event_id, liveEvent]);

  const event = liveEvent ?? remoteEvent ?? storedEvent;

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    onOpen(room.roomId, notification.event.event_id);
  };
  const read = isStoredNotificationRead(room, mx.getSafeUserId(), notification);

  return (
    <SequenceCard
      style={{ padding: config.space.S400 }}
      variant="SurfaceVariant"
      direction="Column"
    >
      <MessagePreview
        room={room}
        event={event}
        renderContent={renderContent}
        actions={
          <Box shrink="No" gap="200" alignItems="Center">
            {!read && (
              <Badge variant="Secondary" size="200" fill="Solid" radii="Pill" outlined={false} />
            )}
            <Chip onClick={handleOpen} variant="Secondary" radii="400">
              <Text size="T200">Open</Text>
            </Chip>
          </Box>
        }
        onOpen={handleOpen}
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
      />
    </SequenceCard>
  );
}

function NotificationRowItem({
  room,
  appBaseUrl,
  row,
  hideReads,
  onOpen,
  onMarkRead,
  hour24Clock,
  dateFormatString,
}: {
  room: Room;
  appBaseUrl: string;
  row: NotificationRow;
  hideReads: boolean;
  onOpen: (roomId: string, eventId: string) => void;
  onMarkRead: () => void;
  hour24Clock: boolean;
  dateFormatString: string;
}) {
  const mx = useMatrixClient();
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const useAuthentication = useMediaAuthentication();
  const renderContent = useRoomMessagePreviewRenderer(room, {
    settingsLinkBaseUrl: appBaseUrl,
  });

  return (
    <Box direction="Column" gap="200">
      {row.showHeader && (
        <Header size="300">
          <Box gap="200" grow="Yes">
            <Avatar size="200" radii="300">
              <RoomAvatar
                roomId={room.roomId}
                src={getRoomAvatarUrl(mx, room, 96, useAuthentication)}
                alt={room.name}
                renderFallback={() => (
                  <RoomIcon
                    size="50"
                    roomType={room.getType()}
                    joinRule={room.getJoinRule() ?? JoinRule.Restricted}
                    filled
                  />
                )}
              />
            </Avatar>
            <Text size="H4" truncate>
              {room.name}
            </Text>
          </Box>
          {unread && (unread.total > 0 || unread.highlight > 0) && (
            <Chip
              variant="Primary"
              radii="Pill"
              onClick={() => {
                void markAsRead(mx, room.roomId, hideReads, true)
                  .then(onMarkRead)
                  .catch(() => showToast('Unable to mark this room as read.'));
              }}
              before={sizedIcon(Checks, '100')}
            >
              <Text size="T200">Mark as Read</Text>
            </Chip>
          )}
        </Header>
      )}
      <NotificationItem
        room={room}
        notification={row.notification}
        renderContent={renderContent}
        onOpen={onOpen}
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
      />
    </Box>
  );
}

export function Notifications() {
  const mx = useMatrixClient();
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const screenSize = useScreenSizeContext();
  const appBaseUrl = useSettingsLinkBaseUrl();
  const { navigateRoom } = useRoomNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);
  const virtualStartRef = useRef<HTMLDivElement>(null);
  const [virtualStartMargin, setVirtualStartMargin] = useState(0);

  const tabValue = searchParams.get('tab');
  const tab: NotificationTab = tabValue === 'dms' || tabValue === 'mentions' ? tabValue : 'all';
  const includeRead = searchParams.get('read') === '1';
  const query = useMemo(() => ({ tab, includeRead, limit: 24 }), [includeRead, tab]);
  const { page, loadingOlder, error, refresh, loadOlder } = useLocalNotificationTimeline(query);
  const rows = useMemo(() => notificationRows(page.items), [page.items]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const start = virtualStartRef.current;
    if (!scroll || !start) return undefined;
    const updateMargin = () => {
      const margin =
        start.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
      setVirtualStartMargin((current) => (current === margin ? current : margin));
    };
    updateMargin();
    window.addEventListener('resize', updateMargin);
    return () => window.removeEventListener('resize', updateMargin);
  }, [includeRead, rows.length, tab]);

  const setFilter = (name: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === undefined) next.delete(name);
    else next.set(name, value);
    setSearchParams(next);
  };

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" basis="No">
            {screenSize === ScreenSize.Mobile && (
              <BackRouteHandler>
                {(onBack) => <IconButton onClick={onBack}>{composerIcon(ArrowLeft)}</IconButton>}
              </BackRouteHandler>
            )}
          </Box>
          <Box alignItems="Center" gap="200">
            {screenSize !== ScreenSize.Mobile && sizedIcon(ChatCircle, '400')}
            <Text size="H3" truncate>
              Notification Messages
            </Text>
          </Box>
          <Box grow="Yes" basis="No" />
        </Box>
      </PageHeader>

      <Box style={{ position: 'relative' }} grow="Yes">
        <Scroll ref={scrollRef} hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box direction="Column" gap="200">
                <Box ref={scrollTopAnchorRef} direction="Column" gap="100">
                  <span data-spacing-node />
                  <Text size="L400">Filter</Text>
                  <Box gap="200" wrap="Wrap">
                    {(['dms', 'mentions', 'all'] as NotificationTab[]).map((value) => (
                      <Chip
                        key={value}
                        onClick={() => setFilter('tab', value === 'all' ? undefined : value)}
                        variant={tab === value ? 'Success' : 'Surface'}
                        aria-pressed={tab === value}
                        before={tab === value && sizedIcon(Check, '100')}
                        outlined
                      >
                        <Text size="T200">
                          {value === 'dms' ? 'DMs' : value[0]!.toUpperCase() + value.slice(1)}
                        </Text>
                      </Chip>
                    ))}
                    <Chip
                      onClick={() => setFilter('read', includeRead ? undefined : '1')}
                      variant={includeRead ? 'Success' : 'Surface'}
                      aria-pressed={includeRead}
                      before={includeRead && sizedIcon(Check, '100')}
                      outlined
                    >
                      <Text size="T200">Include read</Text>
                    </Chip>
                  </Box>
                </Box>

                <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
                  <IconButton
                    onClick={() => scrollRef.current?.scrollTo({ top: 0 })}
                    variant="SurfaceVariant"
                    radii="Pill"
                    outlined
                    size="300"
                    aria-label="Scroll to Top"
                  >
                    {composerIcon(CaretUp)}
                  </IconButton>
                </ScrollTopContainer>

                <div ref={virtualStartRef}>
                  <Virtualizer<NotificationRow>
                    data={rows}
                    scrollRef={scrollRef}
                    startMargin={virtualStartMargin}
                    bufferSize={800}
                  >
                    {(row) => {
                      const room = mx.getRoom(row.notification.room_id);
                      if (!room) return <div key={row.notification.event.event_id} />;
                      return (
                        <div
                          key={row.notification.event.event_id}
                          style={{
                            paddingTop: row.showHeader ? config.space.S500 : config.space.S100,
                          }}
                        >
                          <NotificationRowItem
                            room={room}
                            appBaseUrl={appBaseUrl}
                            row={row}
                            hideReads={hideReads}
                            onOpen={navigateRoom}
                            onMarkRead={refresh}
                            hour24Clock={hour24Clock}
                            dateFormatString={dateFormatString}
                          />
                        </div>
                      );
                    }}
                  </Virtualizer>
                </div>

                {page.items.length === 0 && (
                  <Box
                    className={ContainerColor({ variant: 'SurfaceVariant' })}
                    style={{
                      padding: config.space.S300,
                      borderRadius: config.radii.R400,
                    }}
                    direction="Column"
                    gap="200"
                  >
                    <Text>No Notifications</Text>
                    <Text size="T200">
                      You don&apos;t have any notifications matching these filters.
                    </Text>
                  </Box>
                )}
                {error && (
                  <Box
                    className={ContainerColor({ variant: 'Critical' })}
                    style={{
                      padding: config.space.S300,
                      borderRadius: config.radii.R400,
                    }}
                  >
                    <Text size="T300">{error.message}</Text>
                  </Box>
                )}
                {page.canLoadOlder && (
                  <Box
                    alignItems="Center"
                    justifyContent="Center"
                    style={{ padding: config.space.S300 }}
                  >
                    <IconButton
                      onClick={() => void loadOlder()}
                      disabled={loadingOlder}
                      variant="SurfaceVariant"
                      radii="Pill"
                      outlined
                      size="400"
                      aria-label={
                        error ? 'Retry loading older notifications' : 'Load older notifications'
                      }
                    >
                      {loadingOlder ? (
                        <Spinner size="200" variant="Secondary" />
                      ) : (
                        composerIcon(CaretDown)
                      )}
                    </IconButton>
                  </Box>
                )}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
