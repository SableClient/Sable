import type {
  MatrixClient,
  RoomMessageEventContent,
  RoomPinnedEventsEventContent,
  StateEvents,
} from '$types/matrix-sdk';
import { type Room, type MatrixEvent, type Relations, EventType } from '$types/matrix-sdk';
import {
  canEditEvent,
  canForwardEvent,
  getEventEdits,
  isThreadRelationEvent,
} from '$utils/room/relations';
import { MessageReportItem } from './MessageReport';
import type { RectCords } from 'folds';
import { as, Box, config, IconButton, Line, Menu, MenuItem, Text } from 'folds';
import { PopOut } from '$components/overlay-stack';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  ArrowBendUpLeftIcon,
  ChatCircleDots,
  DotsThreeOutlineVerticalIcon,
  Link,
  menuIcon,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Smiley,
  Star,
} from '$components/icons/phosphor';
import { MessageAllReactionItem } from './MessageReactions';
import { MessageReadReceiptItem } from './MessageReadRecipts';
import {
  addStickerToDefaultPack,
  doesStickerExistInDefaultPack,
} from '$utils/addStickerToDefaultStickerPack';
import { MessageEditHistoryItem } from './MessageEditHistory';
import { MessageSourceCodeItem } from './MessageSource';
import { MessageForwardItem } from './MessageForward';
import { MobileSwipeDownModal, useMobileSheetClose } from '$components/MobileSwipeDownModal';

import * as css from '$features/room/message/styles.css';
import { useAtom, useSetAtom, useStore } from 'jotai';
import type { Dispatch, MouseEventHandler, ReactNode, SetStateAction } from 'react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { MessageDeleteItem } from './MessageDelete';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { modalAtom, ModalType, pushModalAtom } from '$state/modal';
import { copyToClipboard } from '$utils/dom';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { EmojiBoard } from '$components/emoji-board';
import { MemoizedBody, type ReactionHandler } from '$features/room/message';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { BookmarkIcon, UserIcon } from '@phosphor-icons/react';
import {
  computeBookmarkId,
  createBookmarkItem,
  useBookmarkActions,
  useIsBookmarked,
} from '$features/bookmarks';
import { CopyIcon } from '@phosphor-icons/react';
import * as OptionsCss from './Options.css';
import {
  MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS,
  MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME,
} from '$unstable/prefixes';
import { useFavoriteGifs } from '$hooks/useFavoriteGifs';
import { getFavoriteGifFromMessageContent } from '$utils/favoriteGif';
import { TemporaryPersonaPicker } from '$features/room/persona-picker/PersonaPicker';
import { type PerMessageProfileMsc4461 } from '$hooks/usePerMessageProfile';
import { buildReplacementPmpContent } from '$features/room/buildReplacementContent';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';

function WrappedMessage({
  isModal,
  ActualMessage,
}: {
  isModal?: boolean;
  ActualMessage?: ReactNode;
}) {
  return (
    <Box
      className={isModal ? css.MessageOptionsWrappedMessage : ''}
      onPointerMove={(e) => e.preventDefault()}
      shrink="Yes"
      grow="No"
    >
      <MemoizedBody>{ActualMessage}</MemoizedBody>
    </Box>
  );
}

type MessageQuickReactionsProps = {
  onReaction: ReactionHandler;
  count: number;
};
const MessageQuickReactions = as<'div', MessageQuickReactionsProps>(
  ({ onReaction, count, ...props }, ref) => {
    const mx = useMatrixClient();
    const recentEmojis = useRecentEmoji(mx, count);

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
const MessageCopyLinkItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const handleCopy = () => {
    const eventId = mEvent.getId();
    if (!eventId) return;
    copyToClipboard(getMatrixToRoomEvent(room.roomId, eventId, getViaServers(room)));
    onClose();
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

const MessageCopyTextItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const handleCopy = () => {
    const content = mEvent.getContent();
    const pmp = content[MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME];
    const body = pmp ? content?.body?.replace(`${pmp.displayname}: `, '') : content?.body;

    if (body) copyToClipboard(body);
    onClose();
  };

  return (
    <MenuItem
      size="300"
      after={menuIcon(CopyIcon)}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Copy Message
      </Text>
    </MenuItem>
  );
});

const MessagePinItem = as<
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

const MessageBookmarkItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const eventId = mEvent.getId() ?? '';
  const bookmarked = useIsBookmarked(room.roomId, eventId);
  const { add, remove } = useBookmarkActions();

  const handleClick = async () => {
    onClose?.();
    if (bookmarked) {
      await remove(computeBookmarkId(room.roomId, eventId));
    } else {
      const item = createBookmarkItem(room, mEvent);
      if (item) await add(item);
    }
  };

  return (
    <MenuItem
      size="300"
      after={menuIcon(BookmarkIcon, {
        weight: bookmarked ? 'fill' : 'regular',
      })}
      radii="300"
      onClick={handleClick}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {bookmarked ? 'Remove Bookmark' : 'Bookmark Message'}
      </Text>
    </MenuItem>
  );
});

const MessageFavoriteGifItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const content = mEvent.getContent();
  const favoriteGif = getFavoriteGifFromMessageContent(content);
  const url = favoriteGif?.mediaUrl ?? '';
  const favoritedContent = useFavoriteGifs();
  const [favorited, setFavorited] = useState(
    favoritedContent.gifs.find((v) => v.mediaUrl == url) != undefined
  );
  const handleClick = async () => {
    if (!favoriteGif) {
      onClose?.();
      return;
    }
    if (!favorited) {
      setFavorited(true);
      await mx
        .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
          gifs: [...favoritedContent.gifs, favoriteGif],
        })
        .catch(() => setFavorited(false));
    } else {
      setFavorited(false);
      await mx
        .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
          gifs: favoritedContent.gifs.filter((v) => v.mediaUrl != url),
        })
        .catch(() => setFavorited(true));
    }

    onClose?.();
  };
  return (
    <MenuItem
      size="300"
      after={menuIcon(Star, {
        weight: favorited ? 'fill' : 'regular',
      })}
      radii="300"
      onClick={handleClick}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {favorited ? 'Unfavorite Gif' : 'Favorite Gif'}
      </Text>
    </MenuItem>
  );
});

type OptionEmojiMenuProps = {
  mEvent: MatrixEvent;
  closeMenu: () => void;
  onReactionToggle?: (targetEventId: string, key: string, shortcode?: string) => void;
  setEmojiBoardAnchor?: Dispatch<SetStateAction<RectCords | undefined>>;
  emojiBoardAnchor?: RectCords;
  imagePackRooms?: Room[];
  isQuickOptions?: boolean;
};
function OptionsEmojiBoard({
  mEvent,
  onReactionToggle,
  closeMenu,
  setEmojiBoardAnchor,
  emojiBoardAnchor,
  imagePackRooms,
  isQuickOptions,
}: OptionEmojiMenuProps) {
  const position =
    (!isQuickOptions && 'Left') ||
    ((emojiBoardAnchor?.y ?? 0) > window.innerHeight / 2 && 'Top') ||
    'Bottom';
  return (
    <PopOut
      position={position}
      align={isQuickOptions ? 'End' : 'Start'}
      offset={undefined}
      anchor={emojiBoardAnchor}
      content={
        <Menu>
          <EmojiBoard
            imagePackRooms={imagePackRooms ?? []}
            returnFocusOnDeactivate={false}
            allowTextCustomEmoji
            onEmojiSelect={(key) => {
              onReactionToggle?.(mEvent.getId() ?? '', key);
              setEmojiBoardAnchor?.(undefined);
              closeMenu();
            }}
            onCustomEmojiSelect={(mxc, shortcode) => {
              onReactionToggle?.(mEvent.getId() ?? '', mxc, shortcode);
              setEmojiBoardAnchor?.(undefined);
              closeMenu();
            }}
            requestClose={() => {
              setEmojiBoardAnchor?.(undefined);
              closeMenu();
            }}
          />
        </Menu>
      }
    ></PopOut>
  );
}

type OptionsReproxyPersonaPickerProps = {
  mx: MatrixClient;
  mEvent: MatrixEvent;
  roomId: string;
  closeMenu: () => void;
  anchor: RectCords;
};
function OptionsReproxyPersonaPicker({
  mx,
  mEvent,
  roomId,
  closeMenu,
  anchor,
}: OptionsReproxyPersonaPickerProps) {
  const reproxyMessage = async (profile: PerMessageProfileMsc4461 | undefined) => {
    const content = buildReplacementPmpContent(mEvent.getContent(), mEvent.getId()!, profile);
    await mx.sendMessage(roomId, content as RoomMessageEventContent);

    closeMenu();
  };

  return (
    <>
      <TemporaryPersonaPicker
        mx={mx}
        onPersonaSelect={reproxyMessage}
        requestClose={closeMenu}
        anchor={anchor}
      />
    </>
  );
}

export function OptionQuickMenu({
  mEvent,
  room,
  closeMenu,
  onReactionToggle,
  canSendReaction,
  relations,
  onReplyClick,
  onEditId,
  onReproxyId,
  hideReadReceipts,
  showDeveloperTools,
  canPinEvent,
  canDelete,
  handleOpenMenu,
  menuAnchor,
  imagePackRooms,
  setIsEmoji,
  isGif,
}: OptionMenuProps) {
  const mx = useMatrixClient();
  const isThreadedMessage = isThreadRelationEvent(mEvent, mEvent.threadRootId);

  const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();

  const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
    setEmojiBoardAnchor?.(target.getBoundingClientRect());
    setIsEmoji?.(true);
  };

  return (
    <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
      <Box gap="100">
        {canSendReaction && setIsEmoji && (
          <>
            {emojiBoardAnchor && (
              <OptionsEmojiBoard
                mEvent={mEvent}
                onReactionToggle={onReactionToggle}
                closeMenu={closeMenu}
                setEmojiBoardAnchor={setEmojiBoardAnchor}
                emojiBoardAnchor={emojiBoardAnchor}
                imagePackRooms={imagePackRooms}
                isQuickOptions
              />
            )}

            <IconButton
              onClick={handleOpenEmojiBoard}
              variant="SurfaceVariant"
              size="300"
              radii="300"
              aria-pressed={!!emojiBoardAnchor}
              className={OptionsCss.UserQuickMenuButton}
            >
              {menuIcon(Smiley)}
            </IconButton>
          </>
        )}
        <IconButton
          onClick={(ev) => {
            onReplyClick(ev);
            closeMenu();
          }}
          data-event-id={mEvent.getId()}
          variant="SurfaceVariant"
          size="300"
          radii="300"
          className={OptionsCss.UserQuickMenuButton}
        >
          {menuIcon(ArrowBendUpLeftIcon)}
        </IconButton>
        {!isThreadedMessage && (
          <IconButton
            onClick={(ev) => {
              onReplyClick(ev, true);
              closeMenu();
            }}
            data-event-id={mEvent.getId()}
            variant="SurfaceVariant"
            size="300"
            radii="300"
            className={OptionsCss.UserQuickMenuButton}
          >
            {menuIcon(ChatCircleDots)}
          </IconButton>
        )}
        {canEditEvent(mx, mEvent) && onEditId && (
          <IconButton
            onClick={() => {
              onEditId(mEvent.getId());
              closeMenu();
            }}
            variant="SurfaceVariant"
            size="300"
            radii="300"
            className={OptionsCss.UserQuickMenuButton}
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
            <OptionMenu
              mEvent={mEvent}
              room={room}
              closeMenu={closeMenu}
              onReactionToggle={onReactionToggle}
              relations={relations}
              onReplyClick={onReplyClick}
              onEditId={onEditId}
              onReproxyId={onReproxyId}
              hideReadReceipts={hideReadReceipts}
              showDeveloperTools={showDeveloperTools}
              canPinEvent={canPinEvent}
              canDelete={canDelete}
              setIsEmoji={setIsEmoji}
              emojiBoardAnchor={menuAnchor}
              canSendReaction={canSendReaction}
              isGif={isGif}
            />
          }
        >
          <IconButton
            variant="SurfaceVariant"
            size="300"
            radii="300"
            onClick={handleOpenMenu}
            aria-pressed={!!menuAnchor}
            className={OptionsCss.UserQuickMenuButton}
          >
            {menuIcon(DotsThreeOutlineVerticalIcon, {
              weight: menuAnchor ? 'fill' : 'regular',
            })}
          </IconButton>
        </PopOut>
      </Box>
    </Menu>
  );
}

const triggerRect = (evt: Parameters<MouseEventHandler<HTMLButtonElement>>[0]): RectCords =>
  evt.currentTarget.parentElement?.parentElement?.getBoundingClientRect() ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

export type OptionMenuProps = {
  mEvent: MatrixEvent;
  room: Room;
  closeMenu: () => void;
  onReactionToggle?: (targetEventId: string, key: string, shortcode?: string) => void;
  relations?: Relations;
  canSendReaction?: boolean;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onEditId?: (eventId?: string) => void;
  onReproxyId?: (profileId?: string) => void;
  hideReadReceipts?: boolean;
  hideReplyButton?: boolean;
  showDeveloperTools?: boolean;
  canPinEvent?: boolean;
  canDelete?: boolean;
  handleOpenMenu?: MouseEventHandler<HTMLButtonElement>;
  menuAnchor?: RectCords | undefined;
  isGif?: boolean;

  emojiBoardAnchor?: RectCords;
  imagePackRooms?: Room[];
  setIsEmoji?: Dispatch<SetStateAction<boolean>>;
  ActualMessage?: ReactNode;
  isModal?: boolean;
  closeMessageMenu?: () => void;
};

function OptionMenu({
  mEvent,
  room,
  closeMenu: requestClose,
  onReactionToggle,
  canSendReaction,
  relations,
  onReplyClick,
  onEditId,
  hideReadReceipts,
  hideReplyButton,
  showDeveloperTools,
  canPinEvent,
  canDelete,
  imagePackRooms,
  setIsEmoji,
  ActualMessage,
  isModal,
  isGif,
  closeMessageMenu,
}: OptionMenuProps) {
  const mobileSheetClose = useMobileSheetClose();
  const closeMenu = mobileSheetClose ?? requestClose;
  const setModal = useSetAtom(modalAtom);
  const pushModal = useSetAtom(pushModalAtom);
  const store = useStore();
  const mx = useMatrixClient();
  const isThreadedMessage = isThreadRelationEvent(mEvent, mEvent.threadRootId);
  const isStickerMessage = mEvent.getType() === (EventType.Sticker as string);
  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = !!edits?.length;
  const [showPersonaSetting] = useSetting(settingsAtom, 'showPersonaSetting');

  const closeAfterHandOff = closeMessageMenu ?? requestClose;

  const onTotalClose = () => {
    setModal(null);
    closeMenu();
  };

  const handlePostDeactivate = useCallback(() => {
    const modal = store.get(modalAtom);
    if (modal?.type === ModalType.MobileOptions) setModal(null);
  }, [store, setModal]);

  const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();

  const [reproxyPickerAnchor, setReproxyPickerAnchor] = useState<RectCords>();

  const handleOpenReproxyPicker: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (isModal) {
      pushModal({
        type: ModalType.ReproxyPicker,
        room,
        mEvent,
        closeMenu: closeAfterHandOff,
      });
      return;
    }
    setReproxyPickerAnchor(triggerRect(evt));
  };

  const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (isModal) {
      pushModal({
        type: ModalType.ReactionPicker,
        mEvent,
        imagePackRooms,
        onReactionToggle,
        closeMenu: closeAfterHandOff,
      });
      return;
    }
    setEmojiBoardAnchor?.(triggerRect(evt));
    setIsEmoji?.(true);
  };

  return (
    <>
      {emojiBoardAnchor !== undefined && (
        <OptionsEmojiBoard
          mEvent={mEvent}
          onReactionToggle={onReactionToggle}
          closeMenu={onTotalClose}
          setEmojiBoardAnchor={setEmojiBoardAnchor}
          emojiBoardAnchor={emojiBoardAnchor}
          imagePackRooms={imagePackRooms}
        />
      )}
      {reproxyPickerAnchor !== undefined && (
        <OptionsReproxyPersonaPicker
          mx={mx}
          roomId={room.roomId}
          mEvent={mEvent}
          closeMenu={onTotalClose}
          anchor={reproxyPickerAnchor}
        />
      )}
      <FocusTrap
        focusTrapOptions={{
          initialFocus: false,
          onDeactivate: closeMenu,
          onPostDeactivate: handlePostDeactivate,
          allowOutsideClick: (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            closeMenu();
            return false;
          },
          isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
          isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
          escapeDeactivates: stopPropagation,
        }}
      >
        <Menu className={isModal ? css.MessageOptionsSheetMenu : ''}>
          {ActualMessage && (
            <>
              <WrappedMessage isModal={isModal} ActualMessage={ActualMessage} />
              <Line direction="Horizontal" variant="SurfaceVariant" />
            </>
          )}
          <Box
            className={css.PreventSelect}
            direction="Column"
            grow="Yes"
            shrink="No"
            style={{ maxHeight: '75%' }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {canSendReaction && onReactionToggle && setIsEmoji && (
              <MessageQuickReactions
                onReaction={(key, shortcode) => {
                  onReactionToggle(mEvent.getId() ?? '', key, shortcode);
                  onTotalClose();
                }}
                count={isModal ? 8 : 4}
              />
            )}
            <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
              {canSendReaction && onReactionToggle && handleOpenEmojiBoard && (
                <MenuItem
                  size="300"
                  after={menuIcon(Smiley)}
                  radii="300"
                  onClick={handleOpenEmojiBoard}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Add Reaction
                  </Text>
                </MenuItem>
              )}

              {canEditEvent(mx, mEvent) && onEditId && isModal && (
                <MenuItem
                  size="300"
                  after={menuIcon(PencilSimple)}
                  radii="300"
                  data-event-id={mEvent.getId()}
                  onClick={() => {
                    onEditId(mEvent.getId());
                    onTotalClose();
                  }}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Edit Message
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
                      onTotalClose();
                    }}
                  >
                    <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                      Steal Sticker
                    </Text>
                  </MenuItem>
                )}
              {relations && (
                <MessageAllReactionItem room={room} relations={relations} closeMenu={closeMenu} />
              )}
              {isGif && isModal && (
                <MessageFavoriteGifItem room={room} mEvent={mEvent} onClose={closeMenu} />
              )}
              {!hideReplyButton && (
                <MenuItem
                  size="300"
                  after={menuIcon(ArrowBendUpLeftIcon)}
                  radii="300"
                  data-event-id={mEvent.getId()}
                  onClick={(evt) => {
                    onReplyClick(evt);
                    onTotalClose();
                  }}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Reply
                  </Text>
                </MenuItem>
              )}
              {!isThreadedMessage && (
                <MenuItem
                  size="300"
                  after={menuIcon(ChatCircleDots)}
                  radii="300"
                  data-event-id={mEvent.getId()}
                  onClick={(evt) => {
                    onReplyClick(evt, true);
                    onTotalClose();
                  }}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Reply in Thread
                  </Text>
                </MenuItem>
              )}
              {canEditEvent(mx, mEvent) && onEditId && !isModal && (
                <MenuItem
                  size="300"
                  after={menuIcon(PencilSimple)}
                  radii="300"
                  data-event-id={mEvent.getId()}
                  onClick={() => {
                    onEditId(mEvent.getId());
                    onTotalClose();
                  }}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Edit Message
                  </Text>
                </MenuItem>
              )}
              {canEditEvent(mx, mEvent) && showPersonaSetting && (
                <MenuItem
                  size="300"
                  after={menuIcon(UserIcon)}
                  radii="300"
                  data-event-id={mEvent.getId()}
                  onClick={handleOpenReproxyPicker}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Change Persona
                  </Text>
                </MenuItem>
              )}
              {!hideReadReceipts && (
                <MessageReadReceiptItem
                  room={room}
                  eventId={mEvent.getId() ?? ''}
                  closeMenu={closeMenu}
                />
              )}
              {isEdited && (
                <MessageEditHistoryItem room={room} mEvent={mEvent} closeMenu={closeMenu} />
              )}
              {showDeveloperTools && (
                <MessageSourceCodeItem room={room} mEvent={mEvent} closeMenu={closeMenu} />
              )}
              <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={onTotalClose} />

              <MessageCopyTextItem room={room} mEvent={mEvent} onClose={onTotalClose} />
              {canForwardEvent(mEvent) && (
                <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
              )}
              <MessageBookmarkItem room={room} mEvent={mEvent} onClose={closeMenu} />
              {canPinEvent && <MessagePinItem room={room} mEvent={mEvent} onClose={onTotalClose} />}
            </Box>
            {((!mEvent.isRedacted() && canDelete) || mEvent.getSender() !== mx.getUserId()) && (
              <>
                <Line size="300" />
                <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                  {!mEvent.isRedacted() && canDelete && (
                    <MessageDeleteItem room={room} mEvent={mEvent} closeMenu={closeMenu} />
                  )}
                  {mEvent.getSender() !== mx.getUserId() && (
                    <MessageReportItem room={room} mEvent={mEvent} closeMenu={closeMenu} />
                  )}
                </Box>
              </>
            )}
          </Box>
        </Menu>
      </FocusTrap>
    </>
  );
}

export function MobileOptionsInternal({ options }: { options: OptionMenuProps }) {
  const [isActive, setIsActive] = useState(true);
  const [modal, setModal] = useAtom(modalAtom);

  // The composer keeps the mobile keyboard open until its focused element is blurred.
  useLayoutEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  }, []);

  useEffect(() => {
    if (modal?.type === ModalType.MobileOptions) setIsActive(true);
    if (!isActive) setModal(null);
  }, [modal, setIsActive, isActive, setModal]);

  const requestClose = () => {
    options.closeMenu();
    setIsActive(false);
  };

  if (isActive)
    return (
      <MobileSwipeDownModal requestClose={requestClose}>
        {() => (
          <OptionMenu
            mEvent={options.mEvent}
            room={options.room}
            closeMenu={requestClose}
            onReactionToggle={options.onReactionToggle}
            relations={options.relations}
            onReplyClick={options.onReplyClick}
            onEditId={options.onEditId}
            hideReadReceipts={options.hideReadReceipts}
            showDeveloperTools={options.showDeveloperTools}
            canPinEvent={options.canPinEvent}
            canDelete={options.canDelete}
            setIsEmoji={options.setIsEmoji}
            imagePackRooms={options.imagePackRooms}
            closeMessageMenu={options.closeMenu}
            ActualMessage={options.ActualMessage}
            canSendReaction={options.canSendReaction}
            isModal
            isGif={options.isGif}
          />
        )}
      </MobileSwipeDownModal>
    );
  return <></>;
}
