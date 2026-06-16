import type { RoomPinnedEventsEventContent, StateEvents } from '$types/matrix-sdk';
import { type Room, type MatrixEvent, type Relations, EventType } from '$types/matrix-sdk';
import { canEditEvent, getEventEdits, isThreadRelationEvent } from '$utils/room';
import { MessageReportItem } from './MessageReport';
import { as, Box, config, Line, Menu, MenuItem, Text } from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { MessageQuickReactions } from '$features/room/message';
import {
  ArrowBendUpLeftIcon,
  ChatCircleDots,
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
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import {
  addStickerToDefaultPack,
  doesStickerExistInDefaultPack,
} from '$utils/addStickerToDefaultStickerPack';
import { MessageEditHistoryItem } from './MessageEditHistory';
import { MessageSourceCodeItem } from './MessageSource';
import { MessageForwardItem } from './MessageForward';

import * as css from '$features/room/message/styles.css';
import { useAtomValue, useSetAtom } from 'jotai';
import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import type { MouseEventHandler } from 'react';
import { useState } from 'react';
import { MessageDeleteItem } from './MessageDelete';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { modalAtom } from '$state/modal';
import { copyToClipboard } from '$utils/dom';
import { getMatrixToRoomEvent } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';

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
export type OptionMenuProps = {
  mEvent: MatrixEvent;
  room: Room;
  closeMenu: () => void;
  onReactionToggle?: (targetEventId: string, key: string, shortcode?: string) => void;
  handleAddReactions?: () => void;
  relations?: Relations;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onEditId?: (eventId?: string) => void;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  canPinEvent?: boolean;
  cleanedDisplayName?: string;
  canDelete?: boolean;
};

export function OptionMenu({
  mEvent,
  room,
  closeMenu,
  onReactionToggle,
  handleAddReactions,
  relations,
  onReplyClick,
  onEditId,
  hideReadReceipts,
  showDeveloperTools,
  canPinEvent,
  cleanedDisplayName,
  canDelete,
}: OptionMenuProps) {
  const setModal = useSetAtom(modalAtom);
  const mx = useMatrixClient();
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canSendReaction = permissions.event('m.reaction', mx.getSafeUserId());
  const isThreadedMessage = isThreadRelationEvent(mEvent, mEvent.threadRootId);
  const isStickerMessage = mEvent.getType() === 'm.sticker';
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

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        onDeactivate: () => closeMenu(),
        clickOutsideDeactivates: true,
        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
        escapeDeactivates: stopPropagation,
      }}
    >
      <Menu onContextMenu={(e) => e.preventDefault()}>
        {canSendReaction && onReactionToggle && handleAddReactions && (
          <MessageQuickReactions
            onReaction={(key, shortcode) => {
              onReactionToggle(mEvent.getId()!, key, shortcode);
              onTotalClose();
            }}
          />
        )}
        <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
          {canSendReaction && onReactionToggle && handleAddReactions && (
            <MenuItem size="300" after={menuIcon(Smiley)} radii="300" onClick={handleAddReactions}>
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
                onTotalClose();
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
          {isEdited && <MessageEditHistoryItem room={room} mEvent={mEvent} closeMenu={closeMenu} />}
          {showDeveloperTools && <MessageSourceCodeItem room={room} mEvent={mEvent} />}
          <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={onTotalClose} />
          <MessageForwardItem room={room} mEvent={mEvent} onClose={closeMenu} />
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
  );
}

export function MobileOptionsInternal({ options }: { options: OptionMenuProps }) {
  return (
    <OptionMenu
      mEvent={options.mEvent}
      room={options.room}
      closeMenu={options.closeMenu}
      onReactionToggle={options.onReactionToggle}
      handleAddReactions={options.handleAddReactions}
      relations={options.relations}
      onReplyClick={options.onReplyClick}
      onEditId={options.onEditId}
      hideReadReceipts={options.hideReadReceipts}
      showDeveloperTools={options.showDeveloperTools}
      canPinEvent={options.canPinEvent}
      cleanedDisplayName={options.cleanedDisplayName}
      canDelete={options.canDelete}
    />
  );
}
