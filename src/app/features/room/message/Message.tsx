// oxlint-disable no-console
import type { RectCords } from 'folds';
import {
  Avatar,
  Box,
  Chip,
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
import { useHover, useFocusWithin } from 'react-aria';
import type { MatrixEvent, Room, Relations } from '$types/matrix-sdk';
import { EventStatus, MatrixEventEvent, RoomEvent } from '$types/matrix-sdk';
import classNames from 'classnames';
import { useSetAtom } from 'jotai';
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
import { getEditedEvent, getMemberAvatarMxc } from '$utils/room';
import { mxcUrlToHttp } from '$utils/matrix';
import type { MessageSpacing } from '$state/settings';
import { getSettings, MessageLayout, settingsAtom } from '$state/settings';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { UserAvatar } from '$components/user-avatar';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { MemberPowerTag } from '$types/matrix/room';

import { PowerIcon } from '$components/power';
import { Info, menuIcon, userFallbackIcon } from '$components/icons/phosphor';
import { getPowerTagIconSrc } from '$hooks/useMemberPowerTag';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { SwipeableMessageWrapper } from '$components/SwipeableMessageWrapper';
import { mobileOrTablet } from '$utils/user-agent';
import { useUserProfile } from '$hooks/useUserProfile';
import { useSetting } from '$state/hooks/settings';
import { useBlobCache } from '$hooks/useBlobCache';
import { filterPronounsByLanguage, getParsedPronouns } from '$utils/pronouns';
import type { PronounSet } from '$utils/pronouns';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import type { PerMessageProfileBeeperFormat } from '$hooks/usePerMessageProfile';
import { convertBeeperFormatToOurPerMessageProfile } from '$hooks/usePerMessageProfile';
import { MessageEditor } from './MessageEditor';
import * as css from './styles.css';
import { modalAtom, ModalType } from '$state/modal';
import { OptionQuickMenu } from '$components/message/modals/Options';

export type ReactionHandler = (keyOrMxc: string, shortcode: string) => void;

export const MemoizedBody = memo(({ children }: { children: ReactNode }) => children);

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
  messageLayout?: MessageLayout;
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

function useMobileDoubleTap(callback: () => void, delay = 300) {
  const lastTapRef = useRef(0);

  return useCallback(() => {
    if (!mobileOrTablet()) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < delay && timeSinceLastTap > 0) {
      callback();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [callback, delay]);
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
type WrappedMessageProps = {
  headerJSX: JSX.Element;
  avatarJSX: JSX.Element;
  msgContentJSX: JSX.Element;
  messageLayout?: MessageLayout;
  onDoubleTap: () => void;
  handleSwipeReply: () => void;
  handleContextMenu: MouseEventHandler<HTMLDivElement>;
  align?: 'left' | 'right';
};
function WrappedMessage({
  headerJSX,
  avatarJSX,
  msgContentJSX,
  messageLayout,
  onDoubleTap,
  handleSwipeReply,
  handleContextMenu,
  align,
}: WrappedMessageProps) {
  if (messageLayout === undefined) return <>{msgContentJSX}</>;

  if (messageLayout === MessageLayout.Compact)
    return (
      <SwipeableMessageWrapper onReply={handleSwipeReply}>
        <CompactLayout before={headerJSX} onContextMenu={handleContextMenu}>
          <div onPointerDown={onDoubleTap}>{msgContentJSX}</div>
        </CompactLayout>
      </SwipeableMessageWrapper>
    );
  if (messageLayout === MessageLayout.Bubble)
    return (
      <SwipeableMessageWrapper onReply={handleSwipeReply}>
        <BubbleLayout
          before={avatarJSX}
          header={headerJSX}
          onContextMenu={handleContextMenu}
          align={align}
        >
          <div onPointerDown={onDoubleTap}>{msgContentJSX}</div>
        </BubbleLayout>
      </SwipeableMessageWrapper>
    );
  return (
    <SwipeableMessageWrapper onReply={handleSwipeReply}>
      <ModernLayout before={avatarJSX} onContextMenu={handleContextMenu}>
        <div onPointerDown={onDoubleTap}>
          {headerJSX}
          {msgContentJSX}
        </div>
      </ModernLayout>
    </SwipeableMessageWrapper>
  );
}

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

  const [isEmoji, setIsEmoji] = useState(false);

  const setModal = useSetAtom(modalAtom);
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
    const mxc = pmp?.avatar_url || memberAvatarMxc || profile.avatarUrl;
    return mxc ? mxcUrlToHttp(mx, mxc, useAuthentication, 48, 48, 'crop') : undefined;
  }, [pmp, memberAvatarMxc, profile.avatarUrl, mx, useAuthentication]);

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

  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;

  const [isMobileHover, setIsMobileHoverOpen] = useState(false);
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

  useEffect(() => {
    if (!isMobileHover) return undefined;
    const handleClickOutside = (e: globalThis.Event) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setIsMobileHoverOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside, { capture: true });
    return () => document.removeEventListener('pointerdown', handleClickOutside, { capture: true });
  }, [isMobileHover]);

  const headerJSX = (collapsed?: boolean) => {
    if (!collapsed)
      return (
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
              <Text
                as="span"
                size={messageLayout === MessageLayout.Bubble ? 'T300' : 'T400'}
                truncate
              >
                <UsernameBold>{cleanedDisplayName}</UsernameBold>
              </Text>
            </Username>
            {showPronouns && (
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
    return <></>;
  };

  const avatarJSX = (collapsed?: boolean) => {
    if (!collapsed && messageLayout !== MessageLayout.Compact)
      return (
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
    return <></>;
  };

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

  const MSG_CONTENT_STYLE = { width: '100%' };
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
    if (evt.altKey || !window.getSelection()?.isCollapsed || edit) return;
    const tag = (evt.target as HTMLElement).tagName;
    if (typeof tag === 'string' && tag.toLowerCase() === 'a') return;
    if (mobileOrTablet()) {
      evt.preventDefault();
      setModal({
        type: ModalType.MobileOptions,
        options: {
          mEvent: mEvent,
          room: room,
          closeMenu: closeMenu,
          onReactionToggle: onReactionToggle,
          relations: relations,
          onReplyClick: onReplyClick,
          onEditId: onEditId,
          hideReadReceipts: hideReadReceipts,
          showDeveloperTools: showDeveloperTools,
          canPinEvent: canPinEvent,
          cleanedDisplayName: cleanedDisplayName,
          canDelete: canDelete,
          setIsEmoji: setIsEmoji,
          ActualMessage: (
            <WrappedMessage
              headerJSX={headerJSX()}
              avatarJSX={avatarJSX()}
              msgContentJSX={msgContentJSX}
              messageLayout={messageLayout}
              onDoubleTap={onDoubleTap}
              handleSwipeReply={handleSwipeReply}
              handleContextMenu={handleContextMenu}
              align={useRightBubbles && senderId === mx.getUserId() ? 'right' : 'left'}
            />
          ),
          canSendReaction: canSendReaction,
        },
      });
      return;
    }

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
    setIsMobileHoverOpen(false);
    setIsDesktopHover(false);
    setIsEmoji(false);
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
    setIsMobileHoverOpen(true);
  });

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
      selected={!!menuAnchor || isEmoji}
      isMarked={isMarked}
      mobile={mobileOrTablet()}
      {...props}
      {...hoverProps}
      {...focusWithinProps}
      ref={ref}
    >
      {!edit && (isDesktopHover || !!menuAnchor || isEmoji || isMobileHover) && (
        <div className={css.MessageOptionsBase} ref={optionsRef}>
          {/*<b>{`${isDesktopHover? 'isDesktopHover ' : ''}${menuAnchor? 'menuAnchor ' : ''}${isEmoji? 'isEmoji ' : ''}${isMobileHover? 'isMobileHover ' : ''}`}</b>*/}
          <OptionQuickMenu
            mEvent={mEvent}
            room={room}
            closeMenu={closeMenu}
            onReactionToggle={onReactionToggle}
            relations={relations}
            onReplyClick={onReplyClick}
            onEditId={onEditId}
            hideReadReceipts={hideReadReceipts}
            showDeveloperTools={showDeveloperTools}
            canPinEvent={canPinEvent}
            cleanedDisplayName={cleanedDisplayName}
            canDelete={canDelete}
            handleOpenMenu={handleOpenMenu}
            menuAnchor={menuAnchor}
            imagePackRooms={imagePackRooms}
            setIsEmoji={setIsEmoji}
            canSendReaction={canSendReaction}
          />
        </div>
      )}

      <div style={{ width: '100%' }} onContextMenu={handleContextMenu} onPointerDown={onDoubleTap}>
        <WrappedMessage
          headerJSX={headerJSX(collapse)}
          avatarJSX={avatarJSX(collapse)}
          msgContentJSX={msgContentJSX}
          messageLayout={messageLayout}
          onDoubleTap={onDoubleTap}
          handleSwipeReply={handleSwipeReply}
          handleContextMenu={handleContextMenu}
          align={useRightBubbles && senderId === mx.getUserId() ? 'right' : 'left'}
        />
      </div>
    </MessageBase>
  );
}

const MessageAs = as<'div', MessageProps>(MessageInternal);
export const Message = memo(MessageAs);
