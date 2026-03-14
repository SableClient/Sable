// Modal for message forwarding, which allows users to select a room to forward the message to

import { useMatrixClient } from '$hooks/useMatrixClient';
import { modalAtom, ModalType } from '$state/modal';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  Icons,
  IconButton,
  MenuItem,
  Text,
  config,
  Scroll,
  as,
} from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { JoinRule, MatrixEvent, Room } from '$types/matrix-sdk';
import { useEffect, useMemo, useState } from 'react';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { factoryRoomIdByActivity } from '$utils/sort';
import * as css from '$features/room/message/styles.css';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { getStateEvents } from '$utils/room';
import { StateEvent } from '$types/matrix/room';

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
  event_id: string;
  room_id: string;
  sender: string | null; // we won't set this field
  origin_server_ts: number;
};

export function MessageForwardInternal({
  room,
  mEvent,
  onClose,
}: Readonly<MessageForwardInternalProps>) {
  const mx = useMatrixClient();

  const [isTargetSelected, setIsTargetSelected] = useState(false);
  const [isForwardSuccess, setIsForwardSuccess] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [isForwardError, setIsForwardError] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState<string | null>(null);

  // detect if it's a public room or not
  const joinRule = room.getJoinRule() ?? JoinRule.Invite;

  const parentSpaceIds = getStateEvents(room, StateEvent.SpaceParent)
    .map((e) => e.getStateKey())
    .filter((id): id is string => Boolean(id));

  const isInPublicSpace = parentSpaceIds.some((spaceId) => {
    const space = mx.getRoom(spaceId);
    return Boolean(space?.isSpaceRoom()) && space?.getJoinRule() === JoinRule.Public;
  });

  // A room is private if its join rule is Invite (or other non-public/non-knock/non-restricted),
  // or it's Restricted but NOT inside a public space.
  const isPrivate =
    joinRule === JoinRule.Invite ||
    (joinRule === JoinRule.Restricted && !isInPublicSpace) ||
    (joinRule !== JoinRule.Public &&
      joinRule !== JoinRule.Knock &&
      joinRule !== JoinRule.Restricted);

  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  // possible targets to forward the message to
  const forwardTargets = useMemo(
    () =>
      allRooms
        .filter((id) => id !== room.roomId)
        .filter((id) => {
          const target = getRoom(id);
          return !!target && !target.isSpaceRoom() && target.maySendMessage();
        })
        .sort(factoryRoomIdByActivity(mx)),
    [allRooms, room.roomId, getRoom, mx]
  );

  useEffect(() => {
    if (isForwardSuccess) {
      setTimeout(() => {
        // close the modal if the message was forwarded successfully
        onClose();
      }, 2000);
    }
  }, [isForwardSuccess, onClose]);

  // actually forward the message to the selected room
  const handleForwardClick = () => {
    setIsForwarding(true);
    if (!targetRoomId) {
      setIsForwarding(false);
      return;
    }

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
    // using reference relation to indicate that this is a forwarded message,
    // which allows clients to display it as such

    const originalBody = typeof originalContent.body === 'string' ? originalContent.body : '';
    const originalFormattedBody =
      originalContent.format === 'org.matrix.custom.html' &&
      typeof originalContent.formatted_body === 'string'
        ? originalContent.formatted_body
        : undefined;

    const bodyModifText = `(Forwarded message from ${
      isPrivate ? 'a private room' : (getRoom(room.roomId)?.name ?? 'a room')
    })`;

    let newBodyPlain = '';
    let newBodyHtml = '';
    // transform if msgtype is m.text
    if (isTextMessage) {
      const quotedBody = originalBody
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

      newBodyPlain = originalBody.length > 0 ? `${bodyModifText}\n\n${quotedBody}` : bodyModifText;

      const safeHtml =
        originalFormattedBody !== undefined
          ? sanitizeCustomHtml(originalFormattedBody)
          : sanitizeCustomHtml(originalBody).replaceAll('\n', '<br>');

      newBodyHtml =
        `<div data-forward-marker>` +
        `<p>${sanitizeCustomHtml(bodyModifText)}</p>` +
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
    delete baseContent['com.beeper.per_message_profile']; // remove per-message profile as that could confuse clients in the target room
    let content;
    // handle privacy stuff
    if (isPrivate) {
      // if the message is from a private room, we should strip any media or mentions to avoid leaking information to the target room
      // we can still include the original message content in the body of the message, so we'll just use a fallback text/plain content with the original message body
      content = {
        ...baseContent,
        'm.relates_to': null, // remove any relations to avoid confusion in the target room
        'm.mentions': null, // remove mentions to avoid leaking information about users in the original room
        ...forwardedTextContent,
        'moe.sable.message.forward': {
          v: 1,
          is_forwarded: true,
          original_timestamp: mEvent.getTs(),
          original_event_private: true,
        } satisfies ForwardMeta,
      };
    } else {
      content = {
        ...baseContent,
        ...forwardedTextContent,
        'm.relates_to': {
          rel_type: 'm.reference',
          event_id: eventId,
        },
        'moe.sable.message.forward': {
          v: 1,
          is_forwarded: true,
          original_timestamp: mEvent.getTs(),
          original_room_id: room.roomId,
          original_event_id: eventId,
          original_event_private: false,
        } satisfies ForwardMeta,
        'com.famedly.app.forwarded': {
          event_id: eventId,
          room_id: room.roomId,
          sender: null, // we won't set this field, as a design decision to avoid potential privacy issues and since the sender can be inferred from the event_id and room_id if needed
          origin_server_ts: mEvent.getTs(),
        } satisfies MSC2723ForwardMeta,
      };
    }

    mx.sendEvent(targetRoom.roomId, null, eventType, content as unknown as SendEventContent)
      .then(() => setIsForwardSuccess(true))
      .catch(() => {
        setIsForwarding(false);
        setIsForwardSuccess(false);
        setIsForwardError(true);
      });
  };

  return (
    <Dialog variant="Surface">
      <Header
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
          borderBottomWidth: config.borderWidth.B300,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes">
          <Text size="H4">Forward Message</Text>
        </Box>
        <IconButton size="300" onClick={onClose} radii="300">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box direction="Column" style={{ height: '300px' }}>
        <Scroll hideTrack>
          <Box direction="Column" style={{ padding: config.space.S300 }}>
            {forwardTargets.map((roomId) => {
              const target = getRoom(roomId);
              if (!target) return null;
              return (
                <MenuItem
                  key={roomId}
                  data-room-id={roomId}
                  onClick={() => {
                    setIsTargetSelected(true);
                    setTargetRoomId(roomId);
                  }}
                  variant={targetRoomId === roomId ? 'Success' : 'Surface'}
                  aria-pressed={targetRoomId === roomId}
                  size="400"
                  radii="400"
                >
                  <Text truncate>{target.name}</Text>
                </MenuItem>
              );
            })}
          </Box>
        </Scroll>
        {isTargetSelected && targetRoomId && (
          <Button
            style={{ margin: config.space.S300 }}
            onClick={handleForwardClick}
            disabled={isForwarding}
          >
            <Text>Forward to {getRoom(targetRoomId)?.name}</Text>
          </Button>
        )}
        {isForwardError && (
          <Text size="T300" color="Critical600" style={{ margin: config.space.S300 }}>
            Failed to forward message. Please try again.
          </Text>
        )}
      </Box>
    </Dialog>
  );
}

type MessageForwardItemProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose?: () => void;
};
