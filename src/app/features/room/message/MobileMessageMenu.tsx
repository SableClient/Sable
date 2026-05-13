import { createPortal } from 'react-dom';
import { Icon, Icons, Text } from 'folds';
import type { MouseEventHandler, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import { useEffect, useCallback, useRef, useState } from 'react';
import { EmojiBoard } from '$components/emoji-board';
import { useSetAtom } from 'jotai';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { canEditEvent, getEventEdits } from '$utils/room';
import { modalAtom, ModalType } from '$state/modal';
import { MessageDeleteItem } from '$components/message/modals/MessageDelete';
import { MessageReportItem } from '$components/message/modals/MessageReport';
import { copyToClipboard } from '$utils/dom';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useIsBookmarked, useBookmarkActions } from '$features/bookmarks/useBookmarks';
import { createBookmarkItem, computeBookmarkId } from '$features/bookmarks/bookmarkDomain';
import * as css from './MobileMessageMenu.css';

export type MobileMessageMenuProps = {
  room: Room;
  mEvent: MatrixEvent;
  canDelete?: boolean;
  canSendReaction?: boolean;
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
};

function QuickReactions({
  onReaction,
  onOpenEmojiBoard,
}: {
  onReaction: (key: string, shortcode: string) => void;
  onOpenEmojiBoard?: () => void;
}) {
  const mx = useMatrixClient();
  const recentEmojis = useRecentEmoji(mx, 5);

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
      {icon}
      <Text size="T300" as="span">
        {label}
      </Text>
    </button>
  );
}

function BookmarkActionItem({
  room,
  mEvent,
  onClose,
}: {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
}) {
  const eventId = mEvent.getId() ?? '';
  const bookmarked = useIsBookmarked(room.roomId, eventId);
  const { add, remove } = useBookmarkActions();

  if (mEvent.isRedacted()) return null;

  return (
    <ActionItem
      icon={<Icon src={Icons.Star} size="200" />}
      label={bookmarked ? 'Remove Bookmark' : 'Bookmark'}
      onClick={() => {
        if (bookmarked) {
          remove(computeBookmarkId(room.roomId, eventId)).catch(() => {});
        } else {
          const item = createBookmarkItem(room, mEvent);
          if (item) add(item).catch(() => {});
        }
        onClose();
      }}
    />
  );
}

export function MobileMessageMenu({
  room,
  mEvent,
  canDelete,
  canSendReaction,
  isThreadedMessage,
  hideReadReceipts,
  showDeveloperTools,
  onReplyClick,
  onEditId,
  onReactionToggle,
  imagePackRooms,
  onClose,
}: MobileMessageMenuProps) {
  const mx = useMatrixClient();
  const setModal = useSetAtom(modalAtom);
  const evtId = mEvent.getId()!;
  const evtTimeline = room.getTimelineForEvent(evtId);
  const edits =
    evtTimeline &&
    getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
  const isEdited = edits !== undefined;

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

  const stopPropHandler = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

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
        onClick={stopPropHandler}
        onKeyDown={(e) => e.stopPropagation()}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
      >
        <div className={css.Handle} />

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
            </div>

            {/* Group 2: Utility actions */}
            <div className={css.ActionGroup}>
              {(() => {
                const content = mEvent.getContent();
                const body: string | undefined = content['m.new_content']?.body ?? content.body;
                if (!body || mEvent.isRedacted()) return null;
                return (
                  <ActionItem
                    icon={<Icon src={Icons.Alphabet} size="200" />}
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
              <BookmarkActionItem room={room} mEvent={mEvent} onClose={onClose} />
            </div>

            {/* Group 3: Destructive actions */}
            {(!mEvent.isRedacted() && canDelete) || mEvent.getSender() !== mx.getUserId() ? (
              <div className={css.ActionGroup}>
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
