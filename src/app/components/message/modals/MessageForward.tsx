// Modal for message forwarding, which allows users to select a room to forward the message to

import { useMatrixClient } from '$hooks/useMatrixClient';
import { modalAtom, ModalType } from '$state/modal';
import { Icon, Icons, MenuItem, Text, as } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { useCallback, useMemo, useState } from 'react';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { factoryRoomIdByActivity } from '$utils/sort';
import * as css from '$features/room/message/styles.css';
import { sanitizeCustomHtml, sanitizeText } from '$utils/sanitize';
import { createDebugLogger } from '$utils/debugLogger';
import * as Sentry from '@sentry/react';
import { isRoomPrivate } from '$utils/roomVisibility';
import * as prefix from '$unstable/prefixes';
import { RoomSearchModal } from '$features/search';
const debugLog = createDebugLogger('MessageForward');

// Message forwarding component
export const MessageForwardItem = as<'button', MessageForwardItemProps>(
  ({ room, mEvent, onClose, ...props }: MessageForwardItemProps) => {
    const setModal = useSetAtom(modalAtom);

    const handleClick = () => {
      setModal({
        type: ModalType.Forward,
        room,
        mEvent,
      });
      onClose?.();
    };

    return (
      <MenuItem
        size="300"
        after={<Icon size="100" src={Icons.ArrowRight} />}
        radii="300"
        {...props}
        onClick={handleClick}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          Forward
        </Text>
      </MenuItem>
    );
  }
);

export const unwrapForwardedContent = (content: string) => {
  // unwrap the content of a forwarded message if it was wrapped in a blockquote with the data-forward-marker attribute
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const forwardMarker = doc.querySelector('[data-forward-marker]');
  if (forwardMarker) {
    const blockquote = forwardMarker.querySelector('blockquote');
    if (blockquote) {
      return blockquote.innerHTML;
    }
  }
  return content;
};

type MessageForwardInternalProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
};

type ForwardMeta = {
  v: 1;
  is_forwarded: true;
  original_timestamp: number;
  original_room_id?: string;
  original_event_id?: string;
  // to mark that event_id and room_id are not present
  original_event_private: boolean;
};

// see https://github.com/hummlbach/matrix-doc/blob/acea0854a1c9489599295a858b068ce02a6b2b20/proposals/2723-add-forward-info.md
type MSC2723ForwardMeta = {
  event_id?: string;
  room_id?: string;
  sender?: string; // we won't set this field
  origin_server_ts: number;
};

export function MessageForwardInternal({
  room,
  mEvent,
  onClose,
}: Readonly<MessageForwardInternalProps>) {
  const mx = useMatrixClient();

  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  // possible targets to forward the message to
  const forwardTargets = useMemo(
    () =>
      allRooms
        .filter((id) => {
          const target = getRoom(id);
          return !!target && !target.isSpaceRoom() && target.maySendMessage();
        })
        .sort(factoryRoomIdByActivity(mx)),
    [allRooms, getRoom, mx]
  );

  const forwardToRoom = useCallback(
    (targetRoomId: string) => {
      setIsForwarding(true);
      setForwardError(null);

      const targetRoom = getRoom(targetRoomId);
      const eventId = mEvent.getId();
      if (!targetRoom || !eventId) {
        setIsForwarding(false);
        return;
      }

      type SendEventType = Parameters<typeof mx.sendEvent>[2];
      type SendEventContent = Parameters<typeof mx.sendEvent>[3];

      const eventType = mEvent.getType() as SendEventType;
      const originalContent = mEvent.getContent();
      const isTextMessage = originalContent.msgtype === 'm.text';

      const originalBody = typeof originalContent.body === 'string' ? originalContent.body : '';
      const originalFormattedBody =
        originalContent.format === 'org.matrix.custom.html' &&
        typeof originalContent.formatted_body === 'string'
          ? originalContent.formatted_body
          : undefined;

      const bodyModifText = `(Forwarded message from ${
        isRoomPrivate(mx, room) ? 'a private room' : (getRoom(room.roomId)?.name ?? 'a room')
      })`;

      let newBodyPlain = '';
      let newBodyHtml = '';
      // transform if msgtype is m.text
      if (isTextMessage) {
        const quotedBody = originalBody
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');

        newBodyPlain =
          originalBody.length > 0 ? `${bodyModifText}\n\n${quotedBody}` : bodyModifText;

        const safeHtml =
          originalFormattedBody === undefined
            ? sanitizeText(originalBody).replaceAll('\n', '<br>')
            : sanitizeCustomHtml(originalFormattedBody);

        newBodyHtml =
          `<div data-forward-marker>` +
          `<p>${sanitizeText(bodyModifText)}</p>` +
          `<blockquote>${safeHtml}</blockquote>` +
          `</div>`;
      }
      // the quoted body
      const forwardedTextContent = isTextMessage
        ? {
            body: newBodyPlain,
            format: 'org.matrix.custom.html',
            formatted_body: newBodyHtml,
          }
        : {};
      const baseContent = { ...mEvent.getContent() };
      delete baseContent['m.relates_to']; // remove relations from the forwarded message
      delete baseContent['m.mentions']; // remove mentions from forwarded message
      delete baseContent[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME]; // remove per-message profile as that could confuse clients in the target room
      let content;
      // handle privacy stuff
      if (isRoomPrivate(mx, room)) {
        // if the message is from a private room, we should strip any media or mentions to avoid leaking information to the target room
        // we can still include the original message content in the body of the message, so we'll just use a fallback text/plain content with the original message body
        content = {
          ...baseContent,
          ...forwardedTextContent,
          [prefix.MATRIX_SABLE_UNSTABLE_MESSAGE_FORWARD_META_PROPERTY_NAME]: {
            v: 1,
            is_forwarded: true,
            original_timestamp: mEvent.getTs(),
            original_event_private: true,
          } satisfies ForwardMeta,
          [prefix.MATRIX_UNSTABLE_MESSAGE_FORWARD_META_PROPERTY_NAME]: {
            origin_server_ts: mEvent.getTs(),
          } satisfies MSC2723ForwardMeta,
        };
      } else {
        content = {
          ...baseContent,
          ...forwardedTextContent,
          [prefix.MATRIX_SABLE_UNSTABLE_MESSAGE_FORWARD_META_PROPERTY_NAME]: {
            v: 1,
            is_forwarded: true,
            original_timestamp: mEvent.getTs(),
            original_room_id: room.roomId,
            original_event_id: eventId,
            original_event_private: false,
          } satisfies ForwardMeta,
          [prefix.MATRIX_UNSTABLE_MESSAGE_FORWARD_META_PROPERTY_NAME]: {
            event_id: eventId,
            room_id: room.roomId,
            origin_server_ts: mEvent.getTs(),
          } satisfies MSC2723ForwardMeta,
        };
      }

      const msgtype = originalContent.msgtype ?? 'unknown';
      debugLog.info('ui', 'Forwarding message', {
        sourceRoomId: room.roomId,
        targetRoomId: targetRoom.roomId,
        msgtype,
        isPrivate: isRoomPrivate(mx, room),
      });
      Sentry.metrics.count('sable.message.forward.attempt', 1, { attributes: { msgtype } });
      mx.sendEvent(targetRoom.roomId, null, eventType, content as unknown as SendEventContent)
        .then(() => {
          debugLog.info('ui', 'Message forwarded successfully', {
            sourceRoomId: room.roomId,
            targetRoomId: targetRoom.roomId,
          });
          Sentry.metrics.count('sable.message.forward.success', 1);
          setIsForwarding(false);
          onClose();
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          debugLog.error('ui', 'Message forward failed', {
            sourceRoomId: room.roomId,
            targetRoomId: targetRoom.roomId,
            error: message,
          });
          Sentry.metrics.count('sable.message.forward.error', 1);
          setIsForwarding(false);
          setForwardError(message);
        });
    },
    [getRoom, mEvent, mx, onClose, room]
  );

  const pickRoom = useMemo(
    () => ({
      title: 'Forward message',
      eligibleRoomIds: forwardTargets,
      onPickRoom: (roomId: string) => {
        forwardToRoom(roomId);
      },
      errorMessage: forwardError ? `Failed to forward: ${forwardError}` : null,
      busy: isForwarding,
    }),
    [forwardError, forwardTargets, forwardToRoom, isForwarding]
  );

  return <RoomSearchModal requestClose={onClose} pickRoom={pickRoom} />;
}

type MessageForwardItemProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose?: () => void;
};
