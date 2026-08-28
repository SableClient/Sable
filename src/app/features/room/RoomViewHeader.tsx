import type { MouseEventHandler } from 'react';
import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import classNames from 'classnames';
import { Box, Avatar, Text, IconButton, Tooltip, toRem, Badge } from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { useNavigate } from 'react-router';
import type { MatrixEvent } from '$types/matrix-sdk';
import {
  Direction,
  type EventTimeline,
  NotificationCountType,
  ThreadEvent,
  RoomEvent,
  EventType,
} from '$types/matrix-sdk';

import { useStateEvent } from '$hooks/useStateEvent';
import { PageHeader } from '$components/page';
import {
  ArrowLeft,
  ChatCircleDots,
  Chats,
  composerIcon,
  DotsThreeOutlineVerticalIcon,
  GridFour,
  MagnifyingGlass,
  PushPin,
  UserCircle,
} from '$components/icons/phosphor';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { UseStateProvider } from '$components/UseStateProvider';
import { RoomTopicViewer } from '$components/room-topic-viewer';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { useIsDirectRoom, useRoom } from '$hooks/useRoom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useSpaceOptionally } from '$hooks/useSpace';
import { getHomeSearchPath, getSpaceSearchPath, withSearchParam } from '$pages/pathUtils';
import { createLogger } from '$utils/debug';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '$utils/matrix';
import { type SearchPathSearchParams } from '$pages/paths';
import { useRoomAvatar, useRoomName, useRoomTopic } from '$hooks/useRoomMeta';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { ContainerColor } from '$styles/ContainerColor.css';
import { useRoomWidgets } from '$hooks/useRoomWidgets';
import { hasThreadRootAggregation, isThreadRelationEvent } from '$utils/room/relations';
import { callChatAtom } from '$state/callEmbed';
import { RoomSettingsPage } from '$state/roomSettings';
import { roomIdToThreadBrowserAtomFamily } from '$state/room/roomToThreadBrowser';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import { useCallPreferences } from '$state/hooks/callPreferences';
import { useCallStartCapabilities } from '$features/call/useCallStartCapabilities';
import { RoomPinMenu } from './room-pin-menu';
import * as css from './RoomViewHeader.css';
import { RoomCallButton } from './RoomCallButton';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

const log = createLogger('RoomViewHeader');

async function getPinsHash(pinnedIds: string[]): Promise<string> {
  const sorted = [...pinnedIds].toSorted().join(',');
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 10);
}

export interface PinReadMarker {
  hash: string;
  count: number;
  last_seen_id: string;
}

import { RoomMenu } from './RoomMenu';

export function RoomViewHeader({ callView }: Readonly<{ callView?: boolean }>) {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const space = useSpaceOptionally();
  const optionsMenu = useMenuAnchor<HTMLButtonElement>();
  const pinMenu = useMenuAnchor<HTMLButtonElement>();
  const direct = useIsDirectRoom();
  const [customDMCards] = useSetting(settingsAtom, 'customDMCards');
  const { microphone, video, sound } = useCallPreferences();

  const [chat, setChat] = useAtom(callChatAtom);
  const [threadBrowserOpen, setThreadBrowserOpen] = useAtom(
    roomIdToThreadBrowserAtomFamily(room.roomId)
  );
  const [openThreadId, setOpenThread] = useAtom(roomIdToOpenThreadAtomFamily(room.roomId));

  const callStartCapabilities = useCallStartCapabilities(room);
  const [alwaysShowCallButton] = useSetting(settingsAtom, 'alwaysShowCallButton');
  const shouldShowCallButton = alwaysShowCallButton || room.getJoinedMemberCount() <= 10;

  const encryptionEvent = useStateEvent(room, EventType.RoomEncryption);
  const encryptedRoom = !!encryptionEvent;
  const avatarMxc = useRoomAvatar(room, direct && !customDMCards);
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const avatarUrl = avatarMxc
    ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [peopleDrawer, setPeopleDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const [widgetDrawer, setWidgetDrawer] = useSetting(settingsAtom, 'isWidgetDrawer');
  const widgets = useRoomWidgets(room);

  const pinnedIds = useRoomPinnedEvents(room);
  const pinMarker = room
    .getAccountData(CustomAccountDataEvent.SablePinStatus)
    ?.getContent() as PinReadMarker;
  const [unreadPinsCount, setUnreadPinsCount] = useState(0);
  const [unreadThreadsCount, setUnreadThreadsCount] = useState(0);
  const [hasThreadHighlights, setHasThreadHighlights] = useState(false);

  const [currentHash, setCurrentHash] = useState('');

  useEffect(() => {
    getPinsHash(pinnedIds)
      .then(setCurrentHash)
      .catch((err) => {
        log.warn('Failed to compute pins hash:', err);
      });
  }, [pinnedIds]);

  useEffect(() => {
    const checkUnreads = async () => {
      if (!pinnedIds.length) {
        setUnreadPinsCount(0);
        return;
      }

      const hash = await getPinsHash(pinnedIds);

      if (pinMarker?.hash === hash) {
        setUnreadPinsCount(0);
        return;
      }

      const lastSeenIndex = pinnedIds.indexOf(pinMarker?.last_seen_id);
      if (lastSeenIndex === -1) {
        const oldCount = pinMarker?.count ?? 0;
        const startIndex = Math.max(0, oldCount - 1);
        const newCount = pinnedIds.length > 0 ? pinnedIds.length - startIndex : 0;
        setUnreadPinsCount(Math.max(0, newCount));
      } else {
        const newPins = pinnedIds.slice(lastSeenIndex + 1);
        setUnreadPinsCount(newPins.length);
      }
    };
    checkUnreads().catch((err) => {
      log.warn('Failed to check unread pins:', err);
    });
  }, [pinnedIds, pinMarker]);

  // Initialize Thread objects from room history on mount and create them for new timeline events
  useEffect(() => {
    const scanTimelineForThreads = (timeline: EventTimeline) => {
      const events = timeline.getEvents();
      const threadRoots = new Set<string>();

      // Scan for both:
      // 1. Events that ARE thread roots (have isThreadRoot = true or have replies)
      // 2. Events that are IN threads (have threadRootId)
      events.forEach((event: MatrixEvent) => {
        // Check if this event is an actual thread root. `isThreadRoot` can be
        // polluted by locally-created Thread shells, so require the server bundle.
        if (hasThreadRootAggregation(event)) {
          const rootId = event.getId();
          if (rootId && !room.getThread(rootId)) {
            threadRoots.add(rootId);
          }
        }

        // Check if this event is a reply in a thread
        const { threadRootId } = event;
        if (
          threadRootId &&
          isThreadRelationEvent(event, threadRootId) &&
          !room.getThread(threadRootId)
        ) {
          threadRoots.add(threadRootId);
        }
      });

      // Create Thread objects for discovered thread roots
      threadRoots.forEach((rootId) => {
        const rootEvent = room.findEventById(rootId);
        if (rootEvent) {
          room.createThread(rootId, rootEvent, [], false);
        }
      });
    };

    // Scan all existing timelines on mount
    const liveTimeline = room.getLiveTimeline();
    scanTimelineForThreads(liveTimeline);

    // Also scan backward timelines (historical messages already loaded)
    let backwardTimeline = liveTimeline.getNeighbouringTimeline(Direction.Backward);
    while (backwardTimeline) {
      scanTimelineForThreads(backwardTimeline);
      backwardTimeline = backwardTimeline.getNeighbouringTimeline(Direction.Backward);
    }

    // Listen for new timeline events (including pagination)
    const handleTimelineEvent = (mEvent: MatrixEvent) => {
      // Check if this event is an actual thread root. `isThreadRoot` can be
      // polluted by locally-created Thread shells, so require the server bundle.
      if (hasThreadRootAggregation(mEvent)) {
        const rootId = mEvent.getId();
        if (rootId && !room.getThread(rootId)) {
          const rootEvent = room.findEventById(rootId);
          if (rootEvent) {
            room.createThread(rootId, rootEvent, [], false);
          }
        }
      }

      // Check if this is a reply in a thread
      const { threadRootId } = mEvent;
      if (
        threadRootId &&
        isThreadRelationEvent(mEvent, threadRootId) &&
        !room.getThread(threadRootId)
      ) {
        const rootEvent = room.findEventById(threadRootId);
        if (rootEvent) {
          room.createThread(threadRootId, rootEvent, [], false);
        }
      }
    };

    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.off(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [room, mx]);

  // Count unread threads where user has participated
  useEffect(() => {
    const checkThreadUnreads = () => {
      // Use SDK's thread notification counting which respects user notification preferences,
      // properly distinguishes highlights (mentions) from regular messages, and handles muted threads
      const threads = room.getThreads();
      let totalCount = 0;

      // Sum up notification counts across all threads
      threads.forEach((thread) => {
        totalCount += room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Total);
      });

      // Use SDK's aggregate type to determine if any thread has highlights
      const aggregateType = room.threadsAggregateNotificationType;
      const hasHighlights = aggregateType === NotificationCountType.Highlight;

      setUnreadThreadsCount(totalCount);
      setHasThreadHighlights(hasHighlights);
    };

    checkThreadUnreads();

    // Listen for thread updates
    const onThreadUpdate = () => checkThreadUnreads();
    room.on(ThreadEvent.New, onThreadUpdate);
    room.on(ThreadEvent.Update, onThreadUpdate);
    room.on(ThreadEvent.NewReply, onThreadUpdate);

    return () => {
      room.off(ThreadEvent.New, onThreadUpdate);
      room.off(ThreadEvent.Update, onThreadUpdate);
      room.off(ThreadEvent.NewReply, onThreadUpdate);
    };
  }, [room, mx]);

  const handleSearchClick = () => {
    const searchParams: SearchPathSearchParams = {
      rooms: room.roomId,
    };
    const path = space
      ? getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))
      : getHomeSearchPath();
    navigate(withSearchParam(path, searchParams));
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    pinMenu.openAt(evt.currentTarget);

    const updateMarker = async () => {
      if (pinnedIds.length === 0) return;

      const hash = await getPinsHash(pinnedIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await mx.setRoomAccountData(room.roomId, CustomAccountDataEvent.SablePinStatus as any, {
        hash,
        count: pinnedIds.length,
        last_seen_id: pinnedIds.at(-1),
      });
    };

    updateMarker().catch((err) => {
      log.warn('Failed to update pin marker:', err);
    });
  };

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleMemberToggle = () => {
    if (callView) {
      openSettings(room.roomId, parentSpace?.roomId, RoomSettingsPage.MembersPage);
      return;
    }
    setPeopleDrawer(!peopleDrawer);
  };

  return (
    <PageHeader className={classNames(ContainerColor({ variant: 'Surface' }), css.HeaderBalance)}>
      <Box grow="Yes" gap="300">
        {screenSize === ScreenSize.Mobile && (
          <BackRouteHandler>
            {(onBack) => (
              <Box shrink="No" alignItems="Center">
                <IconButton fill="None" onClick={onBack}>
                  {composerIcon(ArrowLeft)}
                </IconButton>
              </Box>
            )}
          </BackRouteHandler>
        )}
        <Box grow="Yes" alignItems="Center" gap="300">
          {screenSize !== ScreenSize.Mobile && (
            <Avatar size="300">
              <RoomAvatar
                roomId={room.roomId}
                src={avatarUrl}
                alt={name}
                renderFallback={() => (
                  <RoomIcon
                    size="200"
                    joinRule={room.getJoinRule()}
                    roomType={room.getType()}
                    withOverlay={false}
                  />
                )}
              />
            </Avatar>
          )}
          <Box direction="Column">
            <Text size={topic ? 'H5' : 'H3'} truncate>
              {name}
            </Text>
            {topic && (
              <UseStateProvider initial={false}>
                {(viewTopic, setViewTopic) => (
                  <>
                    <ModalOverlay open={viewTopic} requestClose={() => setViewTopic(false)}>
                      <RoomTopicViewer
                        name={name}
                        topic={topic}
                        requestClose={() => setViewTopic(false)}
                      />
                    </ModalOverlay>
                    <Text
                      as="button"
                      type="button"
                      onClick={() => setViewTopic(true)}
                      className={css.HeaderTopic}
                      size="T200"
                      priority="300"
                      truncate
                    >
                      {topic}
                    </Text>
                  </>
                )}
              </UseStateProvider>
            )}
          </Box>
        </Box>

        <Box shrink="No">
          {(!room.isCallRoom() || chat) && (
            <>
              {!encryptedRoom && (
                <TooltipProvider
                  position="Bottom"
                  offset={4}
                  tooltip={
                    <Tooltip>
                      <Text>Search</Text>
                    </Tooltip>
                  }
                >
                  {(triggerRef) => (
                    <IconButton fill="None" ref={triggerRef} onClick={handleSearchClick}>
                      {composerIcon(MagnifyingGlass)}
                    </IconButton>
                  )}
                </TooltipProvider>
              )}
              <ResponsiveMenu
                anchor={pinMenu.anchor}
                requestClose={pinMenu.close}
                position="Bottom"
                align="Center"
                menu={
                  <RoomPinMenu room={room} requestClose={pinMenu.close} currentHash={currentHash} />
                }
              >
                <TooltipProvider
                  position="Bottom"
                  offset={4}
                  tooltip={
                    <Tooltip>
                      <Text>Pinned Messages</Text>
                    </Tooltip>
                  }
                >
                  {(triggerRef) => (
                    <IconButton
                      fill="None"
                      style={{ position: 'relative' }}
                      onClick={handleOpenPinMenu}
                      ref={triggerRef}
                      aria-pressed={!!pinMenu.anchor}
                    >
                      {unreadPinsCount > 0 && (
                        <Badge
                          style={{
                            position: 'absolute',
                            left: toRem(3),
                            top: toRem(3),
                          }}
                          variant="Secondary"
                          size="400"
                          fill="Solid"
                          radii="Pill"
                        >
                          <Text as="span" size="L400">
                            {unreadPinsCount}
                          </Text>
                        </Badge>
                      )}
                      {composerIcon(PushPin, { weight: pinMenu.anchor ? 'fill' : 'regular' })}
                    </IconButton>
                  )}
                </TooltipProvider>
              </ResponsiveMenu>
              {!room.isCallRoom() &&
                callStartCapabilities.canRenderCallButton &&
                shouldShowCallButton && (
                  <>
                    <RoomCallButton
                      room={room}
                      direct={direct}
                      kind="voice"
                      defaultPreferences={{ microphone, video, sound }}
                    />
                    <RoomCallButton
                      room={room}
                      direct={direct}
                      kind="video"
                      defaultPreferences={{ microphone, video, sound }}
                      allowVideoStart
                    />
                  </>
                )}
              <TooltipProvider
                position="Bottom"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>Threads</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton
                    fill="None"
                    ref={triggerRef}
                    onClick={() => {
                      // If a thread is open, close it and open thread browser
                      if (openThreadId) {
                        setOpenThread(undefined);
                        setThreadBrowserOpen(true);
                      } else {
                        // Otherwise, toggle the thread browser
                        setThreadBrowserOpen(!threadBrowserOpen);
                      }
                    }}
                    aria-pressed={threadBrowserOpen || !!openThreadId}
                    style={{ position: 'relative' }}
                  >
                    {unreadThreadsCount > 0 && (
                      <Badge
                        style={{
                          position: 'absolute',
                          left: toRem(3),
                          top: toRem(3),
                        }}
                        variant={hasThreadHighlights ? 'Critical' : 'Secondary'}
                        size="400"
                        fill="Solid"
                        radii="Pill"
                      >
                        <Text as="span" size="L400">
                          {unreadThreadsCount}
                        </Text>
                      </Badge>
                    )}
                    {composerIcon(Chats, { weight: threadBrowserOpen ? 'fill' : 'regular' })}
                  </IconButton>
                )}
              </TooltipProvider>
            </>
          )}

          {screenSize === ScreenSize.Desktop && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{widgetDrawer ? 'Hide Widgets' : 'Show Widgets'}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={() => setWidgetDrawer((d) => !d)}
                  style={{ position: 'relative' }}
                >
                  {widgets.length > 0 && (
                    <Badge
                      style={{
                        position: 'absolute',
                        left: toRem(3),
                        top: toRem(3),
                      }}
                      variant="Secondary"
                      size="400"
                      fill="Solid"
                      radii="Pill"
                    >
                      <Text as="span" size="L400">
                        {widgets.length}
                      </Text>
                    </Badge>
                  )}
                  {composerIcon(GridFour, { weight: widgetDrawer ? 'fill' : 'regular' })}
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {screenSize === ScreenSize.Desktop && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  {callView ? (
                    <Text>Members</Text>
                  ) : (
                    <Text>{peopleDrawer ? 'Hide Members' : 'Show Members'}</Text>
                  )}
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton fill="None" ref={triggerRef} onClick={handleMemberToggle}>
                  {composerIcon(UserCircle, { weight: peopleDrawer ? 'fill' : 'regular' })}
                </IconButton>
              )}
            </TooltipProvider>
          )}

          {callView && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{chat ? 'Hide Chat' : 'Show Chat'}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={() => {
                    setChat(!chat);
                  }}
                >
                  {composerIcon(ChatCircleDots, { weight: chat ? 'fill' : 'regular' })}
                </IconButton>
              )}
            </TooltipProvider>
          )}

          <ResponsiveMenu
            anchor={optionsMenu.anchor}
            requestClose={optionsMenu.close}
            position="Bottom"
            align="End"
            menu={<RoomMenu room={room} requestClose={optionsMenu.close} />}
          >
            <TooltipProvider
              position="Bottom"
              align="End"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>More Options</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  onClick={optionsMenu.triggerProps.onClick}
                  ref={triggerRef}
                  aria-pressed={!!optionsMenu.anchor}
                >
                  {composerIcon(DotsThreeOutlineVerticalIcon, {
                    weight: optionsMenu.anchor ? 'fill' : 'regular',
                  })}
                </IconButton>
              )}
            </TooltipProvider>
          </ResponsiveMenu>
        </Box>
      </Box>
    </PageHeader>
  );
}
