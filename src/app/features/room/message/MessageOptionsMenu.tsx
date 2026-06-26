import type { RectCords } from 'folds';
import {
  Box,
  Icon,
  Icons,
  IconButton,
  Line,
  Menu,
  MenuItem,
  PopOut,
  Text,
  as,
  config,
} from 'folds';
import type { Dispatch, MouseEventHandler, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import type { MatrixEvent, Relations, Room, RoomPinnedEventsEventContent } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import type { StateEvents } from '$types/matrix-sdk';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { EmojiBoard } from '$components/emoji-board';
import { canEditEvent } from '$utils/room';
import { copyToClipboard } from '$utils/dom';
import { stopPropagation } from '$utils/keyboard';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import {
  addStickerToDefaultPack,
  doesStickerExistInDefaultPack,
} from '$utils/addStickerToDefaultStickerPack';
import { computeBookmarkId, createBookmarkItem } from '$features/bookmarks/bookmarkDomain';
import { useIsBookmarked, useBookmarkActions } from '$features/bookmarks/useBookmarks';
import {
  ArrowBendUpLeftIcon,
  ChatsCircle,
  ClipboardText,
  DotsThreeOutlineVerticalIcon,
  Link,
  menuIcon,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Smiley,
  Star,
} from '$components/icons/phosphor';
import { MessageAllReactionItem } from '$components/message/modals/MessageReactions';
import { MessageReadReceiptItem } from '$components/message/modals/MessageReadRecipts';
import { MessageEditHistoryItem } from '$components/message/modals/MessageEditHistory';
import { MessageSourceCodeItem } from '$components/message/modals/MessageSource';
import { MessageForwardItem } from '$components/message/modals/MessageForward';
import { MessageDeleteItem } from '$components/message/modals/MessageDelete';
import { MessageReportItem } from '$components/message/modals/MessageReport';
import * as css from './styles.css';

// ---------------------------------------------------------------------------
// Re-usable menu item components (previously inline in Message.tsx)
// ---------------------------------------------------------------------------

export type ReactionHandler = (keyOrMxc: string, shortcode: string) => void;

type MessageQuickReactionsProps = { onReaction: ReactionHandler };
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
  { room: Room; mEvent: MatrixEvent; onClose?: () => void }
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

export const MessageCopyTextItem = as<'button', { mEvent: MatrixEvent; onClose?: () => void }>(
  ({ mEvent, onClose, ...props }, ref) => {
    const content = mEvent.getContent();
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
  }
);

export const MessagePinItem = as<
  'button',
  { room: Room; mEvent: MatrixEvent; onClose?: () => void }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const pinnedEvents = useRoomPinnedEvents(room);
  const isPinned = pinnedEvents.includes(mEvent.getId() ?? '');
  const handlePin = () => {
    const eventId = mEvent.getId();
    const pinContent: RoomPinnedEventsEventContent = {
      pinned: Array.from(pinnedEvents).filter((id) => id !== eventId),
    };
    if (!isPinned && eventId) pinContent.pinned.push(eventId);
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

export const MessageBookmarkItem = as<
  'button',
  { room: Room; mEvent: MatrixEvent; onClose?: () => void }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');
  const eventId = mEvent.getId();
  const isBookmarked = useIsBookmarked(room.roomId, eventId ?? '');
  const { add, remove } = useBookmarkActions();
  if (!eventId || !enableMessageBookmarks) return null;
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

// ---------------------------------------------------------------------------
// MessageOptionsBar — desktop hover bar + dropdown for Message component
// ---------------------------------------------------------------------------

export type MessageOptionsBarProps = {
  /** Show the bar: true when !edit && isDesktopHover */
  show: boolean;
  /** Mirror of the parent edit prop — forces the bar to unmount while editing */
  edit?: boolean;
  menuAnchor: RectCords | undefined;
  setMenuAnchor: Dispatch<SetStateAction<RectCords | undefined>>;
  emojiBoardAnchor: RectCords | undefined;
  setEmojiBoardAnchor: Dispatch<SetStateAction<RectCords | undefined>>;
  /** Called inside closeMenu to also clear mobile options state */
  onCloseExtra: () => void;
  room: Room;
  mEvent: MatrixEvent;
  relations?: Relations;
  canSendReaction?: boolean;
  canDelete?: boolean;
  canPinEvent?: boolean;
  imagePackRooms?: Room[];
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  isThreadedMessage: boolean;
  isStickerMessage: boolean;
  isEdited: boolean;
  senderId: string;
  cleanedDisplayName: string;
  activeReplyId?: string | null;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onEditId?: (eventId?: string) => void;
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
};

export function MessageOptionsBar({
  show,
  edit,
  menuAnchor,
  setMenuAnchor,
  emojiBoardAnchor,
  setEmojiBoardAnchor,
  onCloseExtra,
  room,
  mEvent,
  relations,
  canSendReaction,
  canDelete,
  canPinEvent,
  imagePackRooms,
  hideReadReceipts,
  showDeveloperTools,
  isThreadedMessage,
  isStickerMessage,
  isEdited,
  senderId,
  cleanedDisplayName,
  activeReplyId,
  onReplyClick,
  onEditId,
  onReactionToggle,
}: MessageOptionsBarProps) {
  const mx = useMatrixClient();
  const nicknames = useAtomValue(nicknamesAtom);
  const setNickname = useSetAtom(setNicknameAtom);
  const [nickEditOpen, setNickEditOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState('');

  const closeMenu = useCallback(() => {
    setMenuAnchor(undefined);
    setNickEditOpen(false);
    onCloseExtra();
  }, [setMenuAnchor, onCloseExtra]);

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
      const rect = target.getBoundingClientRect();
      window.requestAnimationFrame(() => {
        setMenuAnchor(rect);
      });
    },
    [setMenuAnchor]
  );

  const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
      setEmojiBoardAnchor(target.getBoundingClientRect());
    },
    [setEmojiBoardAnchor]
  );

  const handleAddReactions: MouseEventHandler<HTMLButtonElement> = useCallback(() => {
    const rect = menuAnchor;
    closeMenu();
    setTimeout(() => {
      setEmojiBoardAnchor(rect);
    }, 100);
  }, [menuAnchor, closeMenu, setEmojiBoardAnchor]);

  if (edit || (!show && !menuAnchor && !emojiBoardAnchor)) return null;

  return (
    <div className={css.MessageOptionsBase}>
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
                  }}
                  onCustomEmojiSelect={(mxc, shortcode) => {
                    onReactionToggle(mEvent.getId()!, mxc, shortcode);
                    setEmojiBoardAnchor(undefined);
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
                        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                          Add Reaction
                        </Text>
                      </MenuItem>
                    )}
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
                          <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
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
                            evt as unknown as Parameters<MouseEventHandler<HTMLButtonElement>>[0],
                            true
                          );
                          closeMenu();
                        }}
                      >
                        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
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
                        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                          Edit Message
                        </Text>
                      </MenuItem>
                    )}
                    {!hideReadReceipts && (
                      <MessageReadReceiptItem room={room} eventId={mEvent.getId() ?? ''} />
                    )}
                    {isEdited && (
                      <MessageEditHistoryItem room={room} mEvent={mEvent} closeMenu={closeMenu} />
                    )}
                    {showDeveloperTools && <MessageSourceCodeItem room={room} mEvent={mEvent} />}
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
                          style={{ padding: `${config.space.S100} ${config.space.S200}` }}
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
                          <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
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
  );
}

// ---------------------------------------------------------------------------
// EventOptionsBar — desktop hover bar + dropdown for Event component
// ---------------------------------------------------------------------------

export type EventOptionsBarProps = {
  show: boolean;
  menuAnchor: RectCords | undefined;
  setMenuAnchor: Dispatch<SetStateAction<RectCords | undefined>>;
  onCloseExtra: () => void;
  room: Room;
  mEvent: MatrixEvent;
  canDelete?: boolean;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  isEdited: boolean;
  stateEvent: boolean;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
};

export function EventOptionsBar({
  show,
  menuAnchor,
  setMenuAnchor,
  onCloseExtra,
  room,
  mEvent,
  canDelete,
  hideReadReceipts,
  showDeveloperTools,
  isEdited,
  stateEvent,
  onReplyClick,
}: EventOptionsBarProps) {
  const mx = useMatrixClient();

  const closeMenu = useCallback(() => {
    setMenuAnchor(undefined);
    onCloseExtra();
  }, [setMenuAnchor, onCloseExtra]);

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
      const rect = target.getBoundingClientRect();
      window.requestAnimationFrame(() => {
        setMenuAnchor(rect);
      });
    },
    [setMenuAnchor]
  );

  if (!show && !menuAnchor) return null;

  return (
    <div className={css.MessageOptionsBase}>
      <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
        <Box gap="100">
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
                  <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
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
                    {!hideReadReceipts && (
                      <MessageReadReceiptItem room={room} eventId={mEvent.getId() ?? ''} />
                    )}
                    {isEdited && (
                      <MessageEditHistoryItem room={room} mEvent={mEvent} closeMenu={closeMenu} />
                    )}
                    {showDeveloperTools && <MessageSourceCodeItem room={room} mEvent={mEvent} />}
                    <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
                    <MessageCopyTextItem mEvent={mEvent} onClose={closeMenu} />
                    <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
                    {!stateEvent && (
                      <MessageBookmarkItem room={room} mEvent={mEvent} onClose={closeMenu} />
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
        </Box>
      </Menu>
    </div>
  );
}
