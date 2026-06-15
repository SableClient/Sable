import { useEffect, useRef, useState } from 'react';
import {
  Direction,
  EventType,
  MatrixEventEvent,
  MsgType,
  RoomEvent as RoomEventEnum,
} from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
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

  // Check if this message has been edited — use the edited content if available
  const replacingEvent = typeof ev.replacingEvent === 'function' ? ev.replacingEvent() : undefined;
  // Only use the replacement event if it's been decrypted (otherwise we'd see ciphertext)
  let displayContent =
    replacingEvent && !replacingEvent.isBeingDecrypted() && !replacingEvent.isEncrypted()
      ? replacingEvent.getContent()
      : content;
  // If we're using an edit event's content, extract m.new_content (the actual edit)
  // instead of the fallback body (which has "* " prefix for old clients)
  if (replacingEvent && displayContent?.['m.new_content']) {
    displayContent = displayContent['m.new_content'] as typeof displayContent;
  }

  if (type === ROOM_MESSAGE_EVENT_TYPE) {
    const { msgtype } = displayContent;
    if (msgtype === MsgType.Text || msgtype === MsgType.Emote || msgtype === MsgType.Notice) {
      const rawBody = displayContent.body;
      if (typeof rawBody !== 'string') return undefined;
      const body = stripReplyFallback(rawBody);
      // Show "🔗 Link" only if message is ONLY a link with no other text
      if (body) {
        const trimmed = body.trim();
        // Check if the entire message is just a URL
        if (/^https?:\/\/[^\s]+$/.test(trimmed)) {
          return '🔗 Link';
        }
      }
      return body;
    }
    if (msgtype === MsgType.Image) return '📷 Image';
    if (msgtype === MsgType.Video) return '📹 Video';
    if (msgtype === MsgType.Audio) return '🎵 Audio';
    if (msgtype === MsgType.File) return '📎 File';
    if (msgtype === 'm.location') return '📍 Location';
  }

  if (type === STICKER_EVENT_TYPE) {
    return `🎉 ${displayContent.body ?? 'Sticker'}`;
  }

  // Polls — show the question text when available.
  if (type === 'org.matrix.msc3381.poll.start' || type === 'm.poll.start') {
    const pollContent =
      displayContent?.['org.matrix.msc3381.poll.start'] ?? displayContent?.['m.poll.start'];
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

  // Call events (Element Call / Native calls)
  if (type === 'org.matrix.msc3401.call' || type === 'm.call.invite') {
    return '📞 Started a call';
  }
  if (type === 'm.call.answer') {
    return '📞 Answered call';
  }
  if (type === 'm.call.hangup') {
    return '📞 Ended call';
  }

  // Widget events (Jitsi, custom widgets, etc.)
  if (type === 'im.vector.modular.widgets') {
    const widgetType = displayContent?.type;
    if (widgetType === 'jitsi') return '📞 Started a Jitsi call';
    return '🧩 Added a widget';
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
  let latestEvent: MatrixEvent | undefined;
  let latestTs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (!event || eventToPreviewText(event) === undefined) continue;
    const ts = event.getTs();
    if (ts >= latestTs) {
      latestEvent = event;
      latestTs = ts;
    }
  }

  return latestEvent;
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
    if (lastDisplayable) {
      // Decrypt the main event if encrypted
      if (lastDisplayable.isEncrypted()) {
        mx.decryptEventIfNeeded(lastDisplayable).catch(() => undefined);
      }
      // Also decrypt the replacement event if present (edits are stored encrypted)
      const replacingEvent =
        typeof lastDisplayable.replacingEvent === 'function'
          ? lastDisplayable.replacingEvent()
          : undefined;
      if (replacingEvent?.isEncrypted()) {
        mx.decryptEventIfNeeded(replacingEvent).catch(() => undefined);
      }
    }

    // Background paginate when the timeline is sparse and contains no
    // displayable message (typical for sliding sync list rooms which initially
    // receive only a small preview window, all of which may be non-message events).
    // The RoomEvent.Timeline listener fires when events are loaded, triggering
    // another update() call that will find and display the preview.
    if (!lastDisplayable && events.length <= 5) {
      const liveTimeline = room.getLiveTimeline();
      if (typeof liveTimeline.getPaginationToken(Direction.Backward) === 'string') {
        mx.paginateEventTimeline(liveTimeline, { backwards: true, limit: 20 }).catch(
          () => undefined
        );
      }
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
