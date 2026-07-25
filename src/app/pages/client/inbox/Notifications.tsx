import type { MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Box, Chip, Header, IconButton, Scroll, Text, config, toRem } from 'folds';
import {
  ArrowLeft,
  CaretUp,
  ChatCircle,
  Check,
  Checks,
  composerIcon,
  sizedIcon,
} from '$components/icons/phosphor';
import { useSearchParams } from 'react-router-dom';
import type { INotification, INotificationsResponse, Room } from '$types/matrix-sdk';
import { EventType, JoinRule, MatrixEvent, Method } from '$types/matrix-sdk';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtomValue } from 'jotai';
import { Page, PageContent, PageContentCenter, PageHeader } from '$components/page';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { InboxNotificationsPathSearchParams } from '$pages/paths';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { SequenceCard } from '$components/sequence-card';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { getRoomAvatarUrl } from '$utils/room/display';
import { ScrollTopContainer } from '$components/scroll-top-container';
import { useInterval } from '$hooks/useInterval';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useRoomUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { markAsRead } from '$utils/notifications';
import { ContainerColor } from '$styles/ContainerColor.css';
import { VirtualTile } from '$components/virtualizer';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { allRoomsAtom } from '$state/room-list/roomList';

type RoomNotificationsGroup = {
  roomId: string;
  notifications: INotification[];
};
type NotificationTimeline = {
  nextToken?: string;
  groups: RoomNotificationsGroup[];
};
type LoadTimeline = (from?: string) => Promise<void>;
type SilentReloadTimeline = () => Promise<void>;

const groupNotifications = (
  notifications: INotification[],
  allowRooms: Set<string>
): RoomNotificationsGroup[] => {
  const groups: RoomNotificationsGroup[] = [];
  notifications.forEach((notification) => {
    if (notification.event.type === (EventType.RoomMember as string)) return;
    if (!allowRooms.has(notification.room_id)) return;

    const groupIndex = groups.length - 1;
    const lastAddedGroup: RoomNotificationsGroup | undefined = groups[groupIndex];
    if (notification.room_id === lastAddedGroup?.roomId) {
      lastAddedGroup.notifications.push(notification);
      return;
    }
    groups.push({
      roomId: notification.room_id,
      notifications: [notification],
    });
  });
  return groups;
};

const useNotificationTimeline = (
  paginationLimit: number,
  onlyHighlight?: boolean
): [NotificationTimeline, LoadTimeline, SilentReloadTimeline] => {
  const mx = useMatrixClient();
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);

  const [notificationTimeline, setNotificationTimeline] = useState<NotificationTimeline>({
    groups: [],
  });

  const fetchNotifications = useCallback(
    (from?: string, limit?: number, only?: 'highlight') => {
      const queryParams = { from, limit, only };
      return mx.http.authedRequest<INotificationsResponse>(
        Method.Get,
        '/notifications',
        queryParams
      );
    },
    [mx]
  );

  const loadTimeline: LoadTimeline = useCallback(
    async (from) => {
      if (!from) {
        setNotificationTimeline({ groups: [] });
      }
      const data = await fetchNotifications(
        from,
        paginationLimit,
        onlyHighlight ? 'highlight' : undefined
      );
      const groups = groupNotifications(data.notifications, allJoinedRooms);

      setNotificationTimeline((currentTimeline) => {
        if (currentTimeline.nextToken === from) {
          return {
            nextToken: data.next_token,
            groups: from ? currentTimeline.groups.concat(groups) : groups,
          };
        }
        return currentTimeline;
      });
    },
    [paginationLimit, onlyHighlight, fetchNotifications, allJoinedRooms]
  );

  /**
   * Reload timeline silently i.e without setting to default
   * before fetching notifications from start
   */
  const silentReloadTimeline: SilentReloadTimeline = useCallback(async () => {
    const data = await fetchNotifications(
      undefined,
      paginationLimit,
      onlyHighlight ? 'highlight' : undefined
    );
    const groups = groupNotifications(data.notifications, allJoinedRooms);
    setNotificationTimeline({
      nextToken: data.next_token,
      groups,
    });
  }, [paginationLimit, onlyHighlight, fetchNotifications, allJoinedRooms]);

  return [notificationTimeline, loadTimeline, silentReloadTimeline];
};

type RoomNotificationsGroupProps = {
  room: Room;
  appBaseUrl: string;
  notifications: INotification[];
  hideReads: boolean;
  onOpen: (roomId: string, eventId: string) => void;
  hour24Clock: boolean;
  dateFormatString: string;
};

type NotificationItemProps = {
  room: Room;
  notification: INotification;
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
  const event = useMemo(() => new MatrixEvent(notification.event), [notification.event]);
  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    onOpen(room.roomId, notification.event.event_id);
  };

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
          <Chip onClick={handleOpen} variant="Secondary" radii="400">
            <Text size="T200">Open</Text>
          </Chip>
        }
        onOpen={handleOpen}
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
      />
    </SequenceCard>
  );
}

function RoomNotificationsGroupComp({
  room,
  appBaseUrl,
  notifications,
  hideReads,
  onOpen,
  hour24Clock,
  dateFormatString,
}: Readonly<RoomNotificationsGroupProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const renderContent = useRoomMessagePreviewRenderer(room, { settingsLinkBaseUrl: appBaseUrl });
  const handleMarkAsRead = () => {
    markAsRead(mx, room.roomId, hideReads);
  };

  return (
    <Box direction="Column" gap="200">
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
        <Box shrink="No">
          {unread && (
            <Chip
              variant="Primary"
              radii="Pill"
              onClick={handleMarkAsRead}
              before={sizedIcon(Checks, '100')}
            >
              <Text size="T200">Mark as Read</Text>
            </Chip>
          )}
        </Box>
      </Header>
      <Box direction="Column" gap="100">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.event.event_id}
            room={room}
            notification={notification}
            renderContent={renderContent}
            onOpen={onOpen}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        ))}
      </Box>
    </Box>
  );
}

const useNotificationsSearchParams = (
  searchParams: URLSearchParams
): InboxNotificationsPathSearchParams =>
  useMemo(
    () => ({
      only: searchParams.get('only') ?? undefined,
    }),
    [searchParams]
  );

const FAST_REFRESH_MS = 2500;

export function Notifications() {
  const mx = useMatrixClient();
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const screenSize = useScreenSizeContext();
  const appBaseUrl = useSettingsLinkBaseUrl();

  const { navigateRoom } = useRoomNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const notificationsSearchParams = useNotificationsSearchParams(searchParams);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);

  const onlyHighlight = notificationsSearchParams.only === 'highlight';
  const setOnlyHighlighted = (highlight: boolean) => {
    if (highlight) {
      setSearchParams(
        new URLSearchParams({
          only: 'highlight',
        })
      );
      return;
    }
    setSearchParams();
  };

  const [notificationTimeline, loadTimelineRaw, silentReloadTimeline] = useNotificationTimeline(
    24,
    onlyHighlight
  );
  const [timelineState, loadTimeline] = useAsyncCallback(loadTimelineRaw);

  const virtualizer = useVirtualizer({
    count: notificationTimeline.groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 4,
  });
  const vItems = virtualizer.getVirtualItems();

  useInterval(
    useCallback(() => {
      silentReloadTimeline();
    }, [silentReloadTimeline]),
    FAST_REFRESH_MS
  );

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const lastVItem = vItems.at(-1);
  const lastVItemIndex: number | undefined = lastVItem?.index;
  useEffect(() => {
    if (
      timelineState.status === AsyncStatus.Success &&
      notificationTimeline.groups.length - 1 === lastVItemIndex &&
      notificationTimeline.nextToken
    ) {
      loadTimeline(notificationTimeline.nextToken);
    }
  }, [timelineState, notificationTimeline, lastVItemIndex, loadTimeline]);

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
                  <Box gap="200">
                    <Chip
                      onClick={() => setOnlyHighlighted(false)}
                      variant={onlyHighlight ? 'Surface' : 'Success'}
                      aria-pressed={!onlyHighlight}
                      before={!onlyHighlight && sizedIcon(Check, '100')}
                      outlined
                    >
                      <Text size="T200">All Notifications</Text>
                    </Chip>
                    <Chip
                      onClick={() => setOnlyHighlighted(true)}
                      variant={onlyHighlight ? 'Success' : 'Surface'}
                      aria-pressed={onlyHighlight}
                      before={onlyHighlight && sizedIcon(Check, '100')}
                      outlined
                    >
                      <Text size="T200">Highlighted</Text>
                    </Chip>
                  </Box>
                </Box>
                <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
                  <IconButton
                    onClick={() => virtualizer.scrollToOffset(0)}
                    variant="SurfaceVariant"
                    radii="Pill"
                    outlined
                    size="300"
                    aria-label="Scroll to Top"
                  >
                    {composerIcon(CaretUp)}
                  </IconButton>
                </ScrollTopContainer>
                <div
                  style={{
                    position: 'relative',
                    height: virtualizer.getTotalSize(),
                  }}
                >
                  {vItems.map((vItem) => {
                    const group = notificationTimeline.groups[vItem.index];
                    if (!group) return null;
                    const groupRoom = mx.getRoom(group.roomId);
                    if (!groupRoom) return null;

                    return (
                      <VirtualTile
                        virtualItem={vItem}
                        style={{ paddingTop: config.space.S500 }}
                        ref={virtualizer.measureElement}
                        key={vItem.index}
                      >
                        <RoomNotificationsGroupComp
                          room={groupRoom}
                          appBaseUrl={appBaseUrl}
                          notifications={group.notifications}
                          hideReads={hideReads}
                          onOpen={navigateRoom}
                          hour24Clock={hour24Clock}
                          dateFormatString={dateFormatString}
                        />
                      </VirtualTile>
                    );
                  })}
                </div>

                {timelineState.status === AsyncStatus.Success &&
                  notificationTimeline.groups.length === 0 && (
                    <Box
                      className={ContainerColor({
                        variant: 'SurfaceVariant',
                      })}
                      style={{
                        padding: config.space.S300,
                        borderRadius: config.radii.R400,
                      }}
                      direction="Column"
                      gap="200"
                    >
                      <Text>No Notifications</Text>
                      <Text size="T200">
                        You don&apos;t have any new notifications to display yet.
                      </Text>
                    </Box>
                  )}

                {timelineState.status === AsyncStatus.Loading && (
                  <Box direction="Column" gap="100">
                    {Array.from({ length: 8 }).map(() => (
                      <SequenceCard
                        variant="SurfaceVariant"
                        key={crypto.randomUUID()}
                        style={{ minHeight: toRem(80) }}
                      />
                    ))}
                  </Box>
                )}
                {timelineState.status === AsyncStatus.Error && (
                  <Box
                    className={ContainerColor({ variant: 'Critical' })}
                    style={{
                      padding: config.space.S300,
                      borderRadius: config.radii.R400,
                    }}
                    direction="Column"
                    gap="200"
                  >
                    <Text size="L400">{(timelineState.error as Error).name}</Text>
                    <Text size="T300">{(timelineState.error as Error).message}</Text>
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
