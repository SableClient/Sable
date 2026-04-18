import { useEffect, useRef, useState } from 'react';
import {
  EventType,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  MsgType,
  Room,
  RoomEvent as RoomEventEnum,
} from '$types/matrix-sdk';
import { getMemberDisplayName } from '$utils/room';

const REACTION_EVENT_TYPE: string = EventType.Reaction;
const ENCRYPTED_EVENT_TYPE: string = EventType.RoomMessageEncrypted;
const ROOM_MESSAGE_EVENT_TYPE: string = EventType.RoomMessage;
const STICKER_EVENT_TYPE: string = EventType.Sticker;

/**
 * Strip the legacy reply fallback (lines starting with `> `) that some
 * clients prepend when replying to a message.
 */
export function stripReplyFallback(body: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]?.startsWith('> ')) i += 1;
  // Skip the blank separator line that follows the fallback block.
  if (i > 0 && i < lines.length && lines[i] === '') i += 1;
  return lines.slice(i).join('\n');
}

export function eventToPreviewText(ev: MatrixEvent): string | undefined {
  if (ev.isRedacted()) return undefined;

  // After decryption, getType() still returns 'm.room.encrypted' (the wire type).
  // Use the effective event type to get the decrypted type when available.
  const effectiveType = (ev.getEffectiveEvent()?.type as string | undefined) ?? ev.getType();
  const type = effectiveType;
  const content = ev.getContent();

  // Skip reactions and edits — they aren't standalone messages.
  if (type === REACTION_EVENT_TYPE) return undefined;
  const relType = content?.['m.relates_to']?.rel_type;
  if (relType === 'm.replace') return undefined;

  // Only show encrypted placeholder if the event is still encrypted (not yet decrypted).
  if (type === ENCRYPTED_EVENT_TYPE) return '🔒 Encrypted message';

  if (type === ROOM_MESSAGE_EVENT_TYPE) {
    const { msgtype } = content;
    if (msgtype === MsgType.Text || msgtype === MsgType.Emote || msgtype === MsgType.Notice) {
      return stripReplyFallback(content.body);
    }
    if (msgtype === MsgType.Image) return '📷 Image';
    if (msgtype === MsgType.Video) return '📹 Video';
    if (msgtype === MsgType.Audio) return '🎵 Audio';
    if (msgtype === MsgType.File) return '📎 File';
    if (msgtype === 'm.location') return '📍 Location';
  }

  if (type === STICKER_EVENT_TYPE) {
    return `🎉 ${content.body ?? 'Sticker'}`;
  }

  // Polls — show the question text when available.
  if (type === 'org.matrix.msc3381.poll.start' || type === 'm.poll.start') {
    const pollContent = content?.['org.matrix.msc3381.poll.start'] ?? content?.['m.poll.start'];
    const question =
      typeof pollContent === 'object' && pollContent !== null
        ? (pollContent as { question?: Record<string, unknown> }).question
        : undefined;
    const textParts = question?.['m.text'];
    const pollBodyCandidate =
      (Array.isArray(textParts)
        ? (textParts[0] as { body?: unknown } | undefined)?.body
        : undefined) ??
      question?.['org.matrix.msc1767.text'] ??
      question?.body;
    const pollBody =
      typeof pollBodyCandidate === 'string' && pollBodyCandidate.trim()
        ? pollBodyCandidate.trim()
        : 'Poll';
    return `📊 ${pollBody}`;
  }

  return undefined;
}

/**
 * Extract a human-readable name from a Matrix user ID (@localpart:server).
 * Falls back to the raw id if the format is unexpected.
 */
function displayNameFromMxid(mxid: string): string {
  if (mxid.startsWith('@')) {
    const localpart = mxid.slice(1).split(':')[0];
    if (localpart) return localpart;
  }
  return mxid;
}

function findLastDisplayableEvent(events: MatrixEvent[]): MatrixEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event && eventToPreviewText(event) !== undefined) return event;
  }
  return undefined;
}

export function getLastMessageText(room: Room, mx: MatrixClient): string | undefined {
  const events = room.getLiveTimeline().getEvents();
  const match = findLastDisplayableEvent(events);
  if (!match) return undefined;
  const text = eventToPreviewText(match);
  if (!text) return undefined;

  const senderId = match.getSender();
  let prefix: string;
  if (senderId === mx.getUserId()) {
    prefix = 'You';
  } else {
    prefix =
      getMemberDisplayName(room, senderId ?? '') ?? displayNameFromMxid(senderId ?? 'Unknown');
  }
  return `${prefix}: ${text}`;
}

/**
 * Reactively returns a human-readable preview of the last message in a room's
 * live timeline, prefixed with "You:" or the sender's display name.
 * Listens to Timeline and Decrypted events so the preview updates as messages
 * arrive or are decrypted.
 * Pass `undefined` for room to disable (returns `undefined`).
 */
export function useRoomLastMessage(
  room: Room | undefined,
  mx: MatrixClient | undefined
): string | undefined {
  const [text, setText] = useState<string | undefined>(() =>
    room && mx ? getLastMessageText(room, mx) : undefined
  );

  // Debounce timer ref — cleared on unmount and room change.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!room || !mx) {
      setText(undefined);
      return undefined;
    }

    const update = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setText(getLastMessageText(room, mx));
      }, 300);
    };

    // Subscribe before reading to close the race window: any decryption that
    // completes after this point will trigger an update via the listener.
    room.on(RoomEventEnum.Timeline, update);
    room.on(RoomEventEnum.LocalEchoUpdated, update);

    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.getRoomId() === room.roomId) update();
    };
    mx.on(MatrixEventEvent.Decrypted, onDecrypted);

    // Read current state after subscribing to catch any events that decrypted
    // between the initial render and the listener mount.
    update();

    // If the last displayable event is still encrypted, explicitly request
    // decryption. Sliding sync may not auto-decrypt events in rooms that
    // haven't been opened yet; this ensures the preview resolves on mount.
    const events = room.getLiveTimeline().getEvents();
    const lastDisplayable = findLastDisplayableEvent(events);
    if (lastDisplayable && lastDisplayable.isEncrypted()) {
      mx.decryptEventIfNeeded(lastDisplayable).catch(() => undefined);
    }

    return () => {
      clearTimeout(debounceRef.current);
      room.off(RoomEventEnum.Timeline, update);
      room.off(RoomEventEnum.LocalEchoUpdated, update);
      mx.off(MatrixEventEvent.Decrypted, onDecrypted);
    };
  }, [room, mx]);

  return text;
}
