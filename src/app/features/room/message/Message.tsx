import {
  Avatar,
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  as,
  config,
} from 'folds';

import {
  MouseEventHandler,
  MouseEvent,
  PointerEvent,
  ReactNode,
  memo,
  useCallback,
  useRef,
  useState,
  useEffect,
  useMemo,
} from 'react';
import FocusTrap from 'focus-trap-react';
import { useHover, useFocusWithin } from 'react-aria';
import {
  EventStatus,
  MatrixEvent,
  Room,
  Relations,
  RoomPinnedEventsEventContent,
} from '$types/matrix-sdk';
import classNames from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  AvatarBase,
  BubbleLayout,
  CompactLayout,
  MessageBase,
  ModernLayout,
  PronounPill,
  Time,
  Username,
  UsernameBold,
} from '$components/message';
import { canEditEvent, getEventEdits, getMemberAvatarMxc } from '$utils/room';
import { mxcUrlToHttp } from '$utils/matrix';
import { getSettings, MessageLayout, MessageSpacing, settingsAtom } from '$state/settings';
import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { EmojiBoard } from '$components/emoji-board';
import { UserAvatar } from '$components/user-avatar';
import { copyToClipboard } from '$utils/dom';
import { stopPropagation } from '$utils/keyboard';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { MemberPowerTag, StateEvent } from '$types/matrix/room';
import { PowerIcon } from '$components/power';
import { getPowerTagIconSrc } from '$hooks/useMemberPowerTag';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { SwipeableMessageWrapper } from '$components/SwipeableMessageWrapper';
import { mobileOrTablet } from '$utils/user-agent';
import { useUserProfile } from '$hooks/useUserProfile';
import { useSetting } from '$state/hooks/settings';
import { useBlobCache } from '$hooks/useBlobCache';
import { MessageAllReactionItem } from '$components/message/modals/MessageReactions';
import { MessageReadReceiptItem } from '$components/message/modals/MessageReadRecipts';
import { MessageEditHistoryItem } from '$components/message/modals/MessageEditHistory';
import { MessageSourceCodeItem } from '$components/message/modals/MessageSource';
import { MessageForwardItem } from '$components/message/modals/MessageForward';
import { MessageDeleteItem } from '$components/message/modals/MessageDelete';
import { MessageReportItem } from '$components/message/modals/MessageReport';
import { filterPronounsByLanguage } from '$utils/pronouns';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import {
  addStickerToDefaultPack,
  doesStickerExistInDefaultPack,
} from '$utils/addStickerToDefaultStickerPack';
import { MessageEditor } from './MessageEditor';
import * as css from './styles.css';

export type ReactionHandler = (keyOrMxc: string, shortcode: string) => void;

const MemoizedBody = memo(({ children }: { children: ReactNode }) => children);
type MessageQuickReactionsProps = {
  onReaction: ReactionHandler;
};
export const MessageQuickReactions = as<'div', MessageQuickReactionsProps>(
  ({ onReaction, ...props }, ref) => {
    const mx = useMatrixClient();
    const recentEmojis = useRecentEmoji(mx, 4);

    if (recentEmojis.length === 0) return <span />;
    return (
      <>
        <Box
          style={{ padding: config.space.S200 }}
          alignItems="Center"
          justifyContent="Center"
          gap="200"
          {...props}
          ref={ref}
        >
          {recentEmojis.map((emoji) => (
            <IconButton
              key={emoji.unicode}
              className={css.MessageQuickReaction}
              size="300"
              variant="SurfaceVariant"
              radii="Pill"
              title={emoji.shortcode}
              aria-label={emoji.shortcode}
              onClick={() => onReaction(emoji.unicode, emoji.shortcode)}
            >
              <Text size="T500">{emoji.unicode}</Text>
            </IconButton>
          ))}
        </Box>
        <Line size="300" />
      </>
    );
  }
);

export const MessageCopyLinkItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const handleCopy = () => {
    const eventId = mEvent.getId();
    if (!eventId) return;
    copyToClipboard(getMatrixToRoomEvent(room.roomId, eventId, getViaServers(room)));
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Link} />}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Copy Link
      </Text>
    </MenuItem>
  );
});

// message pinning
export const MessagePinItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const pinnedEvents = useRoomPinnedEvents(room);
  const isPinned = pinnedEvents.includes(mEvent.getId() ?? '');

  const handlePin = () => {
    const eventId = mEvent.getId();
    const pinContent: RoomPinnedEventsEventContent = {
      pinned: Array.from(pinnedEvents).filter((id) => id !== eventId),
    };
    if (!isPinned && eventId) {
      pinContent.pinned.push(eventId);
    }
    mx.sendStateEvent(room.roomId, StateEvent.RoomPinnedEvents as any, pinContent);
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Pin} />}
      radii="300"
      onClick={handlePin}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {isPinned ? 'Unpin Message' : 'Pin Message'}
      </Text>
    </MenuItem>
  );
});

export type ForwardedMessageProps = {
  originalTimestamp: number;
  isForwarded: boolean;
  originalRoomId: string;
  originalEventId: string;
  originalEventPrivate: boolean;
};

export type MessageProps = {
  room: Room;
  mEvent: MatrixEvent;
  collapse: boolean;
  highlight: boolean;
  notifyHighlight?: 'silent' | 'loud';
  edit?: boolean;
  canDelete?: boolean;
  canSendReaction?: boolean;
  canPinEvent?: boolean;
  imagePackRooms?: Room[];
  relations?: Relations;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  onUserClick: MouseEventHandler<HTMLButtonElement>;
  onUsernameClick: MouseEventHandler<HTMLButtonElement>;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onEditId?: (eventId?: string) => void;
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
  reply?: ReactNode;
  reactions?: ReactNode;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  memberPowerTag?: MemberPowerTag;
  hour24Clock: boolean;
  dateFormatString: string;
  senderId: string;
  senderDisplayName: string;
  content?: string;
  activeReplyId?: string | null;
  sendStatus?: EventStatus | null;
  onResend?: (event: MatrixEvent) => void;
  onDeleteFailedSend?: (event: MatrixEvent) => void;
  messageForwardedProps?: ForwardedMessageProps;
};

function useMobileDoubleTap(callback: () => void, delay = 300) {
  const lastTapRef = useRef<number>(0);

  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (e: PointerEvent<HTMLElement>) => {
      if (!mobileOrTablet()) return;

      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;

      if (timeSinceLastTap < delay && timeSinceLastTap > 0) {
        callback();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    },
    [callback, delay]
  );
}

const Pronouns = as<
  'span',
  {
    pronouns?: any[];
    tagColor: string;
  }
>(({ as: AsPronouns = 'span', pronouns, tagColor, ...props }, ref) => {
  if (!pronouns || pronouns.length === 0) return null;

  const languageFilterEnabled = Boolean(getSettings().filterPronounsBasedOnLanguage ?? false);
  // if no language is given use english
  const selectedLanguages = (getSettings().filterPronounsLanguages ?? ['en'])
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);

  const visiblePronouns = filterPronounsByLanguage(
    pronouns,
    languageFilterEnabled,
    selectedLanguages
  );

  const clamp = (str: string, len: number) => (str.length > len ? `${str.slice(0, len)}...` : str);
  const limit = mobileOrTablet() ? 1 : 3;

  // if language specific pronouns can't be found matching the filter return unfiltered
  if (visiblePronouns.length === 0) {
    visiblePronouns.push(...pronouns);
  }

  return (
    <AsPronouns {...props} ref={ref}>
      {visiblePronouns.slice(0, limit).map((p) => (
        <PronounPill key={p.summary} style={{ color: tagColor }}>
          {clamp(p.summary, 16)}
        </PronounPill>
      ))}
      {visiblePronouns.length > limit && <PronounPill style={{ color: tagColor }}>...</PronounPill>}
    </AsPronouns>
  );
});

function MessageInternal(
  {
    className,
    room,
    mEvent,
    collapse,
    highlight,
    notifyHighlight,
    edit,
    canDelete,
    canSendReaction,
    canPinEvent,
    imagePackRooms,
    relations,
    messageLayout,
    messageSpacing,
    onUserClick,
    onUsernameClick,
    onReplyClick,
    onReactionToggle,
    onEditId,
    reply,
    reactions,
    hideReadReceipts,
    showDeveloperTools,
    memberPowerTag,
    hour24Clock,
    dateFormatString,
    children,
    senderId,
    senderDisplayName,
    activeReplyId,
    sendStatus,
    onResend,
    onDeleteFailedSend,
    messageForwardedProps,
    ...props
  }: MessageProps & { className?: string; children?: ReactNode },
  ref: any
) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const pmp = useMemo(
    () =>
      mEvent.event.content?.['com.beeper.per_message_profile'] as
        | {
            avatar_url: string | undefined;
            displayname: string | undefined;
            id: string | undefined;
          }
        | undefined,
    [mEvent]
  );

  // Profiles and Colors
  const profile = useUserProfile(senderId, room);
  const { color: usernameColor, font: usernameFont } = useSableCosmetics(senderId, room);

  // Avatars
  // Prefer the room-scoped member avatar (m.room.member) over the global profile
  // avatar so per-room avatar overrides are respected in the timeline.
  const avatarUrl = useMemo(() => {
    if (collapse) return undefined;
    const mxc = pmp?.avatar_url || getMemberAvatarMxc(room, senderId) || profile.avatarUrl;
    return mxc ? mxcUrlToHttp(mx, mxc, useAuthentication, 48, 48, 'crop') : undefined;
  }, [pmp, collapse, profile.avatarUrl, senderId, mx, room, useAuthentication]);

  const displayName = useMemo(
    () => pmp?.displayname || senderDisplayName,
    [pmp, senderDisplayName]
  );

  const cachedAvatar = useBlobCache(avatarUrl ?? undefined);

  // UI State
  const [isDesktopHover, setIsDesktopHover] = useState(false);
  const { hoverProps } = useHover({
    onHoverChange: (h) => {
      if (!mobileOrTablet()) setIsDesktopHover(h);
    },
  });
  const { focusWithinProps } = useFocusWithin({
    onFocusWithinChange: (f) => {
      if (!mobileOrTablet()) setIsDesktopHover(f);
    },
  });

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();
  const [nickEditOpen, setNickEditOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const nicknames = useAtomValue(nicknamesAtom);
  const setNickname = useSetAtom(setNicknameAtom);

  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;

  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [showPronouns] = useSetting(settingsAtom, 'showPronouns');
  const [useRightBubbles] = useSetting(settingsAtom, 'useRightBubbles');

  useEffect(() => {
    if (!mobileOptionsOpen) return undefined;
    const handleClickOutside = (e: globalThis.Event) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setMobileOptionsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside, { capture: true });
    return () => document.removeEventListener('pointerdown', handleClickOutside, { capture: true });
  }, [mobileOptionsOpen]);

  const headerJSX = !collapse && (
    <Box
      gap="300"
      direction={messageLayout === MessageLayout.Compact ? 'RowReverse' : 'Row'}
      justifyContent="SpaceBetween"
      alignItems="Baseline"
      grow="Yes"
    >
      <Box alignItems="Center" gap="100">
        <Username
          as="button"
          style={{
            color: usernameColor,
            fontFamily: usernameFont,
          }}
          data-user-id={senderId}
          onContextMenu={onUserClick}
          onClick={onUsernameClick}
        >
          <Text as="span" size={messageLayout === MessageLayout.Bubble ? 'T300' : 'T400'} truncate>
            <UsernameBold>{displayName}</UsernameBold>
          </Text>
        </Username>
        {showPronouns && (
          <Pronouns pronouns={profile.pronouns} tagColor={usernameColor ?? 'currentColor'} />
        )}
        {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
      </Box>
      <Box shrink="No" gap="100">
        {messageLayout === MessageLayout.Modern && isDesktopHover && (
          <>
            <Text as="span" size="T200" priority="300">
              {senderId}
            </Text>
            <Text as="span" size="T200" priority="300">
              |
            </Text>
          </>
        )}
        <Time
          ts={mEvent.getTs()}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      </Box>
    </Box>
  );

  const avatarJSX = !collapse && messageLayout !== MessageLayout.Compact && (
    <AvatarBase
      className={messageLayout === MessageLayout.Bubble ? css.BubbleAvatarBase : undefined}
    >
      <Avatar
        className={css.MessageAvatar}
        as="button"
        size="300"
        data-user-id={senderId}
        onClick={onUserClick}
      >
        <UserAvatar
          userId={senderId}
          src={cachedAvatar}
          alt={displayName}
          renderFallback={() => <Icon size="200" src={Icons.User} filled />}
        />
      </Avatar>
    </AvatarBase>
  );

  const stableContent = useMemo(() => mEvent.getContent().body || '', [mEvent]);
  const isPendingSend =
    sendStatus === EventStatus.ENCRYPTING ||
    sendStatus === EventStatus.QUEUED ||
    sendStatus === EventStatus.SENDING;
  const isFailedSend = sendStatus === EventStatus.NOT_SENT;
  const canResend = isFailedSend && senderId === mx.getUserId() && !!onResend;
  const canDeleteFailedSend = isFailedSend && senderId === mx.getUserId() && !!onDeleteFailedSend;
  // handle clicks on mentions in the message body (e.g. jump to original message from a forwarded message notice)
  const mentionClickHandler = useMentionClickHandler(room.roomId);

  const handleResendClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      onResend?.(mEvent);
    },
    [mEvent, onResend]
  );

  const handleDeleteFailedSendClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      onDeleteFailedSend?.(mEvent);
    },
    [mEvent, onDeleteFailedSend]
  );

  const MSG_CONTENT_STYLE = { maxWidth: '100%' };

  const msgContentJSX = (
    <Box
      direction="Column"
      alignSelf="Start"
      style={MSG_CONTENT_STYLE}
      className={classNames({
        [css.MessagePending]: isPendingSend,
        [css.MessageFailed]: isFailedSend,
      })}
    >
      {messageForwardedProps?.isForwarded && (
        <Chip as="div" variant="SurfaceVariant" radii="Pill">
          <Text size="T200" priority="300">
            Forwarded{' '}
            {messageForwardedProps.originalEventPrivate ? 'private message' : 'from another room'}{' '}
            {!messageForwardedProps.originalEventPrivate && (
              <a
                href={getMatrixToRoomEvent(
                  messageForwardedProps.originalRoomId,
                  messageForwardedProps.originalEventId
                )}
                rel="noreferrer noopener"
                data-mention-id={messageForwardedProps.originalRoomId}
                data-mention-event-id={messageForwardedProps.originalEventId}
                onClick={mentionClickHandler}
              >
                jump to original
              </a>
            )}
            <Time
              ts={messageForwardedProps?.originalTimestamp ?? 0}
              compact={messageLayout === MessageLayout.Compact}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              style={{ marginLeft: config.space.S100, justifyContent: 'flex-end' }}
            />
          </Text>
        </Chip>
      )}
      {reply}
      {edit && onEditId ? (
        <MessageEditor
          style={{
            maxWidth: '100%',
            width: '100vw',
          }}
          roomId={room.roomId}
          room={room}
          mEvent={mEvent}
          imagePackRooms={imagePackRooms}
          onCancel={() => onEditId()}
        />
      ) : (
        <MemoizedBody key={stableContent}>{children}</MemoizedBody>
      )}
      {reactions}
      {isFailedSend && (
        <Box className={css.SendStatusRow}>
          <Text size="T200" priority="300">
            Failed to send.
          </Text>
          {canResend && (
            <Chip type="button" variant="Primary" radii="Pill" outlined onClick={handleResendClick}>
              <Text size="B300">Retry</Text>
            </Chip>
          )}
          {canDeleteFailedSend && (
            <Chip
              type="button"
              variant="Critical"
              radii="Pill"
              onClick={handleDeleteFailedSendClick}
            >
              <Text size="B300">Delete</Text>
            </Chip>
          )}
        </Box>
      )}
    </Box>
  );

  const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
    if (mobileOrTablet()) {
      evt.preventDefault();
      return;
    }

    if (evt.altKey || !window.getSelection()?.isCollapsed || edit) return;
    const tag = (evt.target as any).tagName;
    if (typeof tag === 'string' && tag.toLowerCase() === 'a') return;
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
    const rect = target.getBoundingClientRect();

    window.requestAnimationFrame(() => {
      setMenuAnchor(rect);
    });
  };

  const closeMenu = () => {
    setMenuAnchor(undefined);
    setNickEditOpen(false);
    setMobileOptionsOpen(false);
  };

  const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
    setEmojiBoardAnchor(target.getBoundingClientRect());
  };

  const handleAddReactions: MouseEventHandler<HTMLButtonElement> = () => {
    const rect = menuAnchor;
    closeMenu();
    setTimeout(() => {
      setEmojiBoardAnchor(rect);
    }, 100);
  };

  const handleSwipeReply = () => {
    const currentId = mEvent.getId();
    const targetId = activeReplyId === currentId ? null : currentId;
    const mockEvent = {
      currentTarget: {
        getAttribute: (attr: string) => (attr === 'data-event-id' ? targetId : null),
      },
    } as unknown as MouseEvent<HTMLButtonElement>;

    onReplyClick(mockEvent);
  };

  const onDoubleTap = useMobileDoubleTap(() => {
    setMobileOptionsOpen(true);
  });

  const isThreadedMessage = mEvent.threadRootId !== undefined;
  const isStickerMessage = mEvent.getType() === 'm.sticker';

  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = edits !== undefined;

  return (
    <MessageBase
      className={classNames(css.MessageBase, className, {
        [css.MessageBaseBubbleCollapsed]: messageLayout === MessageLayout.Bubble && collapse,
      })}
      tabIndex={0}
      space={messageSpacing}
      collapse={collapse}
      highlight={highlight}
      notifyHighlight={notifyHighlight}
      selected={!!menuAnchor || !!emojiBoardAnchor}
      {...props}
      {...hoverProps}
      {...focusWithinProps}
      ref={ref}
    >
      {!edit && (isDesktopHover || !!menuAnchor || !!emojiBoardAnchor || mobileOptionsOpen) && (
        <div className={css.MessageOptionsBase} ref={optionsRef}>
          <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
            <Box gap="100">
              {canSendReaction && (
                <PopOut
                  position="Bottom"
                  align={emojiBoardAnchor?.width === 0 ? 'Start' : 'End'}
                  offset={emojiBoardAnchor?.width === 0 ? 0 : undefined}
                  anchor={emojiBoardAnchor}
                  content={
                    <EmojiBoard
                      imagePackRooms={imagePackRooms ?? []}
                      returnFocusOnDeactivate={false}
                      allowTextCustomEmoji
                      onEmojiSelect={(key) => {
                        onReactionToggle(mEvent.getId()!, key);
                        setEmojiBoardAnchor(undefined);
                        setMobileOptionsOpen(false);
                      }}
                      onCustomEmojiSelect={(mxc, shortcode) => {
                        onReactionToggle(mEvent.getId()!, mxc, shortcode);
                        setEmojiBoardAnchor(undefined);
                        setMobileOptionsOpen(false);
                      }}
                      requestClose={() => {
                        setEmojiBoardAnchor(undefined);
                      }}
                    />
                  }
                >
                  <IconButton
                    onClick={handleOpenEmojiBoard}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    aria-pressed={!!emojiBoardAnchor}
                  >
                    <Icon src={Icons.SmilePlus} size="100" />
                  </IconButton>
                </PopOut>
              )}
              <IconButton
                onClick={(ev) => {
                  onReplyClick(ev);
                  setMobileOptionsOpen(false);
                }}
                data-event-id={mEvent.getId()}
                variant="SurfaceVariant"
                size="300"
                radii="300"
              >
                <Icon src={Icons.ReplyArrow} size="100" />
              </IconButton>
              {!isThreadedMessage && (
                <IconButton
                  onClick={(ev) => {
                    if (activeReplyId === mEvent.getId()) {
                      ev.currentTarget.setAttribute('data-event-id', '');
                    }
                    onReplyClick(ev, true);
                    setMobileOptionsOpen(false);
                  }}
                  data-event-id={mEvent.getId()}
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                >
                  <Icon src={Icons.ThreadPlus} size="100" />
                </IconButton>
              )}
              {canEditEvent(mx, mEvent) && onEditId && (
                <IconButton
                  onClick={() => {
                    onEditId(mEvent.getId());
                    setMobileOptionsOpen(false);
                  }}
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                >
                  <Icon src={Icons.Pencil} size="100" />
                </IconButton>
              )}
              <PopOut
                anchor={menuAnchor}
                position="Bottom"
                align={menuAnchor?.width === 0 ? 'Start' : 'End'}
                offset={menuAnchor?.width === 0 ? 0 : undefined}
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setMenuAnchor(undefined),
                      clickOutsideDeactivates: true,
                      isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                      isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu>
                      {canSendReaction && (
                        <MessageQuickReactions
                          onReaction={(key, shortcode) => {
                            onReactionToggle(mEvent.getId()!, key, shortcode);
                            closeMenu();
                          }}
                        />
                      )}
                      <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                        {canSendReaction && (
                          <MenuItem
                            size="300"
                            after={<Icon size="100" src={Icons.SmilePlus} />}
                            radii="300"
                            onClick={handleAddReactions}
                          >
                            <Text
                              className={css.MessageMenuItemText}
                              as="span"
                              size="T300"
                              truncate
                            >
                              Add Reaction
                            </Text>
                          </MenuItem>
                        )}
                        {isStickerMessage &&
                          !doesStickerExistInDefaultPack(mx, mEvent.getContent().url) && (
                            <MenuItem
                              size="300"
                              after={<Icon size="100" src={Icons.Star} />}
                              radii="300"
                              onClick={() => {
                                addStickerToDefaultPack(
                                  mx,
                                  `sticker-${mEvent.getId()}`,
                                  mEvent.getContent().url,
                                  mEvent.getContent().body,
                                  mEvent.getContent().info
                                );
                                closeMenu();
                              }}
                            >
                              <Text
                                className={css.MessageMenuItemText}
                                as="span"
                                size="T300"
                                truncate
                              >
                                Add to User Sticker Pack
                              </Text>
                            </MenuItem>
                          )}
                        {relations && <MessageAllReactionItem room={room} relations={relations} />}
                        <MenuItem
                          size="300"
                          after={<Icon size="100" src={Icons.ReplyArrow} />}
                          radii="300"
                          data-event-id={mEvent.getId()}
                          onClick={(evt: any) => {
                            onReplyClick(evt);
                            closeMenu();
                          }}
                        >
                          <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                            Reply
                          </Text>
                        </MenuItem>
                        {!isThreadedMessage && (
                          <MenuItem
                            size="300"
                            after={<Icon src={Icons.ThreadPlus} size="100" />}
                            radii="300"
                            data-event-id={mEvent.getId()}
                            onClick={(evt: any) => {
                              onReplyClick(evt, true);
                              closeMenu();
                            }}
                          >
                            <Text
                              className={css.MessageMenuItemText}
                              as="span"
                              size="T300"
                              truncate
                            >
                              Reply in Thread
                            </Text>
                          </MenuItem>
                        )}
                        {canEditEvent(mx, mEvent) && onEditId && (
                          <MenuItem
                            size="300"
                            after={<Icon size="100" src={Icons.Pencil} />}
                            radii="300"
                            data-event-id={mEvent.getId()}
                            onClick={() => {
                              onEditId(mEvent.getId());
                              closeMenu();
                            }}
                          >
                            <Text
                              className={css.MessageMenuItemText}
                              as="span"
                              size="T300"
                              truncate
                            >
                              Edit Message
                            </Text>
                          </MenuItem>
                        )}
                        {!hideReadReceipts && (
                          <MessageReadReceiptItem room={room} eventId={mEvent.getId() ?? ''} />
                        )}
                        {isEdited && (
                          <MessageEditHistoryItem
                            room={room}
                            mEvent={mEvent}
                            closeMenu={closeMenu}
                          />
                        )}
                        {showDeveloperTools && (
                          <MessageSourceCodeItem room={room} mEvent={mEvent} />
                        )}
                        <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
                        <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
                        {canPinEvent && (
                          <MessagePinItem room={room} mEvent={mEvent} onClose={closeMenu} />
                        )}
                        {senderId !== mx.getUserId() &&
                          (nickEditOpen ? (
                            <Box
                              direction="Column"
                              gap="100"
                              style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                            >
                              <Text size="L400">Nickname</Text>
                              <input
                                // eslint-disable-next-line jsx-a11y/no-autofocus
                                autoFocus
                                value={nickDraft}
                                onChange={(e) => setNickDraft(e.target.value)}
                                placeholder={displayName}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setNickname(senderId, nickDraft || undefined, mx);
                                    closeMenu();
                                  }
                                  if (e.key === 'Escape') closeMenu();
                                }}
                                style={{
                                  background: 'var(--mx-c-surface)',
                                  color: 'var(--mx-c-on-surface)',
                                  border: '1px solid var(--mx-c-outline)',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '14px',
                                  width: '100%',
                                  outline: 'none',
                                }}
                              />
                              <Box gap="200">
                                <MenuItem
                                  size="300"
                                  radii="300"
                                  variant="Success"
                                  fill="None"
                                  onClick={() => {
                                    setNickname(senderId, nickDraft || undefined, mx);
                                    closeMenu();
                                  }}
                                >
                                  <Text size="B300">Save</Text>
                                </MenuItem>
                                {nicknames[senderId] && (
                                  <MenuItem
                                    size="300"
                                    radii="300"
                                    variant="Critical"
                                    fill="None"
                                    onClick={() => {
                                      setNickname(senderId, undefined, mx);
                                      closeMenu();
                                    }}
                                  >
                                    <Text size="B300">Clear</Text>
                                  </MenuItem>
                                )}
                              </Box>
                            </Box>
                          ) : (
                            <MenuItem
                              size="300"
                              after={<Icon size="100" src={Icons.Pencil} />}
                              radii="300"
                              onClick={() => {
                                setNickDraft(nicknames[senderId] ?? '');
                                setNickEditOpen(true);
                              }}
                            >
                              <Text
                                className={css.MessageMenuItemText}
                                as="span"
                                size="T300"
                                truncate
                              >
                                {nicknames[senderId] ? 'Edit Nickname' : 'Set Nickname'}
                              </Text>
                            </MenuItem>
                          ))}
                      </Box>
                      {((!mEvent.isRedacted() && canDelete) ||
                        mEvent.getSender() !== mx.getUserId()) && (
                        <>
                          <Line size="300" />
                          <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                            {!mEvent.isRedacted() && canDelete && (
                              <MessageDeleteItem room={room} mEvent={mEvent} />
                            )}
                            {mEvent.getSender() !== mx.getUserId() && (
                              <MessageReportItem room={room} mEvent={mEvent} />
                            )}
                          </Box>
                        </>
                      )}
                    </Menu>
                  </FocusTrap>
                }
              >
                <IconButton
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                  onClick={handleOpenMenu}
                  aria-pressed={!!menuAnchor}
                >
                  <Icon src={Icons.VerticalDots} size="100" />
                </IconButton>
              </PopOut>
            </Box>
          </Menu>
        </div>
      )}
      {messageLayout === MessageLayout.Compact && (
        <SwipeableMessageWrapper onReply={handleSwipeReply}>
          <CompactLayout before={headerJSX} onContextMenu={handleContextMenu}>
            <div onPointerDown={onDoubleTap}>{msgContentJSX}</div>
          </CompactLayout>
        </SwipeableMessageWrapper>
      )}
      {messageLayout === MessageLayout.Bubble && (
        <SwipeableMessageWrapper onReply={handleSwipeReply}>
          <BubbleLayout
            before={avatarJSX}
            header={headerJSX}
            onContextMenu={handleContextMenu}
            align={useRightBubbles && senderId === mx.getUserId() ? 'right' : 'left'}
          >
            <div onPointerDown={onDoubleTap}>{msgContentJSX}</div>
          </BubbleLayout>
        </SwipeableMessageWrapper>
      )}
      {messageLayout !== MessageLayout.Compact && messageLayout !== MessageLayout.Bubble && (
        <SwipeableMessageWrapper onReply={handleSwipeReply}>
          <ModernLayout before={avatarJSX} onContextMenu={handleContextMenu}>
            <div onPointerDown={onDoubleTap}>
              {headerJSX}
              {msgContentJSX}
            </div>
          </ModernLayout>
        </SwipeableMessageWrapper>
      )}
    </MessageBase>
  );
}

const MessageAs = as<'div', MessageProps>(MessageInternal);
export const Message = memo(MessageAs);

export type EventProps = {
  room: Room;
  mEvent: MatrixEvent;
  highlight: boolean;
  notifyHighlight?: 'silent' | 'loud';
  canDelete?: boolean;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  messageSpacing: MessageSpacing;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
};
export const Event = as<'div', EventProps>(
  (
    {
      className,
      room,
      mEvent,
      highlight,
      notifyHighlight,
      canDelete,
      onReplyClick,
      messageSpacing,
      hideReadReceipts,
      showDeveloperTools,
      children,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const stateEvent = typeof mEvent.getStateKey() === 'string';

    const [menuAnchor, setMenuAnchor] = useState<RectCords>();
    const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

    const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
      if (mobileOrTablet()) {
        evt.preventDefault();
        return;
      }

      if (evt.altKey || !window.getSelection()?.isCollapsed) return;
      const tag = (evt.target as any).tagName;
      if (typeof tag === 'string' && tag.toLowerCase() === 'a') return;
      evt.preventDefault();
      setMenuAnchor({
        x: evt.clientX,
        y: evt.clientY,
        width: 0,
        height: 0,
      });
    };

    const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
      const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
      const rect = target.getBoundingClientRect();

      window.requestAnimationFrame(() => {
        setMenuAnchor(rect);
      });
    };

    const closeMenu = () => {
      setMenuAnchor(undefined);
      setMobileOptionsOpen(false);
    };

    const [isDesktopHover, setIsDesktopHover] = useState(false);
    const { hoverProps } = useHover({
      onHoverChange: (h) => {
        if (!mobileOrTablet()) setIsDesktopHover(h);
      },
    });
    const { focusWithinProps } = useFocusWithin({
      onFocusWithinChange: (f) => {
        if (!mobileOrTablet()) setIsDesktopHover(f);
      },
    });

    const optionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!mobileOptionsOpen) return undefined;
      const handleClick = (e: globalThis.Event) => {
        if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
          setMobileOptionsOpen(false);
        }
      };
      document.addEventListener('pointerdown', handleClick, { capture: true });
      return () => document.removeEventListener('pointerdown', handleClick, { capture: true });
    }, [mobileOptionsOpen]);

    const onDoubleTap = useMobileDoubleTap(() => {
      setMobileOptionsOpen(true);
    });

    const evtId = mEvent.getId()!;
    const evtTimeline = room.getTimelineForEvent(evtId);
    const edits =
      evtTimeline &&
      getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
    const isEdited = edits !== undefined;

    return (
      <MessageBase
        className={classNames(css.MessageBase, className)}
        tabIndex={0}
        space={messageSpacing}
        autoCollapse
        highlight={highlight}
        notifyHighlight={notifyHighlight}
        selected={!!menuAnchor}
        {...props}
        {...hoverProps}
        {...focusWithinProps}
        ref={ref}
      >
        {(isDesktopHover || !!menuAnchor || mobileOptionsOpen) && (
          <div className={css.MessageOptionsBase} ref={optionsRef}>
            <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
              <Box gap="100">
                {!mobileOrTablet() && (
                  <PopOut
                    anchor={menuAnchor}
                    position="Bottom"
                    align={menuAnchor?.width === 0 ? 'Start' : 'End'}
                    offset={menuAnchor?.width === 0 ? 0 : undefined}
                    content={
                      <FocusTrap
                        focusTrapOptions={{
                          initialFocus: false,
                          onDeactivate: () => setMenuAnchor(undefined),
                          clickOutsideDeactivates: true,
                          isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                          isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                          escapeDeactivates: stopPropagation,
                        }}
                      >
                        <Menu {...props} ref={ref}>
                          <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                            {!hideReadReceipts && (
                              <MessageReadReceiptItem room={room} eventId={mEvent.getId() ?? ''} />
                            )}
                            {isEdited && (
                              <MessageEditHistoryItem
                                room={room}
                                mEvent={mEvent}
                                closeMenu={closeMenu}
                              />
                            )}
                            {showDeveloperTools && (
                              <MessageSourceCodeItem room={room} mEvent={mEvent} />
                            )}
                            <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
                            <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
                          </Box>
                          {((!mEvent.isRedacted() && canDelete && !stateEvent) ||
                            (mEvent.getSender() !== mx.getUserId() && !stateEvent)) && (
                            <>
                              <Line size="300" />
                              <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                                {!mEvent.isRedacted() && canDelete && (
                                  <MessageDeleteItem room={room} mEvent={mEvent} />
                                )}
                                {mEvent.getSender() !== mx.getUserId() && (
                                  <MessageReportItem room={room} mEvent={mEvent} />
                                )}
                              </Box>
                            </>
                          )}
                        </Menu>
                      </FocusTrap>
                    }
                  >
                    <IconButton
                      onClick={onReplyClick}
                      data-event-id={mEvent.getId()}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon src={Icons.ReplyArrow} size="100" />
                    </IconButton>
                    <IconButton
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      onClick={handleOpenMenu}
                      aria-pressed={!!menuAnchor}
                    >
                      <Icon src={Icons.VerticalDots} size="100" />
                    </IconButton>
                  </PopOut>
                )}
              </Box>
            </Menu>
          </div>
        )}
        <div onContextMenu={handleContextMenu} onPointerDown={onDoubleTap}>
          {children}
        </div>
      </MessageBase>
    );
  }
);
