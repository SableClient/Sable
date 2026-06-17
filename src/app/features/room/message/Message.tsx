import type { RectCords } from 'folds';
import {
  Avatar,
  Box,
  Chip,
  Icon,
  Icons,
  IconButton,
  Line,
  Menu,
  MenuItem,
  PopOut,
  Text,
  Tooltip,
  TooltipProvider,
  as,
  config,
  toRem,
} from 'folds';
import type { KeyboardEventHandler, MouseEventHandler, MouseEvent, ReactNode } from 'react';
import { memo, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import FocusTrap from 'focus-trap-react';
import { useHover, useFocusWithin } from 'react-aria';
import type { MatrixEvent, Room, Relations, RoomPinnedEventsEventContent } from '$types/matrix-sdk';
import { EventStatus, MatrixEventEvent, RoomEvent, EventType } from '$types/matrix-sdk';
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
import {
  canEditEvent,
  getEditedEvent,
  getEventEdits,
  getMemberAvatarMxc,
  isThreadRelationEvent,
} from '$utils/room';
import type { MessageSpacing } from '$state/settings';
import { getSettings, MessageLayout, settingsAtom } from '$state/settings';
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
import type { MemberPowerTag } from '$types/matrix/room';
import type { StateEvents } from '$types/matrix-sdk';

import { PowerIcon } from '$components/power';
import {
  ArrowBendUpLeftIcon,
  ChatsCircle,
  ClipboardText,
  DotsThreeOutlineVerticalIcon,
  Info,
  Link,
  menuIcon,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Smiley,
  Star,
  userFallbackIcon,
} from '$components/icons/phosphor';
import { getPowerTagIconSrc } from '$hooks/useMemberPowerTag';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { SwipeableMessageWrapper } from '$components/SwipeableMessageWrapper';
import { mobileOrTablet } from '$utils/user-agent';
import { useUserProfile } from '$hooks/useUserProfile';
import { useSetting } from '$state/hooks/settings';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import { MessageAllReactionItem } from '$components/message/modals/MessageReactions';
import { MessageReadReceiptItem } from '$components/message/modals/MessageReadRecipts';
import { MessageEditHistoryItem } from '$components/message/modals/MessageEditHistory';
import { MessageSourceCodeItem } from '$components/message/modals/MessageSource';
import { MessageForwardItem } from '$components/message/modals/MessageForward';
import { MessageDeleteItem } from '$components/message/modals/MessageDelete';
import { computeBookmarkId, createBookmarkItem } from '$features/bookmarks/bookmarkDomain';
import { useIsBookmarked, useBookmarkActions } from '$features/bookmarks/useBookmarks';
import { MessageReportItem } from '$components/message/modals/MessageReport';
import { filterPronounsByLanguage, getParsedPronouns } from '$utils/pronouns';
import type { PronounSet } from '$utils/pronouns';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useCachedMxcConverter } from '$hooks/useCachedMxcConverter';
import {
  addStickerToDefaultPack,
  doesStickerExistInDefaultPack,
} from '$utils/addStickerToDefaultStickerPack';
import type { PerMessageProfileBeeperFormat } from '$hooks/usePerMessageProfile';
import { convertBeeperFormatToOurPerMessageProfile } from '$hooks/usePerMessageProfile';
import { MessageEditor } from './MessageEditor';
import { MobileMessageMenu } from './MobileMessageMenu';
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
      after={menuIcon(Link)}
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

export const MessageCopyTextItem = as<
  'button',
  {
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ mEvent, onClose, ...props }, ref) => {
  const content = mEvent.getContent();
  // For edited messages, prefer the new content body
  const body: string | undefined = content['m.new_content']?.body ?? content.body;

  if (!body || mEvent.isRedacted()) return null;

  const handleCopy = () => {
    copyToClipboard(body);
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={menuIcon(ClipboardText)}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Copy Text
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
    mx.sendStateEvent(room.roomId, EventType.RoomPinnedEvents as keyof StateEvents, pinContent);
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={menuIcon(isPinned ? PushPinSlash : PushPin)}
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

// message bookmarking
export const MessageBookmarkItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');
  const eventId = mEvent.getId();
  const isBookmarked = useIsBookmarked(room.roomId, eventId ?? '');
  const { add, remove } = useBookmarkActions();

  if (!eventId) return null;
  if (!enableMessageBookmarks) return null;

  const handleClick = async () => {
    if (isBookmarked) {
      await remove(computeBookmarkId(room.roomId, eventId));
    } else {
      const item = createBookmarkItem(room, mEvent);
      if (item) await add(item);
    }
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Bookmark} filled={isBookmarked} />}
      radii="300"
      onClick={handleClick}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {isBookmarked ? 'Remove Bookmark' : 'Bookmark Message'}
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

export type MSC2723ForwardedMessageProps = {
  event_id: string;
  room_id: string;
  sender: string | null;
  origin_server_ts: number;
};

export type MessageProps = {
  room: Room;
  mEvent: MatrixEvent;
  collapse: boolean;
  highlight: boolean;
  notifyHighlight?: 'silent' | 'loud';
  isMarked?: boolean;
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
  msc2723ForwardedMessageProps?: MSC2723ForwardedMessageProps;
};

function useMobileLongPress(callback: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!mobileOrTablet()) return;
      const touch = e.touches[0];
      if (!touch) return;
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          callback();
        });
      }, delay);
    },
    [callback, delay]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) cancel();
    },
    [cancel]
  );

  const onTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  useEffect(
    () => () => {
      cancel();
    },
    [cancel]
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  };
}

const clamp = (str: string, len: number) => (str.length > len ? `${str.slice(0, len)}...` : str);

type MorePronounsPillProps = {
  pronouns: PronounSet[];
  tagColor: string;
  maxPillLength: number;
};

function MorePronounsPill({ pronouns, tagColor, maxPillLength }: MorePronounsPillProps) {
  const [anchor, setAnchor] = useState<RectCords | undefined>();

  const toggleAnchor = (target: HTMLElement) => {
    setAnchor((prev) => (prev ? undefined : target.getBoundingClientRect()));
  };

  const handleClick: MouseEventHandler<HTMLElement> = (e) => {
    e.stopPropagation();
    toggleAnchor(e.currentTarget);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLElement> = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    toggleAnchor(e.currentTarget);
  };

  // On mobile, tapping the pill pins the tooltip open.
  // Tapping anywhere else dismisses it.
  useEffect(() => {
    if (!anchor) return undefined;
    const dismiss = () => setAnchor(undefined);
    document.addEventListener('click', dismiss, { once: true });
    return () => document.removeEventListener('click', dismiss);
  }, [anchor]);

  const tooltipText = pronouns.map((p) => clamp(p.summary, maxPillLength)).join(', ');

  const tooltipContent = (
    <Tooltip style={{ maxWidth: toRem(250) }}>
      <Text size="T200">{tooltipText}</Text>
    </Tooltip>
  );

  return (
    <>
      <TooltipProvider position="Top" tooltip={tooltipContent}>
        {(triggerRef) => (
          <PronounPill
            ref={triggerRef as React.Ref<HTMLSpanElement>}
            style={{ color: tagColor, cursor: 'help' }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
          >
            ...
          </PronounPill>
        )}
      </TooltipProvider>
      {anchor && (
        <PopOut anchor={anchor} position="Top" align="Center" content={tooltipContent}>
          {null}
        </PopOut>
      )}
    </>
  );
}

/**
 * Component to render pronouns in the chat timeline.
 * It also filters them.
 */
const Pronouns = as<
  'span',
  {
    pronouns?: PronounSet[];
    tagColor: string;
  }
>(({ as: AsPronouns = 'span', pronouns, tagColor, ...props }, ref) => {
  if (!pronouns || pronouns.length === 0) return null;

  const languageFilterEnabled = getSettings().filterPronounsBasedOnLanguage ?? false;
  // if no language is given use english
  const selectedLanguages = (getSettings().filterPronounsLanguages ?? ['en'])
    .map((lang: string) => lang.trim().toLowerCase())
    .filter(Boolean);

  /**
   * filter the pronouns based on the user's language settings.
   * If filtering is enabled, only show pronouns that match the selected languages.
   * If filtering is disabled, show all pronouns but still apply the language filter to determine which pronouns to show if there are multiple sets of pronouns for different languages.
   * If there are multiple sets of pronouns and filtering is enabled, only show the ones that match the selected languages.
   * If there are no pronouns that match the selected languages, show all pronouns.
   */
  const visiblePronouns = filterPronounsByLanguage(
    pronouns,
    languageFilterEnabled,
    selectedLanguages
  );

  const limit = getSettings().pronounPillMaxCount ?? 3;
  const maxPillLength = getSettings().pronounPillMaxLength ?? 16;

  // if language specific pronouns can't be found matching the filter return unfiltered
  if (visiblePronouns.length === 0) {
    visiblePronouns.push(...pronouns);
  }

  return (
    <AsPronouns {...props} ref={ref}>
      {visiblePronouns.slice(0, limit).map((p) => (
        <PronounPill key={p.summary} style={{ color: tagColor }}>
          {clamp(p.summary, maxPillLength)}
        </PronounPill>
      ))}
      {visiblePronouns.length > limit && (
        <MorePronounsPill
          pronouns={visiblePronouns.slice(limit)}
          tagColor={tagColor}
          maxPillLength={maxPillLength}
        />
      )}
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
    isMarked,
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
    msc2723ForwardedMessageProps,
    ...props
  }: MessageProps & { className?: string; children?: ReactNode },
  ref:
    | ((instance: HTMLDivElement | null) => void)
    | React.RefObject<HTMLDivElement>
    | null
    | undefined
) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const convertMxc = useCachedMxcConverter();

  const [contentVersion, setContentVersion] = useState(0);

  useEffect(() => {
    const triggerTimelineRegroup = () => {
      // A Local Echo update seems to trigger a visual refresh without
      // scrolling the viewport.
      room.emit(RoomEvent.LocalEchoUpdated, mEvent, room);
    };

    const onUpdate = () => {
      setContentVersion((v) => v + 1);
      triggerTimelineRegroup();
    };

    if (mEvent.getClearContent()) {
      setContentVersion((v) => (v === 0 ? 1 : v));
      triggerTimelineRegroup();
    }

    mEvent.on(MatrixEventEvent.Decrypted, onUpdate);
    mEvent.on(MatrixEventEvent.Replaced, onUpdate);
    return () => {
      mEvent.off(MatrixEventEvent.Decrypted, onUpdate);
      mEvent.off(MatrixEventEvent.Replaced, onUpdate);
    };
  }, [mEvent, room]);

  /**
   * We read the per-message profile from the event content here.
   * We have to do this in the message component because the per-message profile can be different for each message, and we need to read it for each message individually.
   * We also want to avoid reading and parsing the per-message profile in a parent component like the timeline, because that would be inefficient and would cause unnecessary re-renders of the entire timeline whenever a per-message profile changes.
   */
  const pmp: PerMessageProfileBeeperFormat | undefined = useMemo(() => {
    // `contentVersion` is a cache-busting key when the event updates in place.
    void contentVersion;
    const evtId = mEvent.getId();
    const evtTimeline = evtId ? room.getTimelineForEvent(evtId) : undefined;
    const editedEvent =
      evtTimeline && evtId
        ? getEditedEvent(evtId, mEvent, evtTimeline.getTimelineSet())
        : undefined;

    const resolvedContent = editedEvent
      ? editedEvent.getContent()['m.new_content']
      : mEvent.getContent();

    return resolvedContent?.['com.beeper.per_message_profile'] as
      | PerMessageProfileBeeperFormat
      | undefined;
  }, [mEvent, room, contentVersion]);

  /**
   * We convert the per-message profile from the Beeper format to our internal format here in the message component
   */
  const parsedPMPContent = useMemo(() => {
    if (!pmp) return undefined;
    return convertBeeperFormatToOurPerMessageProfile(pmp);
  }, [pmp]);

  /**
   * boolean to indicate wheather we should indicate to the user that it is a pmp
   * We want to not show it, when the name is unset, or whitespace only
   */
  const showPmPInfo = parsedPMPContent?.name && parsedPMPContent.name?.trim() !== '';
  // Profiles and Colors
  const profile = useUserProfile(senderId, room);
  const { color: usernameColor, font: usernameFont } = useSableCosmetics(senderId, room);

  /**
   * If there is a per-message profile, we want to use the per message pronouns,
   * otherwise we fall back to the profile pronouns.
   * This allows users to set pronouns on a per-message basis, while still falling back to their profile pronouns if they don't set any for a specific message.
   */
  const pronouns = parsedPMPContent?.pronouns ?? profile.pronouns;

  const [highlightMentions] = useSetting(settingsAtom, 'highlightMentions');

  // Avatars
  // Prefer the room-scoped member avatar (m.room.member) over the global profile
  // avatar so per-room avatar overrides are respected in the timeline.
  const memberAvatarMxc = getMemberAvatarMxc(room, senderId);
  const avatarUrl = useMemo(() => {
    if (collapse) return undefined;
    const mxc = pmp?.avatar_url || memberAvatarMxc || profile.avatarUrl;
    return mxc ? convertMxc(mx, mxc, useAuthentication, 48, 48, 'crop') : undefined;
  }, [pmp, collapse, memberAvatarMxc, profile.avatarUrl, mx, useAuthentication, convertMxc]);

  const cachedAvatar = useRenderableMediaUrl(avatarUrl ?? undefined);

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
  const [parsePronouns] = useSetting(settingsAtom, 'parsePronouns');

  const [useRightBubbles] = useSetting(settingsAtom, 'useRightBubbles');
  const { cleanedDisplayName, inlinePronoun } = useMemo(() => {
    const rawName = pmp?.displayname || senderDisplayName || '';
    return getParsedPronouns(rawName, parsePronouns);
  }, [pmp, senderDisplayName, parsePronouns]);

  const mergedPronouns = useMemo(() => {
    const existing = pronouns ? [...pronouns] : [];

    if (inlinePronoun) {
      const isDupe = existing.some((p) => p.summary?.toLowerCase() === inlinePronoun);

      if (!isDupe) {
        existing.push({
          summary: inlinePronoun,
          language: 'en',
        });
      }
    }

    return existing;
  }, [pronouns, inlinePronoun]);

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
            <UsernameBold>{cleanedDisplayName}</UsernameBold>
          </Text>
        </Username>
        {showPronouns && mergedPronouns.length > 0 && (
          <Pronouns pronouns={mergedPronouns} tagColor={usernameColor ?? 'currentColor'} />
        )}
        {showPmPInfo && (
          <Box>
            <Text as="span">
              <Text
                as="span"
                style={{
                  paddingLeft: 0,
                  paddingRight: 5,
                  fontWeight: 100,
                  fontSize: 11,
                }}
              >
                via
              </Text>
              <Text
                as="span"
                size={messageLayout === MessageLayout.Bubble ? 'T300' : 'T400'}
                style={{ fontSize: 11 }}
                truncate
              >
                <UsernameBold>{senderDisplayName}</UsernameBold>
              </Text>
            </Text>
          </Box>
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
          alt={cleanedDisplayName}
          renderFallback={() => userFallbackIcon('md')}
        />
      </Avatar>
    </AvatarBase>
  );

  const stableContent = useMemo(
    () => mEvent.getContent().body || mEvent.getContent()['org.matrix.msc3381.poll.start'] || '',
    [mEvent]
  );
  const isPendingSend =
    sendStatus === EventStatus.ENCRYPTING ||
    sendStatus === EventStatus.QUEUED ||
    sendStatus === EventStatus.SENDING;
  const isFailedSend = sendStatus === EventStatus.NOT_SENT;
  const canResend = isFailedSend && senderId === mx.getUserId() && !!onResend;
  const canDeleteFailedSend = isFailedSend && senderId === mx.getUserId() && !!onDeleteFailedSend;
  // handle clicks on mentions in the message body (e.g. jump to original message from a forwarded message notice)
  const mentionClickHandler = useMentionClickHandler(room.roomId);

  const forwardedNotice = useMemo(() => {
    const isSameRoomForward = (originalRoomId: string | undefined) =>
      originalRoomId !== undefined && originalRoomId === room.roomId;

    if (messageForwardedProps?.isForwarded) {
      const originalRoomId = messageForwardedProps.originalRoomId;
      return {
        label: messageForwardedProps.originalEventPrivate
          ? 'Forwarded private message'
          : isSameRoomForward(originalRoomId)
            ? 'Forwarded from earlier in this room'
            : 'Forwarded from another room',
        roomId: originalRoomId,
        eventId: messageForwardedProps.originalEventId,
        ts: messageForwardedProps.originalTimestamp ?? 0,
        showLink: !messageForwardedProps.originalEventPrivate,
      };
    }

    if (msc2723ForwardedMessageProps) {
      const originalRoomId = msc2723ForwardedMessageProps.room_id;
      return {
        label: isSameRoomForward(originalRoomId)
          ? 'Forwarded from earlier in this room'
          : 'Forwarded from another room',
        roomId: originalRoomId,
        eventId: msc2723ForwardedMessageProps.event_id,
        ts: msc2723ForwardedMessageProps.origin_server_ts ?? 0,
        showLink: true,
      };
    }

    return null;
  }, [messageForwardedProps, msc2723ForwardedMessageProps, room.roomId]);

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
  const isSableFeedback = mEvent.getId()?.startsWith('~sable-feedback-');

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
      {forwardedNotice && (
        <Chip as="div" variant="SurfaceVariant" radii="Pill">
          <Text size="T200" priority="300">
            {forwardedNotice.label}
            {forwardedNotice.showLink && (
              <>
                {' '}
                <a
                  href={getMatrixToRoomEvent(forwardedNotice.roomId, forwardedNotice.eventId)}
                  rel="noreferrer noopener"
                  data-mention-id={forwardedNotice.roomId}
                  data-mention-event-id={forwardedNotice.eventId}
                  onClick={mentionClickHandler}
                >
                  jump to original
                </a>
              </>
            )}
            <Time
              ts={forwardedNotice.ts}
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
            width: '100%',
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
      {isSableFeedback && (
        <Box className={css.SendStatusRow} alignItems="Center" gap="100">
          {menuIcon(Info)}
          <Text size="T200" priority="300" as="span">
            Only you can see this.
          </Text>
          <Chip
            type="button"
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            onClick={(evt: React.MouseEvent) => {
              evt.preventDefault();
              evt.stopPropagation();
              const eventId = mEvent.getId();
              if (eventId) {
                room.removeEvent(eventId);
                room.emit(RoomEvent.LocalEchoUpdated, mEvent, room);
              }
            }}
          >
            <Text size="B300">Dismiss</Text>
          </Chip>
        </Box>
      )}
    </Box>
  );

  const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
    if (mobileOrTablet()) {
      evt.preventDefault();
      setMobileOptionsOpen(true);
      return;
    }

    if (evt.altKey || !window.getSelection()?.isCollapsed || edit) return;
    const tag = (evt.target as HTMLElement).tagName;
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

  const longPress = useMobileLongPress(() => {
    setMobileOptionsOpen(true);
  });

  const isThreadedMessage = isThreadRelationEvent(mEvent, mEvent.threadRootId);
  const isStickerMessage = mEvent.getType() === 'm.sticker';

  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = !!edits?.length;

  return (
    <MessageBase
      className={classNames(css.MessageBase, className, {
        [css.MessageBaseBubbleCollapsed]: messageLayout === MessageLayout.Bubble && collapse,
      })}
      tabIndex={0}
      space={messageSpacing}
      collapse={collapse}
      highlight={highlight}
      notifyHighlight={highlightMentions ? notifyHighlight : undefined}
      selected={!!menuAnchor || !!emojiBoardAnchor}
      isMarked={isMarked}
      {...props}
      {...hoverProps}
      {...focusWithinProps}
      ref={ref}
    >
      {!edit && (isDesktopHover || !!menuAnchor || !!emojiBoardAnchor) && (
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
                    {menuIcon(Smiley)}
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
                {menuIcon(ArrowBendUpLeftIcon)}
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
                  {menuIcon(ChatsCircle)}
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
                  {menuIcon(PencilSimple)}
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
                            after={menuIcon(Smiley)}
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
                        {/* Only show "Add to User Sticker Pack" if the sticker isn't already in the default pack and isn't encrypted */}
                        {isStickerMessage &&
                          mEvent.getContent().url &&
                          !doesStickerExistInDefaultPack(mx, mEvent.getContent().url) && (
                            <MenuItem
                              size="300"
                              after={menuIcon(Star)}
                              radii="300"
                              onClick={() => {
                                addStickerToDefaultPack(
                                  mx,
                                  `sticker-${mEvent.getId()}`,
                                  mEvent.getContent().url ?? mEvent.getContent().file?.url ?? '',
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
                          after={menuIcon(ArrowBendUpLeftIcon)}
                          radii="300"
                          data-event-id={mEvent.getId()}
                          onClick={(evt: React.MouseEvent) => {
                            onReplyClick(
                              evt as unknown as Parameters<MouseEventHandler<HTMLButtonElement>>[0]
                            );
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
                            after={menuIcon(ChatsCircle)}
                            radii="300"
                            data-event-id={mEvent.getId()}
                            onClick={(evt: React.MouseEvent) => {
                              onReplyClick(
                                evt as unknown as Parameters<
                                  MouseEventHandler<HTMLButtonElement>
                                >[0],
                                true
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
                              Reply in Thread
                            </Text>
                          </MenuItem>
                        )}
                        {canEditEvent(mx, mEvent) && onEditId && (
                          <MenuItem
                            size="300"
                            after={menuIcon(PencilSimple)}
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
                        <MessageCopyTextItem mEvent={mEvent} onClose={closeMenu} />
                        <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
                      </Box>
                      <Line size="300" />
                      <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                        <MessageBookmarkItem room={room} mEvent={mEvent} onClose={closeMenu} />
                        {canPinEvent && (
                          <MessagePinItem room={room} mEvent={mEvent} onClose={closeMenu} />
                        )}
                        {senderId !== mx.getUserId() &&
                          (nickEditOpen ? (
                            <Box
                              direction="Column"
                              gap="100"
                              style={{
                                padding: `${config.space.S100} ${config.space.S200}`,
                              }}
                            >
                              <Text size="L400">Nickname</Text>
                              <input
                                autoFocus
                                value={nickDraft}
                                onChange={(e) => setNickDraft(e.target.value)}
                                placeholder={cleanedDisplayName}
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
                              after={menuIcon(PencilSimple)}
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
                  {menuIcon(DotsThreeOutlineVerticalIcon, {
                    weight: menuAnchor ? 'fill' : 'regular',
                  })}
                </IconButton>
              </PopOut>
            </Box>
          </Menu>
        </div>
      )}
      {messageLayout === MessageLayout.Compact && (
        <SwipeableMessageWrapper onReply={handleSwipeReply}>
          <CompactLayout before={headerJSX} onContextMenu={handleContextMenu}>
            <div {...longPress} data-gestures="ignore">
              {msgContentJSX}
            </div>
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
            <div {...longPress} data-gestures="ignore">
              {msgContentJSX}
            </div>
          </BubbleLayout>
        </SwipeableMessageWrapper>
      )}
      {messageLayout !== MessageLayout.Compact && messageLayout !== MessageLayout.Bubble && (
        <SwipeableMessageWrapper onReply={handleSwipeReply}>
          <ModernLayout before={avatarJSX} onContextMenu={handleContextMenu}>
            <div {...longPress} data-gestures="ignore">
              {headerJSX}
              {msgContentJSX}
            </div>
          </ModernLayout>
        </SwipeableMessageWrapper>
      )}
      {mobileOptionsOpen && (
        <MobileMessageMenu
          room={room}
          mEvent={mEvent}
          canDelete={canDelete}
          canSendReaction={canSendReaction}
          canPinEvent={canPinEvent}
          relations={relations}
          isThreadedMessage={isThreadedMessage}
          hideReadReceipts={hideReadReceipts}
          showDeveloperTools={showDeveloperTools}
          onReplyClick={onReplyClick}
          onEditId={onEditId}
          onReactionToggle={onReactionToggle}
          imagePackRooms={imagePackRooms ?? []}
          onClose={() => setMobileOptionsOpen(false)}
        />
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
  isMarked?: boolean;
  canDelete?: boolean;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  messageSpacing: MessageSpacing;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  collapse?: boolean;
};
export const Event = as<'div', EventProps>(
  (
    {
      className,
      room,
      mEvent,
      highlight,
      notifyHighlight,
      isMarked,
      collapse,
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
    const [highlightMentions] = useSetting(settingsAtom, 'highlightMentions');

    const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
      if (mobileOrTablet()) {
        evt.preventDefault();
        setMobileOptionsOpen(true);
        return;
      }

      if (evt.altKey || !window.getSelection()?.isCollapsed) return;
      const tag = (evt.target as HTMLElement).tagName;
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

    const longPress = useMobileLongPress(() => {
      setMobileOptionsOpen(true);
    });

    const evtId = mEvent.getId()!;
    const evtTimeline = room.getTimelineForEvent(evtId);
    const edits =
      evtTimeline &&
      getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
    const isEdited = !!edits?.length;

    return (
      <MessageBase
        className={classNames(css.MessageBase, className)}
        tabIndex={0}
        space={messageSpacing}
        collapse={collapse}
        highlight={highlight}
        notifyHighlight={highlightMentions ? notifyHighlight : undefined}
        selected={!!menuAnchor}
        isMarked={isMarked}
        {...props}
        {...hoverProps}
        {...focusWithinProps}
        ref={ref}
      >
        {(isDesktopHover || !!menuAnchor) && (
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
                            <MenuItem
                              size="300"
                              after={menuIcon(ArrowBendUpLeftIcon)}
                              radii="300"
                              data-event-id={mEvent.getId()}
                              onClick={(evt: React.MouseEvent) => {
                                onReplyClick(
                                  evt as unknown as Parameters<
                                    MouseEventHandler<HTMLButtonElement>
                                  >[0]
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
                                Reply
                              </Text>
                            </MenuItem>
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
                            <MessageCopyTextItem mEvent={mEvent} onClose={closeMenu} />
                            <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
                            {!stateEvent && (
                              <MessageBookmarkItem
                                room={room}
                                mEvent={mEvent}
                                onClose={closeMenu}
                              />
                            )}
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
                      {menuIcon(ArrowBendUpLeftIcon)}
                    </IconButton>
                    <IconButton
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      onClick={handleOpenMenu}
                      aria-pressed={!!menuAnchor}
                    >
                      {menuIcon(DotsThreeOutlineVerticalIcon, {
                        weight: menuAnchor ? 'fill' : 'regular',
                      })}
                    </IconButton>
                  </PopOut>
                )}
              </Box>
            </Menu>
          </div>
        )}
        <div onContextMenu={handleContextMenu} {...longPress} data-gestures="ignore">
          {children}
        </div>
        {mobileOptionsOpen && (
          <MobileMessageMenu
            room={room}
            mEvent={mEvent}
            canDelete={canDelete}
            hideReadReceipts={hideReadReceipts}
            showDeveloperTools={showDeveloperTools}
            onReplyClick={onReplyClick}
            onReactionToggle={() => {}}
            imagePackRooms={[]}
            onClose={() => setMobileOptionsOpen(false)}
          />
        )}
      </MessageBase>
    );
  }
);
