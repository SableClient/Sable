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
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import type { Dispatch, MouseEventHandler, ReactNode, SetStateAction } from 'react';
import { useCallback, useEffect, useState, useRef } from 'react';
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
export const MessageQuickReactions = as<'div', MessageQuickReactionsProps>(
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
  dragOpts?: DragOptsProps;
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
  dragOpts,
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
          {dragOpts?.dragHandle}
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
  hideReplyButton,
  showDeveloperTools,
  canPinEvent,
  cleanedDisplayName,
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
        {!hideReplyButton && (
          <>
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
          </>
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
              hideReplyButton={hideReplyButton}
              showDeveloperTools={showDeveloperTools}
              canPinEvent={canPinEvent}
              cleanedDisplayName={cleanedDisplayName}
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

export type DragOptsProps = {
  dragHandle?: ReactNode;
  onTouchStart?: (evt: React.TouchEvent) => void;
  onTouchMove?: (evt: React.TouchEvent) => void;
  onTouchEnd?: () => void;
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
  hideReadReceipts?: boolean;
  hideReplyButton?: boolean;
  showDeveloperTools?: boolean;
  canPinEvent?: boolean;
  cleanedDisplayName?: string;
  canDelete?: boolean;
  handleOpenMenu?: MouseEventHandler<HTMLButtonElement>;
  menuAnchor?: RectCords | undefined;

  emojiBoardAnchor?: RectCords;
  imagePackRooms?: Room[];
  setIsEmoji?: Dispatch<SetStateAction<boolean>>;
  ActualMessage?: ReactNode;
  isModal?: boolean;
  dragOpts?: DragOptsProps;
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
  hideReplyButton,
  showDeveloperTools,
  canPinEvent,
  cleanedDisplayName,
  canDelete,
  imagePackRooms,
  setIsEmoji,
  ActualMessage,
  isModal,
  dragOpts,
}: OptionMenuProps) {
  const setModal = useSetAtom(modalAtom);
  const store = useStore();
  const mx = useMatrixClient();
  const isThreadedMessage = isThreadRelationEvent(mEvent, mEvent.threadRootId);
  const isStickerMessage = mEvent.getType() === 'm.stidoecker';
  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = !!edits?.length;

  const [nickEditOpen, setNickEditOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const nicknames = useAtomValue(nicknamesAtom);
  const setNickname = useSetAtom(setNicknameAtom);
  const senderId = mEvent.getSender() ?? '';

  const onTotalClose = () => {
    setModal(null);
    closeMenu();
  };

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
          dragOpts={dragOpts}
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
          {dragOpts?.dragHandle}
          {ActualMessage && !emojiBoardAnchor && (
            <>
              <WrappedMessage isModal={isModal} ActualMessage={ActualMessage} />
              <Line direction="Horizontal" variant="SurfaceVariant" />
            </>
          )}
          <Box
            direction="Column"
            grow="Yes"
            shrink="No"
            style={{ maxHeight: '75%' }}
            onTouchStart={dragOpts?.onTouchStart}
            onTouchMove={dragOpts?.onTouchMove}
            onTouchEnd={dragOpts?.onTouchEnd}
          >
            {canSendReaction && onReactionToggle && setIsEmoji && (
              <MessageQuickReactions
                onReaction={(key, shortcode) => {
                  onReactionToggle(mEvent.getId() ?? '', key, shortcode);
                  onTotalClose();
                }}
                count={isModal ? 6 : 4}
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
                      Add to User Sticker Pack
                    </Text>
                  </MenuItem>
                )}
              {relations && <MessageAllReactionItem room={room} relations={relations} />}
              {!hideReplyButton && (
                <>
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
                </>
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
              {canForwardEvent(mEvent) && (
                <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
              )}
              {canPinEvent && <MessagePinItem room={room} mEvent={mEvent} onClose={onTotalClose} />}
              {cleanedDisplayName &&
                senderId !== mx.getUserId() &&
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
                      className={css.MessageNickEditor}
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
                            onTotalClose();
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
  const touchStartY = useRef<number | null>(null);
  const [touchYDiff, setTouchYDiff] = useState(0);
  const date = new Date();
  const startTime = useRef(0);

  useEffect(() => {
    if (modal?.type === ModalType.MobileOptions) setIsActive(true);
    if (!isActive) setModal(null);
  }, [modal, setIsActive, isActive, setModal]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
    startTime.current = date.getTime();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || !e.touches[0]) return;
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY.current;

    // Only allow pulling down
    if (diff > 0) {
      setTouchYDiff(diff);
    }
  };

  const handleTouchEnd = () => {
    const endTime = date.getTime();
    if (touchYDiff > 100 || (endTime - startTime.current < 600 && touchYDiff > 20)) {
      options.closeMenu();
      setIsActive(false);
    } else {
      setTouchYDiff(0);
    }
    touchStartY.current = null;
  };

  const dragHandleJSX = (
    <div
      className={css.MessageMobileDragHandle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className={css.MessageMobileDragIndicator} />
    </div>
  );

  const dragOpts: DragOptsProps = {
    dragHandle: dragHandleJSX,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  if (isActive)
    return (
      <Box
        className={css.MessageMobileOptionsWrapped}
        data-gestures="ignore"
        onClick={() => {
          options.closeMenu();
          setIsActive(false);
        }}
        onTouchStart={(e: React.TouchEvent) => e.stopPropagation()}
        onTouchMove={(e: React.TouchEvent) => e.stopPropagation()}
        onTouchEnd={(e: React.TouchEvent) => e.stopPropagation()}
      >
        <Box
          className={css.MessageMobileOptionsContainer}
          style={{
            transform: touchYDiff > 0 ? `translateY(${touchYDiff}px)` : undefined,
            transition: touchStartY.current === null ? 'transform 0.2s ease-out' : 'none',
          }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
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
            cleanedDisplayName={options.cleanedDisplayName}
            canDelete={options.canDelete}
            setIsEmoji={options.setIsEmoji}
            ActualMessage={options.ActualMessage}
            canSendReaction={options.canSendReaction}
            isModal
            dragOpts={dragOpts}
            hideReplyButton={options.hideReplyButton}
          />
        </Box>
      </Box>
    );
  return <></>;
}
