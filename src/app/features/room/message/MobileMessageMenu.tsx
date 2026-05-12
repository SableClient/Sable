import { createPortal } from 'react-dom';
import { Icon, Icons, Text } from 'folds';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useCallback } from 'react';
import { useSetAtom } from 'jotai';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { canEditEvent, getEventEdits } from '$utils/room';
import { modalAtom, ModalType } from '$state/modal';
import { MessageDeleteItem } from '$components/message/modals/MessageDelete';
import { MessageReportItem } from '$components/message/modals/MessageReport';
import { MessageForwardItem } from '$components/message/modals/MessageForward';
import { copyToClipboard } from '$utils/dom';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useBookmarks, isBookmarked, toggleBookmark } from '$hooks/useBookmarks';
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
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
  onOpenEmojiBoard?: () => void;
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
  const mx = useMatrixClient();
  const bookmarks = useBookmarks();
  const eventId = mEvent.getId() ?? '';
  const bookmarked = isBookmarked(bookmarks, eventId);

  if (mEvent.isRedacted()) return null;

  return (
    <ActionItem
      icon={<Icon src={Icons.Star} size="200" />}
      label={bookmarked ? 'Remove Bookmark' : 'Bookmark'}
      onClick={() => {
        toggleBookmark(mx, room.roomId, eventId, bookmarks).catch(() => {});
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
  onOpenEmojiBoard,
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
        role="presentation"
        className={css.Backdrop}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />

      {/* Sheet */}
      <div
        className={css.Sheet}
        role="dialog"
        aria-modal="true"
        onClick={stopPropHandler}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className={css.Handle} />

        {canSendReaction && (
          <>
            <QuickReactions
              onReaction={(key, shortcode) => {
                onReactionToggle(evtId, key, shortcode);
                onClose();
              }}
              onOpenEmojiBoard={
                onOpenEmojiBoard
                  ? () => {
                      onOpenEmojiBoard();
                      onClose();
                    }
                  : undefined
              }
            />
          </>
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
          <MessageForwardItem
            className={css.ActionItem}
            room={room}
            mEvent={mEvent}
            onClose={onClose}
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
            {!mEvent.isRedacted() && canDelete && <MessageDeleteItem room={room} mEvent={mEvent} />}
            {mEvent.getSender() !== mx.getUserId() && (
              <MessageReportItem room={room} mEvent={mEvent} />
            )}
          </div>
        ) : null}
      </div>
    </>,
    portalContainer
  );
}
