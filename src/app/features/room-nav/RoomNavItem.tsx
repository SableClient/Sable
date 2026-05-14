import type { MouseEventHandler, MouseEvent } from 'react';
import { forwardRef, useState, useEffect } from 'react';
import type { Room } from '$types/matrix-sdk';
import { RoomEvent as RoomEventEnum } from '$types/matrix-sdk';
import type { RectCords } from 'folds';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Text,
  Menu,
  MenuItem,
  config,
  PopOut,
  toRem,
  Line,
  Badge,
  Spinner,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { useFocusWithin, useHover } from 'react-aria';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { NavButton, NavItem, NavItemContent, NavItemOptions } from '$components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '$components/unread-badge';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl, roomHaveUnread } from '$utils/room';
import { nameInitials } from '$utils/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { copyToClipboard } from '$utils/dom';
import { markAsRead } from '$utils/notifications';
import { UseStateProvider } from '$components/UseStateProvider';
import { LeaveRoomPrompt } from '$components/leave-room-prompt';
import { useRoomTypingMember } from '$hooks/useRoomTypingMembers';
import { TypingIndicator } from '$components/typing-indicator';
import { stopPropagation } from '$utils/keyboard';
import { getMatrixToRoom } from '$plugins/matrix-to';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '$utils/matrix';
import { getViaServers } from '$plugins/via-servers';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { useSpaceOptionally } from '$hooks/useSpace';
import {
  getRoomNotificationModeIcon,
  RoomNotificationMode,
} from '$hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '$components/RoomNotificationSwitcher';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useRoomName, useRoomTopic } from '$hooks/useRoomMeta';
import { nicknamesAtom } from '$state/nicknames';
import { useRoomNavigate } from '$hooks/useRoomNavigate';

// Call Hooks & Plugins
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useCallEmbed, useCallStart } from '$hooks/useCallEmbed';
import { callChatAtom } from '$state/callEmbed';
import { useCallPreferencesAtom } from '$state/hooks/callPreferences';
import { CallControlState } from '$plugins/call/CallControlState';
import { useAutoDiscoveryInfo } from '$hooks/useAutoDiscoveryInfo';
import { livekitSupport } from '$hooks/useLivekitSupport';
import { Presence, useUserPresence } from '$hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '$components/presence';
import { RoomNavUser } from './RoomNavUser';
import { SidebarUnreadBadge } from '$components/sidebar';

/**
 * Reactively checks whether a room has unread messages.
 */
function useRoomHasUnread(room: Room): boolean {
  const mx = useMatrixClient();
  const [hasUnread, setHasUnread] = useState(() => roomHaveUnread(mx, room));

  useEffect(() => {
    const update = () => setHasUnread(roomHaveUnread(mx, room));
    room.on(RoomEventEnum.Timeline, update);
    room.on(RoomEventEnum.Receipt, update);
    return () => {
      room.removeListener(RoomEventEnum.Timeline, update);
      room.removeListener(RoomEventEnum.Receipt, update);
    };
  }, [room, mx]);

  return hasUnread;
}

type RoomNavItemMenuProps = {
  room: Room;
  requestClose: () => void;
  notificationMode?: RoomNotificationMode;
};

const RoomNavItemMenu = forwardRef<HTMLDivElement, RoomNavItemMenuProps>(
  ({ room, requestClose, notificationMode }, ref) => {
    const mx = useMatrixClient();
    const [hideReads] = useSetting(settingsAtom, 'hideReads');
    const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
    const powerLevels = usePowerLevels(room);
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const openRoomSettings = useOpenRoomSettings();
    const space = useSpaceOptionally();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleMarkAsRead = () => {
      markAsRead(mx, room.roomId, hideReads);
      requestClose();
    };

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleCopyLink = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
      const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
      copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
      requestClose();
    };

    const handleRoomSettings = () => {
      openRoomSettings(room.roomId, space?.roomId);
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
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
            onClick={handleRoomSettings}
            size="300"
            after={<Icon size="100" src={Icons.Setting} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Room Settings
            </Text>
          </MenuItem>
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
  }
);

export const hideTextStyling = (isHidden: boolean | undefined) =>
  isHidden ? { width: '100%', height: '100%', padding: '0', paddingTop: '0px' } : {};

type RoomNavItemProps = {
  room: Room;
  selected: boolean;
  linkPath: string;
  notificationMode?: RoomNotificationMode;
  showAvatar?: boolean;
  direct?: boolean;
  customDMCards?: boolean;
  hideText?: boolean;
  joinCallOnSingleClick?: boolean;
};

export function RoomNavItem({
  room,
  selected,
  showAvatar,
  direct,
  customDMCards,
  notificationMode,
  linkPath,
  hideText,
  joinCallOnSingleClick,
}: RoomNavItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const hasRoomUnread = useRoomHasUnread(room);
  const typingMember = useRoomTypingMember(room.roomId).filter(
    (receipt) => receipt.userId !== mx.getUserId()
  );

  const nicknames = useAtomValue(nicknamesAtom);
  const dmUserId = direct ? room.getAvatarFallbackMember()?.userId : undefined;
  const matrixRoomName = useRoomName(room);
  const roomName = (dmUserId && nicknames[dmUserId]) || matrixRoomName;
  const presence = useUserPresence(dmUserId ?? '');
  const getRoomTopic = useRoomTopic(room);
  const roomTopic = direct ? ((customDMCards && getRoomTopic) ?? presence?.status) : undefined;

  const { navigateRoom } = useRoomNavigate();
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const startCall = useCallStart(direct);
  const callEmbed = useCallEmbed();
  const callPref = useAtomValue(useCallPreferencesAtom());
  const [isChatOpen, setChatOpen] = useAtom(callChatAtom);
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  const isActiveCall = callEmbed?.roomId === room.roomId;

  const handleContextMenu: MouseEventHandler<HTMLElement> = (evt) => {
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleNavItemClick: MouseEventHandler<HTMLElement> = (evt) => {
    if (room.isCallRoom()) {
      if (!livekitSupport(autoDiscoveryInfo) && callMembers.length === 0) return;
      if (callEmbed && !isActiveCall) return;

      if (!isMobile && !hideText) {
        if (!isActiveCall && !callEmbed && joinCallOnSingleClick) {
          startCall(
            room,
            new CallControlState(callPref.microphone, callPref.video, callPref.sound)
          );
        } else {
          navigateRoom(room.roomId);
        }
      } else {
        evt.stopPropagation();
        if (isChatOpen) setChatOpen(false);
        navigateRoom(room.roomId);
      }
    } else {
      navigate(linkPath);
    }
  };

  const handleChatButtonClick = (evt: MouseEvent<HTMLButtonElement>) => {
    evt.stopPropagation();
    setChatOpen(!isChatOpen);
    navigate(linkPath);
  };

  const optionsVisible = hover || !!menuAnchor;
  const isMutedRoom = notificationMode === RoomNotificationMode.Mute;
  const shouldShowUnreadIndicator = !isMutedRoom && (!!unread || hasRoomUnread);

  let unreadCount = 0;
  if (unread) {
    unreadCount = unread.highlight > 0 ? unread.highlight : unread.total;
  }

  const ariaLabel = [
    roomName,
    room.isCallRoom()
      ? [
          'Call Room',
          isActiveCall && 'Currently in Call',
          callMembers.length && `${callMembers.length} in Call`,
        ]
      : 'Text Room',
    unread?.total && `${unread.total} Messages`,
  ]
    .flat()
    .filter(Boolean)
    .join(', ');
  return (
    <>
      <Box
        direction="Column"
        grow="Yes"
        style={{ ...hideTextStyling(hideText), marginTop: hideText ? toRem(5) : '0' }}
      >
        <NavItem
          variant="Background"
          radii="400"
          highlight={shouldShowUnreadIndicator}
          aria-selected={selected}
          data-hover={!!menuAnchor}
          onContextMenu={handleContextMenu}
          {...hoverProps}
          {...focusWithinProps}
          style={hideTextStyling(hideText)}
        >
          <TooltipProvider
            position="Right"
            offset={4}
            tooltip={
              hideText && (
                <Tooltip>
                  <Text>{roomName}</Text>
                </Tooltip>
              )
            }
          >
            {(triggerRef) => (
              <NavButton
                onClick={handleNavItemClick}
                aria-label={ariaLabel}
                ref={triggerRef}
                style={hideTextStyling(hideText)}
              >
                <NavItemContent style={hideTextStyling(hideText)}>
                  <Box
                    as="span"
                    grow="Yes"
                    alignItems="Center"
                    justifyContent="Start"
                    gap="200"
                    style={hideTextStyling(hideText)}
                  >
                    <AvatarPresence
                      badge={
                        presence &&
                        presence.presence !== Presence.Offline && (
                          <PresenceBadge
                            presence={presence.presence}
                            size={hideText ? '300' : '200'}
                          />
                        )
                      }
                      style={hideTextStyling(hideText)}
                    >
                      <Avatar
                        size={hideText ? undefined : '200'}
                        radii="400"
                        style={hideTextStyling(hideText)}
                      >
                        {showAvatar ? (
                          <RoomAvatar
                            roomId={room.roomId}
                            src={
                              ((!direct || customDMCards) &&
                                getRoomAvatarUrl(mx, room, 96, useAuthentication)) ||
                              getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
                            }
                            uniformIcons
                            alt={roomName}
                            renderFallback={() => (
                              <Text as="span" size="H6">
                                {nameInitials(roomName)}
                              </Text>
                            )}
                          />
                        ) : (
                          <RoomIcon
                            style={{
                              opacity:
                                unread || hasRoomUnread || isActiveCall
                                  ? config.opacity.P500
                                  : config.opacity.P300,
                            }}
                            filled={selected || isActiveCall}
                            size="100"
                            joinRule={room.getJoinRule()}
                            roomType={room.getType()}
                          />
                        )}
                      </Avatar>
                    </AvatarPresence>
                    {unread && hideText && (
                      <SidebarUnreadBadge
                        highlight={unread.highlight > 0}
                        count={unread.highlight > 0 ? unread.highlight : unread.total}
                      />
                    )}

                    {!hideText && (
                      <>
                        <Box as="span" grow="Yes" direction="Column">
                          <Text
                            priority={unread || hasRoomUnread || isActiveCall ? '500' : '400'}
                            as="span"
                            size="Inherit"
                            truncate
                          >
                            {roomName}
                          </Text>
                          {roomTopic && (
                            <Text
                              truncate
                              size="T200"
                              priority="300"
                              style={{
                                opacity: config.opacity.P300,
                                marginTop: '-2px',
                              }}
                            >
                              {roomTopic}
                            </Text>
                          )}
                        </Box>
                        {!optionsVisible && !unread && !selected && typingMember.length > 0 && (
                          <Badge size="300" variant="Secondary" fill="Soft" radii="Pill" outlined>
                            <TypingIndicator size="300" disableAnimation />
                          </Badge>
                        )}
                        {!optionsVisible && shouldShowUnreadIndicator && (
                          <UnreadBadgeCenter>
                            <UnreadBadge
                              highlight={!!unread && unread.highlight > 0}
                              count={unreadCount}
                              dm={direct}
                            />
                          </UnreadBadgeCenter>
                        )}
                        {!optionsVisible && notificationMode !== RoomNotificationMode.Unset && (
                          <Icon
                            size="50"
                            src={getRoomNotificationModeIcon(notificationMode)}
                            aria-label={notificationMode}
                          />
                        )}
                        {(room.isCallRoom() || direct) &&
                          callMembers.length > 0 &&
                          !optionsVisible && (
                            <Badge variant="Critical" fill="Solid" size="400">
                              <Box alignItems="Center" gap="100">
                                <Icon size="50" src={Icons.Phone} color="Inherit" />
                                <Text as="span" size="L400" truncate>
                                  {direct ? 'Calling' : `${callMembers.length} Live`}
                                </Text>
                              </Box>
                            </Badge>
                          )}
                      </>
                    )}
                  </Box>
                </NavItemContent>
              </NavButton>
            )}
          </TooltipProvider>
          {optionsVisible && !hideText && (
            <NavItemOptions>
              {(room.isCallRoom() || (direct && callMembers.length > 0)) && (
                <TooltipProvider
                  position="Bottom"
                  offset={4}
                  tooltip={
                    <Tooltip>
                      <Text>{isChatOpen ? 'Hide Chat' : 'Show Chat'}</Text>
                    </Tooltip>
                  }
                >
                  {(triggerRef) => (
                    <IconButton
                      ref={triggerRef}
                      data-testid="chat-button"
                      onClick={handleChatButtonClick}
                      aria-pressed={isChatOpen && selected}
                      aria-label="Open Chat"
                      variant="Background"
                      fill="None"
                      size="300"
                      radii="300"
                    >
                      <Icon size="50" src={Icons.Message} filled={isChatOpen} />
                    </IconButton>
                  )}
                </TooltipProvider>
              )}
              <PopOut
                id={`menu-${room.roomId}`}
                aria-expanded={!!menuAnchor}
                anchor={menuAnchor}
                offset={menuAnchor?.width === 0 ? 0 : undefined}
                alignOffset={menuAnchor?.width === 0 ? 0 : -5}
                position="Bottom"
                align={menuAnchor?.width === 0 ? 'Start' : 'End'}
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
                    <RoomNavItemMenu
                      room={room}
                      requestClose={() => setMenuAnchor(undefined)}
                      notificationMode={notificationMode}
                    />
                  </FocusTrap>
                }
              >
                {!hideText && (
                  <IconButton
                    onClick={handleOpenMenu}
                    aria-pressed={!!menuAnchor}
                    aria-controls={`menu-${room.roomId}`}
                    aria-label="More Options"
                    variant="Background"
                    fill="None"
                    size="300"
                    radii="300"
                  >
                    <Icon size="50" src={Icons.VerticalDots} />
                  </IconButton>
                )}
              </PopOut>
            </NavItemOptions>
          )}
        </NavItem>
      </Box>
      {room.isCallRoom() && (
        <Box
          direction="Column"
          style={{ paddingLeft: hideText ? config.space.S0 : config.space.S200 }}
        >
          {callMembers.map((callMembership) => (
            <RoomNavUser
              key={callMembership.membershipID}
              room={room}
              callMembership={callMembership}
              hideText={hideText}
            />
          ))}
        </Box>
      )}
    </>
  );
}
