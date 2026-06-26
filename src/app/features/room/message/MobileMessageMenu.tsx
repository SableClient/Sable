import { createPortal } from 'react-dom';
import { MenuItem, Text } from 'folds';
import * as messageCss from './styles.css';
import type { MouseEventHandler, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import { memo } from 'react';
import { useEffect, useCallback, useRef, useState } from 'react';
import { EmojiBoard } from '$components/emoji-board';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MatrixEvent, Relations, Room, RoomPinnedEventsEventContent } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import type { StateEvents } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { canEditEvent, getEventEdits } from '$utils/room';
import { modalAtom, ModalType } from '$state/modal';
import { MessageDeleteItem } from '$components/message/modals/MessageDelete';
import { MessageReportItem } from '$components/message/modals/MessageReport';
import { copyToClipboard } from '$utils/dom';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { useKeyboardHeight } from '$hooks/ios-keyboard-fix';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useMemberPowerCompare } from '$hooks/useMemberPowerCompare';
import { computeBookmarkId, createBookmarkItem } from '$features/bookmarks/bookmarkDomain';
import { useIsBookmarked, useBookmarkActions } from '$features/bookmarks/useBookmarks';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import * as css from './MobileMessageMenu.css';
import { Icon, Icons } from '$app/icons';

export type MobileMessageMenuProps = {
  room: Room;
  mEvent: MatrixEvent;
  canDelete?: boolean;
  canSendReaction?: boolean;
  canPinEvent?: boolean;
  relations?: Relations;
  isThreadedMessage?: boolean;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onEditId?: (eventId?: string) => void;
  imagePackRooms: Room[];
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
  onClose: () => void;
  messagePreview?: ReactNode;
};

const PreviewBody = memo(({ children }: { children: ReactNode }) => children);

function QuickReactions({
  onReaction,
  onOpenEmojiBoard,
}: {
  onReaction: (key: string, shortcode: string) => void;
  onOpenEmojiBoard?: () => void;
}) {
  const mx = useMatrixClient();
  const recentEmojis = useRecentEmoji(mx, 6);

  return (
    <div className={css.ReactionsRow}>
      {recentEmojis.map((emoji) => (
        <button
          key={emoji.unicode}
          type="button"
          className={css.ReactionBtn}
          onClick={() => onReaction(emoji.unicode, emoji.shortcode)}
          aria-label={emoji.shortcode}
        >
          {emoji.unicode}
        </button>
      ))}
      {onOpenEmojiBoard && (
        <button
          type="button"
          className={css.ReactionBtn}
          onClick={onOpenEmojiBoard}
          aria-label="More reactions"
        >
          <Icon src={Icons.SmilePlus} size="200" />
        </button>
      )}
    </div>
  );
}

type ActionItemProps = {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
};

function ActionItem({ icon, label, danger, onClick }: ActionItemProps) {
  return (
    <button
      type="button"
      className={`${css.ActionItem}${danger ? ` ${css.ActionItemDanger}` : ''}`}
      onClick={onClick}
    >
      <span className={css.ActionIcon}>{icon}</span>
      <Text size="T300" as="span">
        {label}
      </Text>
    </button>
  );
}

export function MobileMessageMenu({
  room,
  mEvent,
  canDelete,
  canSendReaction,
  canPinEvent,
  relations,
  isThreadedMessage,
  hideReadReceipts,
  showDeveloperTools,
  onReplyClick,
  onEditId,
  onReactionToggle,
  imagePackRooms,
  onClose,
  messagePreview,
}: MobileMessageMenuProps) {
  const mx = useMatrixClient();
  const setModal = useSetAtom(modalAtom);
  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = edits !== undefined;

  // Pinning
  const pinnedEvents = useRoomPinnedEvents(room);
  const isPinned = pinnedEvents.includes(evtId);

  // Bookmarking
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');
  const isBookmarked = useIsBookmarked(room.roomId, evtId);
  const { add: addBookmark, remove: removeBookmark } = useBookmarkActions();

  // Nicknames
  const nicknames = useAtomValue(nicknamesAtom);
  const setNickname = useSetAtom(setNicknameAtom);
  const [nickEditOpen, setNickEditOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const nickInputRef = useRef<HTMLInputElement>(null);

  // Register a keyboard-height listener so --sable-visible-height is set when the
  // nickname input is focused. The Sheet CSS uses that variable to stay above the keyboard.
  useKeyboardHeight();

  // Delay focus so iOS's synthesised tap fires before the keyboard opens and
  // shifts the sheet, preventing the tap from landing on the backdrop.
  useEffect(() => {
    if (nickEditOpen) {
      const id = setTimeout(() => nickInputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [nickEditOpen]);

  // Kick permissions
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const roomPermissions = useRoomPermissions(creators, powerLevels);
  const { hasMorePower } = useMemberPowerCompare(creators, powerLevels);
  const myUserId = mx.getSafeUserId();
  const senderId = mEvent.getSender() ?? '';
  const canKick =
    senderId !== myUserId &&
    roomPermissions.action('kick', myUserId) &&
    hasMorePower(myUserId, senderId);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Refs for direct DOM manipulation during drag (avoids React re-renders on every frame)
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);

  const handleSheetTouchStart = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0) {
      dragStartYRef.current = e.touches[0]?.clientY ?? null;
    }
  }, []);

  const handleSheetTouchMove = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const deltaY = Math.max(0, touch.clientY - dragStartYRef.current);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      sheetRef.current.style.transition = 'none';
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0, 1 - deltaY / 200));
    }
  }, []);

  const handleSheetTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (dragStartYRef.current === null) return;
      const startY = dragStartYRef.current;
      dragStartYRef.current = null;
      const deltaY = Math.max(0, (e.changedTouches[0]?.clientY ?? startY) - startY);
      if (deltaY > 80) {
        // Animate out then close
        if (sheetRef.current) {
          sheetRef.current.style.transform = 'translateY(100%)';
          sheetRef.current.style.transition = 'transform 200ms ease';
        }
        if (backdropRef.current) {
          backdropRef.current.style.opacity = '0';
          backdropRef.current.style.transition = 'opacity 200ms ease';
        }
        setTimeout(onClose, 200);
      } else {
        // Spring back
        if (sheetRef.current) {
          sheetRef.current.style.transform = '';
          sheetRef.current.style.transition = 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)';
        }
        if (backdropRef.current) {
          backdropRef.current.style.opacity = '';
          backdropRef.current.style.transition = '';
        }
      }
    },
    [onClose]
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleReplyClick = useCallback(() => {
    const mockEvent = {
      currentTarget: { getAttribute: (attr: string) => (attr === 'data-event-id' ? evtId : null) },
    } as unknown as Parameters<MouseEventHandler<HTMLButtonElement>>[0];
    onReplyClick(mockEvent);
    onClose();
  }, [evtId, onReplyClick, onClose]);

  const handleThreadReplyClick = useCallback(() => {
    const mockEvent = {
      currentTarget: { getAttribute: (attr: string) => (attr === 'data-event-id' ? evtId : null) },
    } as unknown as Parameters<MouseEventHandler<HTMLButtonElement>>[0];
    onReplyClick(mockEvent, true);
    onClose();
  }, [evtId, onReplyClick, onClose]);

  const handleEditClick = useCallback(() => {
    onEditId?.(evtId);
    onClose();
  }, [evtId, onEditId, onClose]);

  const handlePinClick = useCallback(() => {
    const pinContent: RoomPinnedEventsEventContent = {
      pinned: Array.from(pinnedEvents).filter((id) => id !== evtId),
    };
    if (!isPinned) pinContent.pinned.push(evtId);
    mx.sendStateEvent(room.roomId, EventType.RoomPinnedEvents as keyof StateEvents, pinContent);
    onClose();
  }, [pinnedEvents, isPinned, evtId, mx, room, onClose]);

  const handleBookmarkClick = useCallback(async () => {
    if (isBookmarked) {
      await removeBookmark(computeBookmarkId(room.roomId, evtId));
    } else {
      const item = createBookmarkItem(room, mEvent);
      if (item) await addBookmark(item);
    }
    onClose();
  }, [isBookmarked, removeBookmark, room, evtId, mEvent, addBookmark, onClose]);

  const handleKick = useCallback(async () => {
    await mx.kick(room.roomId, senderId);
    onClose();
  }, [mx, room, senderId, onClose]);

  const portalContainer = document.getElementById('portalContainer') ?? document.body;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        role="presentation"
        className={css.Backdrop}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={css.Sheet}
        role="dialog"
        aria-modal="true"
        style={showEmojiPicker ? { maxHeight: '90vh', overflowY: 'hidden' } : undefined}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
      >
        <div className={css.Handle} />

        {messagePreview && !showEmojiPicker && (
          <div className={css.MessagePreview}>
            <PreviewBody>{messagePreview}</PreviewBody>
          </div>
        )}

        {showEmojiPicker ? (
          <>
            <div className={css.EmojiPickerHeader}>
              <button
                type="button"
                className={css.EmojiPickerBackBtn}
                onClick={() => setShowEmojiPicker(false)}
                aria-label="Back"
              >
                <Icon src={Icons.ArrowLeft} size="200" />
              </button>
              <Text size="T400" as="span" className={css.EmojiPickerTitle}>
                Add Reaction
              </Text>
            </div>
            <div className={css.EmojiPickerWrap}>
              <EmojiBoard
                imagePackRooms={imagePackRooms}
                returnFocusOnDeactivate={false}
                onEmojiSelect={(key, shortcode) => {
                  onReactionToggle(evtId, key, shortcode);
                  onClose();
                }}
                onCustomEmojiSelect={(mxc, shortcode) => {
                  onReactionToggle(evtId, mxc, shortcode);
                  onClose();
                }}
                requestClose={() => setShowEmojiPicker(false)}
              />
            </div>
          </>
        ) : (
          <>
            {canSendReaction && (
              <QuickReactions
                onReaction={(key, shortcode) => {
                  onReactionToggle(evtId, key, shortcode);
                  onClose();
                }}
                onOpenEmojiBoard={() => setShowEmojiPicker(true)}
              />
            )}

            {/* Group 1: Message actions */}
            <div className={css.ActionGroup}>
              <ActionItem
                icon={<Icon src={Icons.ReplyArrow} size="200" />}
                label="Reply"
                onClick={handleReplyClick}
              />
              {!isThreadedMessage && (
                <ActionItem
                  icon={<Icon src={Icons.ThreadPlus} size="200" />}
                  label="Reply in Thread"
                  onClick={handleThreadReplyClick}
                />
              )}
              {canEditEvent(mx, mEvent) && onEditId && (
                <ActionItem
                  icon={<Icon src={Icons.Pencil} size="200" />}
                  label="Edit Message"
                  onClick={handleEditClick}
                />
              )}
              <ActionItem
                icon={<Icon src={Icons.ArrowGoRight} size="200" />}
                label="Forward"
                onClick={() => {
                  setModal({ type: ModalType.Forward, room, mEvent });
                  onClose();
                }}
              />
              {!hideReadReceipts && (
                <ActionItem
                  icon={<Icon src={Icons.CheckTwice} size="200" />}
                  label="Read Receipts"
                  onClick={() => {
                    setModal({ type: ModalType.ReadReceipts, room, eventId: evtId });
                    onClose();
                  }}
                />
              )}
              {isEdited && (
                <ActionItem
                  icon={<Icon src={Icons.Clock} size="200" />}
                  label="Version History"
                  onClick={() => {
                    setModal({ type: ModalType.EditHistory, room, mEvent });
                    onClose();
                  }}
                />
              )}
              {showDeveloperTools && (
                <ActionItem
                  icon={<Icon src={Icons.BlockCode} size="200" />}
                  label="View Source"
                  onClick={() => {
                    setModal({ type: ModalType.Source, room, mEvent });
                    onClose();
                  }}
                />
              )}
              {relations && (
                <ActionItem
                  icon={<Icon src={Icons.Smile} size="200" />}
                  label="View Reactions"
                  onClick={() => {
                    setModal({ type: ModalType.Reactions, room, relations });
                    onClose();
                  }}
                />
              )}
            </div>

            {/* Group 2: Utility actions */}
            <div className={css.ActionGroup}>
              {canPinEvent && (
                <ActionItem
                  icon={<Icon src={Icons.Pin} size="200" />}
                  label={isPinned ? 'Unpin Message' : 'Pin Message'}
                  onClick={handlePinClick}
                />
              )}
              {enableMessageBookmarks && (
                <ActionItem
                  icon={<Icon src={Icons.Bookmark} size="200" filled={isBookmarked} />}
                  label={isBookmarked ? 'Remove Bookmark' : 'Bookmark Message'}
                  onClick={handleBookmarkClick}
                />
              )}
              {senderId !== myUserId &&
                (nickEditOpen ? (
                  <div className={css.NickEditSection}>
                    <Text size="L400" as="span">
                      Nickname
                    </Text>
                    <input
                      ref={nickInputRef}
                      className={css.NickEditInput}
                      value={nickDraft}
                      onChange={(e) => setNickDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setNickname(senderId, nickDraft || undefined, mx);
                          setNickEditOpen(false);
                          onClose();
                        }
                        if (e.key === 'Escape') setNickEditOpen(false);
                      }}
                    />
                    <div className={css.NickEditActions}>
                      <ActionItem
                        icon={<Icon src={Icons.Check} size="200" />}
                        label="Save"
                        onClick={() => {
                          setNickname(senderId, nickDraft || undefined, mx);
                          setNickEditOpen(false);
                          onClose();
                        }}
                      />
                      {nicknames[senderId] && (
                        <ActionItem
                          icon={<Icon src={Icons.Cross} size="200" />}
                          label="Clear"
                          danger
                          onClick={() => {
                            setNickname(senderId, undefined, mx);
                            setNickEditOpen(false);
                            onClose();
                          }}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <ActionItem
                    icon={<Icon src={Icons.Pencil} size="200" />}
                    label={nicknames[senderId] ? 'Edit Nickname' : 'Set Nickname'}
                    onClick={() => {
                      setNickDraft(nicknames[senderId] ?? '');
                      setNickEditOpen(true);
                    }}
                  />
                ))}
              {(() => {
                const content = mEvent.getContent();
                const body: string | undefined = content['m.new_content']?.body ?? content.body;
                if (!body || mEvent.isRedacted()) return null;
                return (
                  <ActionItem
                    icon={<Icon src={Icons.ClipboardText} size="200" />}
                    label="Copy Text"
                    onClick={() => {
                      copyToClipboard(body);
                      onClose();
                    }}
                  />
                );
              })()}
              {mEvent.getId() && (
                <ActionItem
                  icon={<Icon src={Icons.Link} size="200" />}
                  label="Copy Link"
                  onClick={() => {
                    copyToClipboard(
                      getMatrixToRoomEvent(room.roomId, mEvent.getId()!, getViaServers(room))
                    );
                    onClose();
                  }}
                />
              )}
            </div>

            {/* Group 3: Destructive actions */}
            {(!mEvent.isRedacted() && canDelete) ||
            mEvent.getSender() !== mx.getUserId() ||
            canKick ? (
              <div className={css.ActionGroup}>
                {canKick && (
                  <MenuItem
                    size="300"
                    after={<Icon size="100" src={Icons.ArrowLeft} />}
                    radii="300"
                    fill="None"
                    variant="Critical"
                    onClick={handleKick}
                  >
                    <Text className={messageCss.MessageMenuItemText} as="span" size="T300" truncate>
                      Kick from Room
                    </Text>
                  </MenuItem>
                )}
                {!mEvent.isRedacted() && canDelete && (
                  <MessageDeleteItem room={room} mEvent={mEvent} />
                )}
                {mEvent.getSender() !== mx.getUserId() && (
                  <MessageReportItem room={room} mEvent={mEvent} />
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>,
    portalContainer
  );
}
