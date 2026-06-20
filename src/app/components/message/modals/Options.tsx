import type { RoomPinnedEventsEventContent, StateEvents } from '$types/matrix-sdk';
import { type Room, type MatrixEvent, type Relations, EventType } from '$types/matrix-sdk';
import { canEditEvent, canForwardEvent, getEventEdits, isThreadRelationEvent } from '$utils/room';
import { MessageReportItem } from './MessageReport';
import type { RectCords } from 'folds';
import { as, Box, config, IconButton, Line, Menu, MenuItem, PopOut, Text } from 'folds';
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
  SmileySticker,
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

import * as css from '$features/room/message/styles.css';
import { useAtom, useSetAtom, useStore } from 'jotai';
import type { Dispatch, MouseEventHandler, ReactNode, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MessageDeleteItem } from './MessageDelete';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { modalAtom, ModalType } from '$state/modal';
import { copyToClipboard } from '$utils/dom';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { EmojiBoard } from '$components/emoji-board';
import { MemoizedBody, type ReactionHandler } from '$features/room/message';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { CaretDoubleRightIcon, CopySimpleIcon } from '@phosphor-icons/react';
import { M_TEXT } from 'matrix-js-sdk';

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
  handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement>;
};
export const MessageQuickReactions = as<'div', MessageQuickReactionsProps>(
  ({ onReaction, count, handleOpenEmojiBoard, ...props }, ref) => {
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
          <IconButton
            key={'base'}
            className={css.MessageQuickReaction}
            size="300"
            variant="SurfaceVariant"
            radii="Pill"
            title={'Open Emoji Board'}
            aria-label={'Open Emoji Board'}
            onClick={handleOpenEmojiBoard}
          >
            {/*the simple Smiley crept me out to stare at me straight next to the cursor*/}
            {menuIcon(SmileySticker)}
          </IconButton>
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
const MessageCopyOriginalItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const handleCopy = () => {
    const content = mEvent.getContent();
    if (!content) return;
    const body = content.body ?? content[M_TEXT.name];
    if (!body) return;
    copyToClipboard(body);
    onClose();
  };

  return (
    <MenuItem
      size="300"
      after={menuIcon(CopySimpleIcon)}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Copy Original
      </Text>
    </MenuItem>
  );
});

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

export type OptionEmojiMenuProps = {
  mEvent: MatrixEvent;
  closeMenu: () => void;
  onReactionToggle?: (targetEventId: string, key: string, shortcode?: string) => void;
  setEmojiBoardAnchor?: Dispatch<SetStateAction<RectCords | undefined>>;
  emojiBoardAnchor?: RectCords;
  imagePackRooms?: Room[];
  isQuickOptions?: boolean;
  isModal?: boolean;
  ActualMessage?: ReactNode;
};
export function OptionsEmojiBoard({
  mEvent,
  onReactionToggle,
  closeMenu,
  setEmojiBoardAnchor,
  emojiBoardAnchor,
  imagePackRooms,
  isQuickOptions,
  isModal,
  ActualMessage,
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
      style={isModal ? { width: '100%' } : {}}
      content={
        <Menu>
          {ActualMessage}
          <EmojiBoard
            imagePackRooms={imagePackRooms ?? []}
            returnFocusOnDeactivate={false}
            allowTextCustomEmoji
            isFullWidth={isModal}
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

export function OptionQuickMenu({
  mEvent,
  room,
  closeMenu,
  onReactionToggle,
  canSendReaction,
  relations,
  onReplyClick,
  onEditId,
  hideReadReceipts,
  showDeveloperTools,
  canPinEvent,
  canDelete,
  handleOpenMenu,
  menuAnchor,
  imagePackRooms,
  setIsEmoji,
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
              hideReadReceipts={hideReadReceipts}
              showDeveloperTools={showDeveloperTools}
              canPinEvent={canPinEvent}
              canDelete={canDelete}
              setIsEmoji={setIsEmoji}
              emojiBoardAnchor={menuAnchor}
              canSendReaction={canSendReaction}
            />
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
  );
}

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
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  canPinEvent?: boolean;
  canDelete?: boolean;
  handleOpenMenu?: MouseEventHandler<HTMLButtonElement>;
  menuAnchor?: RectCords | undefined;

  emojiBoardAnchor?: RectCords;
  imagePackRooms?: Room[];
  setIsEmoji?: Dispatch<SetStateAction<boolean>>;
  ActualMessage?: ReactNode;
  isModal?: boolean;
};

export function OptionMenu({
  mEvent,
  room,
  closeMenu,
  onReactionToggle,
  canSendReaction,
  relations,
  onReplyClick,
  onEditId,
  hideReadReceipts,
  showDeveloperTools,
  canPinEvent,
  canDelete,
  imagePackRooms,
  setIsEmoji,
  ActualMessage,
  isModal,
}: OptionMenuProps) {
  const setModal = useSetAtom(modalAtom);
  const store = useStore();
  const mx = useMatrixClient();
  const isThreadedMessage = isThreadRelationEvent(mEvent, mEvent.threadRootId);
  const isStickerMessage = mEvent.getType() === 'm.sticker';
  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = !!edits?.length;

  const onTotalClose = () => {
    setModal(null);
    closeMenu();
  };
  const [showMore, setShowMore] = useState(false);
  // Written like this to make it easier to change the amount of items required and which they should be
  const overflow =
    ((!!relations && 1) || 0) + ((canPinEvent && 1) || 0) + ((!hideReadReceipts && 1) || 0) >= 2;

  const handlePostDeactivate = useCallback(() => {
    const modal = store.get(modalAtom);
    if (modal?.type === ModalType.MobileOptions) setModal(null);
  }, [store, setModal]);

  const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();

  const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = (evt) => {
    // THIS MAGIC NUMBER SHOULD BE FIXED WHEN SOMEONE FIGURES OUT WHY THE LACK OF IT CREATES A GAP IN THE EMOJIBOARD
    const target = isModal
      ? { x: 0, y: innerHeight + 10, width: 0, height: 0 }
      : (evt.currentTarget.parentElement?.parentElement?.getBoundingClientRect() ?? {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        });
    setEmojiBoardAnchor?.(target);
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
          isModal={isModal}
          ActualMessage={<WrappedMessage isModal={isModal} ActualMessage={ActualMessage} />}
        />
      )}
      <FocusTrap
        focusTrapOptions={{
          initialFocus: false,
          onDeactivate: closeMenu,
          onPostDeactivate: handlePostDeactivate,
          allowOutsideClick: (e) => {
            e.preventDefault();
            closeMenu();
            return false;
          },
          isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
          isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
          escapeDeactivates: stopPropagation,
        }}
      >
        <Menu
          onContextMenu={(e) => e.preventDefault()}
          className={isModal ? css.MessageOptionsMenu : ''}
        >
          {ActualMessage && !emojiBoardAnchor && (
            <>
              <WrappedMessage isModal={isModal} ActualMessage={ActualMessage} />
              <Line direction="Horizontal" variant="SurfaceVariant" />
            </>
          )}
          <Box direction="Column" grow="Yes" shrink="No" style={{ maxHeight: '75%' }}>
            {canSendReaction && onReactionToggle && setIsEmoji && (
              <MessageQuickReactions
                onReaction={(key, shortcode) => {
                  onReactionToggle(mEvent.getId() ?? '', key, shortcode);
                  onTotalClose();
                }}
                handleOpenEmojiBoard={handleOpenEmojiBoard}
                count={isModal ? 5 : 3}
              />
            )}
            <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
              {!showMore ? (
                <>
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
                  {relations && !overflow && (
                    <MessageAllReactionItem room={room} relations={relations} />
                  )}
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
                  {canEditEvent(mx, mEvent) && onEditId && (
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
                  {!hideReadReceipts && !overflow && (
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
                  <MessageCopyOriginalItem room={room} mEvent={mEvent} onClose={onTotalClose} />
                  {!overflow && (
                    <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={onTotalClose} />
                  )}
                  {canForwardEvent(mEvent) && (
                    <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
                  )}
                  {canPinEvent && !overflow && (
                    <MessagePinItem room={room} mEvent={mEvent} onClose={onTotalClose} />
                  )}
                </>
              ) : (
                <>
                  {relations && <MessageAllReactionItem room={room} relations={relations} />}

                  {!hideReadReceipts && (
                    <MessageReadReceiptItem
                      room={room}
                      eventId={mEvent.getId() ?? ''}
                      closeMenu={closeMenu}
                    />
                  )}
                  <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={onTotalClose} />

                  {canPinEvent && (
                    <MessagePinItem room={room} mEvent={mEvent} onClose={onTotalClose} />
                  )}
                </>
              )}

              {overflow && (
                <MenuItem
                  size="300"
                  after={menuIcon(CaretDoubleRightIcon)}
                  radii="300"
                  data-event-id={mEvent.getId()}
                  onClick={() => {
                    setShowMore(!showMore);
                  }}
                >
                  <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
                    Next Page
                  </Text>
                </MenuItem>
              )}
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
          </Box>
        </Menu>
      </FocusTrap>
    </>
  );
}

export function MobileOptionsInternal({ options }: { options: OptionMenuProps }) {
  const [isActive, setIsActive] = useState(true);
  const [modal, setModal] = useAtom(modalAtom);
  useEffect(() => {
    if (modal?.type === ModalType.MobileOptions) setIsActive(true);
    if (!isActive) setModal(null);
  }, [modal, setIsActive, isActive, setModal]);
  if (isActive)
    return (
      <Box className={css.MessageMobileOptionsWrapped}>
        <Box className={css.MessageMobileOptionsContainer}>
          <OptionMenu
            mEvent={options.mEvent}
            room={options.room}
            closeMenu={() => {
              options.closeMenu();
              setIsActive(false);
            }}
            onReactionToggle={options.onReactionToggle}
            relations={options.relations}
            onReplyClick={options.onReplyClick}
            onEditId={options.onEditId}
            hideReadReceipts={options.hideReadReceipts}
            showDeveloperTools={options.showDeveloperTools}
            canPinEvent={options.canPinEvent}
            canDelete={options.canDelete}
            setIsEmoji={options.setIsEmoji}
            ActualMessage={options.ActualMessage}
            canSendReaction={options.canSendReaction}
            isModal
          />
        </Box>
      </Box>
    );
  return <></>;
}
