import { MouseEventHandler, forwardRef, useCallback, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue } from 'jotai';
import {
  Box,
  Avatar,
  Text,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  IconButton,
  Icon,
  Icons,
  Tooltip,
  TooltipProvider,
  Menu,
  MenuItem,
  toRem,
  config,
  Line,
  PopOut,
  RectCords,
  Badge,
  Spinner,
} from 'folds';
import { useNavigate } from 'react-router-dom';
import {
  EventTimeline,
  Room,
  ThreadEvent,
  RoomEvent,
  MatrixEvent,
  NotificationCountType,
} from '$types/matrix-sdk';

import { useStateEvent } from '$hooks/useStateEvent';
import { PageHeader } from '$components/page';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { UseStateProvider } from '$components/UseStateProvider';
import { RoomTopicViewer } from '$components/room-topic-viewer';
import { StateEvent } from '$types/matrix/room';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useIsDirectRoom, useRoom } from '$hooks/useRoom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useSpaceOptionally } from '$hooks/useSpace';
import { getHomeSearchPath, getSpaceSearchPath, withSearchParam } from '$pages/pathUtils';
import { createLogger } from '$utils/debug';
import {
  getCanonicalAliasOrRoomId,
  isRoomAlias,
  mxcUrlToHttp,
  removeRoomIdFromMDirect,
} from '$utils/matrix';
import { type SearchPathSearchParams } from '$pages/paths';
import { useRoomUnread } from '$state/hooks/unread';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { markAsRead } from '$utils/notifications';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { copyToClipboard } from '$utils/dom';
import { LeaveRoomPrompt } from '$components/leave-room-prompt';
import { useRoomAvatar, useRoomName, useRoomTopic } from '$hooks/useRoomMeta';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { getMatrixToRoom } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { RoomNotificationModeSwitcher } from '$components/RoomNotificationSwitcher';
import {
  getRoomNotificationMode,
  getRoomNotificationModeIcon,
  useRoomsNotificationPreferencesContext,
} from '$hooks/useRoomsNotificationPreferences';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { ContainerColor } from '$styles/ContainerColor.css';
import { useRoomWidgets } from '$hooks/useRoomWidgets';
import { AccountDataEvent } from '$types/matrix/accountData';
import { DirectInvitePrompt } from '$components/direct-invite-prompt';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { mDirectAtom } from '$state/mDirectList';
import { callChatAtom } from '$state/callEmbed';
import { RoomSettingsPage } from '$state/roomSettings';
import { roomIdToThreadBrowserAtomFamily } from '$state/room/roomToThreadBrowser';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import { JumpToTime } from './jump-to-time';
import { RoomPinMenu } from './room-pin-menu';
import * as css from './RoomViewHeader.css';
import { RoomCallButton } from './RoomCallButton';

const log = createLogger('RoomViewHeader');

async function getPinsHash(pinnedIds: string[]): Promise<string> {
  const sorted = [...pinnedIds].sort().join(',');
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

type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const mDirects = useAtomValue(mDirectAtom);
  const isDirectConversation = mDirects.has(room.roomId);
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);
  const { navigateRoom } = useRoomNavigate();

  const [invitePrompt, setInvitePrompt] = useState(false);
  const [directInvitePrompt, setDirectInvitePrompt] = useState(false);

  const handleMarkAsRead = () => {
    markAsRead(mx, room.roomId, hideReads);
    requestClose();
  };

  const handleInvite = () => {
    if (isDirectConversation) {
      setDirectInvitePrompt(true);
      return;
    }
    setInvitePrompt(true);
  };

  const handleInviteDirect = () => {
    setDirectInvitePrompt(false);
    setInvitePrompt(true);
  };

  const [convertState, convertToRoom] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      await removeRoomIdFromMDirect(mx, room.roomId);
    }, [mx, room.roomId])
  );

  const handleConvertAndInvite = () => {
    if (convertState.status === AsyncStatus.Loading) return;
    convertToRoom().catch(() => {});
  };

  useEffect(() => {
    if (convertState.status === AsyncStatus.Success) {
      setDirectInvitePrompt(false);
      setInvitePrompt(true);
    }
  }, [convertState.status]);

  const handleCopyLink = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
    requestClose();
  };

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleOpenSettings = () => {
    openSettings(room.roomId, parentSpace?.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      {invitePrompt && (
        <InviteUserPrompt
          room={room}
          requestClose={() => {
            setInvitePrompt(false);
            requestClose();
          }}
        />
      )}
      {directInvitePrompt && (
        <DirectInvitePrompt
          onCancel={() => {
            setDirectInvitePrompt(false);
            requestClose();
          }}
          onInviteDirect={handleInviteDirect}
          onConvertAndInvite={handleConvertAndInvite}
          converting={convertState.status === AsyncStatus.Loading}
          convertError={
            convertState.status === AsyncStatus.Error ? convertState.error.message : undefined
          }
        />
      )}
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={<Icon size="100" src={Icons.CheckTwice} />}
          radii="300"
          disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Mark as Read
          </Text>
        </MenuItem>
        <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
          {(handleOpen, opened, changing) => (
            <MenuItem
              size="300"
              after={
                changing ? (
                  <Spinner size="100" variant="Secondary" />
                ) : (
                  <Icon size="100" src={getRoomNotificationModeIcon(notificationMode)} />
                )
              }
              radii="300"
              aria-pressed={opened}
              onClick={handleOpen}
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                Notifications
              </Text>
            </MenuItem>
          )}
        </RoomNotificationModeSwitcher>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleInvite}
          variant="Primary"
          fill="None"
          size="300"
          after={<Icon size="100" src={Icons.UserPlus} />}
          radii="300"
          aria-pressed={invitePrompt}
          disabled={!canInvite}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Invite
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleCopyLink}
          size="300"
          after={<Icon size="100" src={Icons.Link} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Copy Link
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleOpenSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Room Settings
          </Text>
        </MenuItem>
        <UseStateProvider initial={false}>
          {(promptJump, setPromptJump) => (
            <>
              <MenuItem
                onClick={() => setPromptJump(true)}
                size="300"
                after={<Icon size="100" src={Icons.RecentClock} />}
                radii="300"
                aria-pressed={promptJump}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Jump to Time
                </Text>
              </MenuItem>
              {promptJump && (
                <JumpToTime
                  onSubmit={(eventId) => {
                    setPromptJump(false);
                    navigateRoom(room.roomId, eventId);
                    requestClose();
                  }}
                  onCancel={() => setPromptJump(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <UseStateProvider initial={false}>
          {(promptLeave, setPromptLeave) => (
            <>
              <MenuItem
                onClick={() => setPromptLeave(true)}
                variant="Critical"
                fill="None"
                size="300"
                after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                radii="300"
                aria-pressed={promptLeave}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Leave Room
                </Text>
              </MenuItem>
              {promptLeave && (
                <LeaveRoomPrompt
                  roomId={room.roomId}
                  onDone={requestClose}
                  onCancel={() => setPromptLeave(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
      </Box>
    </Menu>
  );
});
RoomMenu.displayName = 'RoomMenu';

export function RoomViewHeader({ callView }: { callView?: boolean }) {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const space = useSpaceOptionally();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const direct = useIsDirectRoom();

  const [chat, setChat] = useAtom(callChatAtom);
  const [threadBrowserOpen, setThreadBrowserOpen] = useAtom(
    roomIdToThreadBrowserAtomFamily(room.roomId)
  );
  const [openThreadId, setOpenThread] = useAtom(roomIdToOpenThreadAtomFamily(room.roomId));

  const canUseCalls = room
    .getLiveTimeline()
    .getState(EventTimeline.FORWARDS)
    ?.maySendStateEvent('org.matrix.msc3401.call.member', mx.getUserId()!);

  const encryptionEvent = useStateEvent(room, StateEvent.RoomEncryption);
  const encryptedRoom = !!encryptionEvent;
  const avatarMxc = useRoomAvatar(room, direct);
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
    .getAccountData(AccountDataEvent.SablePinStatus)
    ?.getContent() as PinReadMarker;
  const [unreadPinsCount, setUnreadPinsCount] = useState(0);
  const [unreadThreadsCount, setUnreadThreadsCount] = useState(0);
  const [hasThreadHighlights, setHasThreadHighlights] = useState(false);

  const [currentHash, setCurrentHash] = useState<string>('');

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
      if (lastSeenIndex !== -1) {
        const newPins = pinnedIds.slice(lastSeenIndex + 1);
        setUnreadPinsCount(newPins.length);
      } else {
        const oldCount = pinMarker?.count ?? 0;
        const startIndex = Math.max(0, oldCount - 1);
        const newCount = pinnedIds.length > 0 ? pinnedIds.length - startIndex : 0;
        setUnreadPinsCount(Math.max(0, newCount));
      }
    };
    checkUnreads().catch((err) => {
      log.warn('Failed to check unread pins:', err);
    });
  }, [pinnedIds, pinMarker]);

  // Initialize Thread objects from room history on mount and create them for new timeline events
  useEffect(() => {
    const scanTimelineForThreads = (timeline: any) => {
      const events = timeline.getEvents();
      const threadRoots = new Set<string>();

      // Scan for both:
      // 1. Events that ARE thread roots (have isThreadRoot = true or have replies)
      // 2. Events that are IN threads (have threadRootId)
      events.forEach((event: MatrixEvent) => {
        // Check if this event is a thread root
        if (event.isThreadRoot) {
          const rootId = event.getId();
          if (rootId && !room.getThread(rootId)) {
            threadRoots.add(rootId);
          }
        }

        // Check if this event is a reply in a thread
        const { threadRootId } = event;
        if (threadRootId && !room.getThread(threadRootId)) {
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
    let backwardTimeline = liveTimeline.getNeighbouringTimeline('b' as any);
    while (backwardTimeline) {
      scanTimelineForThreads(backwardTimeline);
      backwardTimeline = backwardTimeline.getNeighbouringTimeline('b' as any);
    }

    // Listen for new timeline events (including pagination)
    const handleTimelineEvent = (mEvent: MatrixEvent) => {
      // Check if this event is a thread root
      if (mEvent.isThreadRoot) {
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
      if (threadRootId && !room.getThread(threadRootId)) {
        const rootEvent = room.findEventById(threadRootId);
        if (rootEvent) {
          room.createThread(threadRootId, rootEvent, [], false);
        }
      }
    };

    mx.on(RoomEvent.Timeline as any, handleTimelineEvent);
    return () => {
      mx.off(RoomEvent.Timeline as any, handleTimelineEvent);
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
    room.on(ThreadEvent.New as any, onThreadUpdate);
    room.on(ThreadEvent.Update as any, onThreadUpdate);
    room.on(ThreadEvent.NewReply as any, onThreadUpdate);

    return () => {
      room.off(ThreadEvent.New as any, onThreadUpdate);
      room.off(ThreadEvent.Update as any, onThreadUpdate);
      room.off(ThreadEvent.NewReply as any, onThreadUpdate);
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

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());

    const updateMarker = async () => {
      if (pinnedIds.length === 0) return;

      const hash = await getPinsHash(pinnedIds);
      await mx.setRoomAccountData(room.roomId, AccountDataEvent.SablePinStatus, {
        hash,
        count: pinnedIds.length,
        last_seen_id: pinnedIds[pinnedIds.length - 1],
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
    <PageHeader
      className={ContainerColor({ variant: 'Surface' })}
      balance={screenSize === ScreenSize.Mobile}
    >
      <Box grow="Yes" gap="300">
        {screenSize === ScreenSize.Mobile && (
          <BackRouteHandler>
            {(onBack) => (
              <Box shrink="No" alignItems="Center">
                <IconButton fill="None" onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
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
                  <RoomIcon size="200" joinRule={room.getJoinRule()} roomType={room.getType()} />
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
                    <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                      <OverlayCenter>
                        <FocusTrap
                          focusTrapOptions={{
                            initialFocus: false,
                            clickOutsideDeactivates: true,
                            onDeactivate: () => setViewTopic(false),
                            escapeDeactivates: stopPropagation,
                          }}
                        >
                          <RoomTopicViewer
                            name={name}
                            topic={topic}
                            requestClose={() => setViewTopic(false)}
                          />
                        </FocusTrap>
                      </OverlayCenter>
                    </Overlay>
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
                      <Icon size="400" src={Icons.Search} />
                    </IconButton>
                  )}
                </TooltipProvider>
              )}
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
                    aria-pressed={!!pinMenuAnchor}
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
                    <Icon size="400" src={Icons.Pin} filled={!!pinMenuAnchor} />
                  </IconButton>
                )}
              </TooltipProvider>
              {canUseCalls && <RoomCallButton room={room} />}
              <PopOut
                anchor={pinMenuAnchor}
                position="Bottom"
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      returnFocusOnDeactivate: false,
                      onDeactivate: () => setPinMenuAnchor(undefined),
                      clickOutsideDeactivates: true,
                      isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                      isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <RoomPinMenu
                      room={room}
                      requestClose={() => setPinMenuAnchor(undefined)}
                      currentHash={currentHash}
                    />
                  </FocusTrap>
                }
              />
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
                    <Icon size="400" src={Icons.Thread} filled={threadBrowserOpen} />
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
                  <Icon size="400" src={Icons.Category} filled={widgetDrawer} />
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
                  <Icon size="400" src={Icons.User} filled={peopleDrawer} />
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
                  <Icon size="400" src={Icons.Message} filled={chat} />
                </IconButton>
              )}
            </TooltipProvider>
          )}

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
                onClick={handleOpenMenu}
                ref={triggerRef}
                aria-pressed={!!menuAnchor}
              >
                <Icon size="400" src={Icons.VerticalDots} filled={!!menuAnchor} />
              </IconButton>
            )}
          </TooltipProvider>
          <PopOut
            anchor={menuAnchor}
            position="Bottom"
            align="End"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <RoomMenu room={room} requestClose={() => setMenuAnchor(undefined)} />
              </FocusTrap>
            }
          />
        </Box>
      </Box>
    </PageHeader>
  );
}
