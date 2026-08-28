import type { MouseEventHandler, MouseEvent } from 'react';
import { forwardRef, startTransition, useState, useEffect } from 'react';
import type { Room } from '$types/matrix-sdk';
import { RoomEvent as RoomEventEnum } from '$types/matrix-sdk';
import {
  Avatar,
  Box,
  IconButton,
  Text,
  Menu,
  config,
  toRem,
  Line,
  Badge,
  Spinner,
  Tooltip,
} from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { useFocusWithin, useHover } from 'react-aria';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router';
import { NavButton, NavItem, NavItemContent, NavItemOptions } from '$components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '$components/unread-badge';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { getDirectRoomAvatarUrl, getDmOtherMember, getRoomAvatarUrl } from '$utils/room/display';
import { roomHaveUnread } from '$utils/room/unread';
import { nameInitials } from '$utils/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { copyToClipboard } from '$utils/dom';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { useRoomTypingMember } from '$hooks/useRoomTypingMembers';
import { TypingIndicator } from '$components/typing-indicator';

import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

import {
  ChatCircleDots,
  Checks,
  chipIcon,
  DotsThreeOutlineVerticalIcon,
  GearSix,
  Link,
  menuIcon,
  Phone,
  SignOut,
  UserPlus,
} from '$components/icons/phosphor';
import { Copy as CopyIcon } from '@phosphor-icons/react';
import { MobileMenuItem } from '$components/MobileMenuItem';
import {
  RoomNotificationMode,
  roomNotificationModeChipIcon,
  roomNotificationModeIcon,
} from '$hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '$components/RoomNotificationSwitcher';

import { InviteUserPrompt } from '$components/invite-user-prompt';
import { DirectInvitePrompt } from '$components/direct-invite-prompt';
import { AsyncStatus } from '$hooks/useAsyncCallback';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useRoomName, useRoomTopic } from '$hooks/useRoomMeta';
import { nicknamesAtom } from '$state/nicknames';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { warmupRoomDecryption } from '$utils/decryptScheduler';
import { useMobileTapActivation } from '$hooks/useMobileTapActivation';
import { useOpenMobileDrawerContent } from '$components/page/MobileNavDrawerContext';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useRoomMenuActions } from '$hooks/useRoomMenuActions';

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
import * as css from './styles.css';

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
    const {
      handleMarkAsRead: hookMarkAsRead,
      handleInvite: hookInvite,
      handleCopyLink: hookCopyLink,
      handleOpenSettings: hookOpenSettings,
      handleLeaveRoom: hookLeaveRoom,
      canInvite,
      unread,
      invitePrompt,
      setInvitePrompt,
      directInvitePrompt,
      handleInviteDirect,
      handleDirectInviteCancel,
      handleConvertAndInvite,
      convertState,
    } = useRoomMenuActions(room);

    const mx = useMatrixClient();
    const isMobile = useScreenSizeContext() === ScreenSize.Mobile;

    const handleMarkAsRead = () => {
      hookMarkAsRead();
      requestClose();
    };

    const handleInvite = hookInvite;

    const handleCopyName = () => {
      const roomName = mx.getRoom(room.roomId)?.name || 'Room';
      copyToClipboard(roomName);
      requestClose();
    };

    const handleCopyLink = () => {
      hookCopyLink();
      requestClose();
    };

    const handleRoomSettings = () => {
      hookOpenSettings();
      requestClose();
    };

    const handleLeaveRoom = async () => {
      if (await hookLeaveRoom()) requestClose();
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
        {directInvitePrompt && (
          <DirectInvitePrompt
            onCancel={() => handleDirectInviteCancel(requestClose)}
            onInviteDirect={handleInviteDirect}
            onConvertAndInvite={handleConvertAndInvite}
            converting={convertState.status === AsyncStatus.Loading}
            convertError={
              convertState.status === AsyncStatus.Error ? convertState.error.message : undefined
            }
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MobileMenuItem
            isMobile={isMobile}
            onClick={handleMarkAsRead}
            size="300"
            after={menuIcon(Checks)}
            radii="300"
            disabled={!unread}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Mark as Read
            </Text>
          </MobileMenuItem>
          <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
            {(handleOpen, opened, changing) => (
              <MobileMenuItem
                isMobile={isMobile}
                size="300"
                after={
                  changing ? (
                    <Spinner size="100" variant="Secondary" />
                  ) : (
                    roomNotificationModeIcon(notificationMode)
                  )
                }
                radii="300"
                aria-pressed={opened}
                onClick={handleOpen}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Notifications
                </Text>
              </MobileMenuItem>
            )}
          </RoomNotificationModeSwitcher>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MobileMenuItem
            isMobile={isMobile}
            onClick={handleInvite}
            variant="Primary"
            fill="None"
            size="300"
            after={menuIcon(UserPlus)}
            radii="300"
            aria-pressed={invitePrompt}
            disabled={!canInvite}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Invite
            </Text>
          </MobileMenuItem>
          <MobileMenuItem
            isMobile={isMobile}
            onClick={handleCopyLink}
            size="300"
            after={menuIcon(Link)}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Copy Link
            </Text>
          </MobileMenuItem>
          <MobileMenuItem
            isMobile={isMobile}
            onClick={handleCopyName}
            size="300"
            after={menuIcon(CopyIcon)}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Copy Room Name
            </Text>
          </MobileMenuItem>
          <MobileMenuItem
            isMobile={isMobile}
            onClick={handleRoomSettings}
            size="300"
            after={menuIcon(GearSix)}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Room Settings
            </Text>
          </MobileMenuItem>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MobileMenuItem
            isMobile={isMobile}
            onClick={handleLeaveRoom}
            variant="Critical"
            fill="None"
            size="300"
            after={menuIcon(SignOut)}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Leave Room
            </Text>
          </MobileMenuItem>
        </Box>
      </Menu>
    );
  }
);

const hideTextStyling = (isHidden: boolean | undefined) =>
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
  isStrict?: boolean;
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
  isStrict,
  joinCallOnSingleClick,
}: RoomNavItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });

  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const hasRoomUnread = useRoomHasUnread(room);
  const typingMember = useRoomTypingMember(room.roomId).filter(
    (receipt) => receipt.userId !== mx.getUserId()
  );

  const [roomIconOverlay] = useSetting(settingsAtom, 'roomIconOverlay');
  const nicknames = useAtomValue(nicknamesAtom);
  const dmUserId = direct ? getDmOtherMember(mx, room)?.userId : undefined;
  const matrixRoomName = useRoomName(room);
  const roomName = (dmUserId && nicknames[dmUserId]) || matrixRoomName;
  const presence = useUserPresence(dmUserId ?? '');
  const getRoomTopic = useRoomTopic(room);
  const roomTopic = direct ? ((customDMCards && getRoomTopic) ?? presence?.status) : undefined;

  const { navigateRoom } = useRoomNavigate();
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const openMobileDrawerContent = useOpenMobileDrawerContent();

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const startCall = useCallStart(direct);
  const callEmbed = useCallEmbed();
  const callPref = useAtomValue(useCallPreferencesAtom());
  const [isChatOpen, setChatOpen] = useAtom(callChatAtom);
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  const avatarSrc =
    ((!direct || customDMCards) && getRoomAvatarUrl(mx, room, 96, useAuthentication)) ||
    (direct && getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)) ||
    undefined;

  const isActiveCall = callEmbed?.roomId === room.roomId;

  const menu = useMenuAnchor<HTMLElement>();

  const contextMenuHandler: MouseEventHandler<HTMLElement> = (evt) => {
    if (isMobile) {
      evt.preventDefault();
      menu.triggerProps.onContextMenu(evt);
      return;
    }
    menu.triggerProps.onContextMenu(evt);
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    menu.triggerProps.onClick(evt);
  };

  const handleNavItemClick: MouseEventHandler<HTMLElement> = (evt) => {
    if (menu.consumeLongPressFired() || menu.anchor) return;
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
      if (isMobile && openMobileDrawerContent) {
        openMobileDrawerContent(linkPath);
      } else {
        // Render the room off the urgent path so the tap doesn't freeze the UI on mount.
        startTransition(() => {
          void navigate(linkPath);
        });
      }
    }
  };

  const mobileTapActivation = useMobileTapActivation(
    isMobile && !room.isCallRoom(),
    () => {
      if (openMobileDrawerContent) {
        openMobileDrawerContent(linkPath);
      } else {
        navigate(linkPath);
      }
    },
    handleNavItemClick
  );

  const handleChatButtonClick = (evt: MouseEvent<HTMLButtonElement>) => {
    evt.stopPropagation();
    setChatOpen(!isChatOpen);
    navigate(linkPath);
  };

  const optionsVisible = hover || !!menu.anchor;
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
        style={{
          ...hideTextStyling(hideText),
          marginTop: hideText ? toRem(5) : '0',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <NavItem
          variant="Background"
          radii="400"
          highlight={shouldShowUnreadIndicator}
          aria-selected={selected}
          data-hover={!!menu.anchor || menu.isPressing}
          onContextMenu={contextMenuHandler}
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
                onClick={mobileTapActivation.onClick}
                onPointerDown={(evt) => {
                  warmupRoomDecryption(mx, room.roomId);
                  mobileTapActivation.onPointerDown(evt);
                }}
                onPointerMove={mobileTapActivation.onPointerMove}
                onPointerUp={mobileTapActivation.onPointerUp}
                onPointerCancel={mobileTapActivation.onPointerCancel}
                onTouchStart={menu.triggerProps.onTouchStart}
                onTouchEnd={menu.triggerProps.onTouchEnd}
                onTouchMove={menu.triggerProps.onTouchMove}
                onTouchCancel={menu.triggerProps.onTouchCancel}
                aria-label={ariaLabel}
                ref={triggerRef}
                style={{
                  ...hideTextStyling(hideText),
                  WebkitTapHighlightColor: 'transparent',
                }}
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
                        {showAvatar || (avatarSrc && isStrict) ? (
                          <RoomAvatar
                            roomId={room.roomId}
                            src={avatarSrc}
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
                            size={isStrict && hideText ? '300' : '200'}
                            joinRule={room.getJoinRule()}
                            roomType={room.getType()}
                            withOverlay={roomIconOverlay}
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
                          <span className={css.NavItemChipIcon} aria-label={notificationMode}>
                            {roomNotificationModeChipIcon(notificationMode)}
                          </span>
                        )}
                        {(room.isCallRoom() || direct) &&
                          callMembers.length > 0 &&
                          !optionsVisible && (
                            <Badge variant="Critical" fill="Solid" size="400">
                              <Box alignItems="Center" gap="100">
                                {chipIcon(Phone)}
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
                      {chipIcon(ChatCircleDots, { weight: isChatOpen ? 'fill' : 'regular' })}
                    </IconButton>
                  )}
                </TooltipProvider>
              )}
              <ResponsiveMenu
                anchor={menu.anchor}
                requestClose={menu.close}
                position="Bottom"
                align={menu.anchor?.width === 0 ? 'Start' : 'End'}
                offset={menu.anchor?.width === 0 ? 0 : undefined}
                menu={
                  <RoomNavItemMenu
                    room={room}
                    requestClose={menu.close}
                    notificationMode={notificationMode}
                  />
                }
              >
                {!hideText && (
                  <IconButton
                    onClick={handleOpenMenu}
                    aria-pressed={!!menu.anchor}
                    aria-controls={`menu-${room.roomId}`}
                    aria-label="More Options"
                    variant="Background"
                    fill="None"
                    size="300"
                    radii="300"
                  >
                    {chipIcon(DotsThreeOutlineVerticalIcon, {
                      weight: menu.anchor ? 'fill' : 'regular',
                    })}
                  </IconButton>
                )}
              </ResponsiveMenu>
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
