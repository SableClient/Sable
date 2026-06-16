import { useEffect, useRef, useState } from 'react';
import { MatrixEventEvent, RoomEvent as RoomEventEnum, Direction } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getMemberDisplayName } from '$utils/room';
import {
  buildMessagePreview,
  stripReplyFallback,
  type MessagePreviewModel,
} from '$utils/messagePreview';

export { stripReplyFallback };

export function eventToPreviewText(ev: MatrixEvent): string | undefined {
  return buildMessagePreview(ev)?.text;
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

export function findLastDisplayableEvent(events: MatrixEvent[]): MatrixEvent | undefined {
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

export type RoomLastMessagePreview = {
  event: MatrixEvent;
  preview: MessagePreviewModel;
  senderLabel: string;
  text: string;
};

export function getLastMessagePreview(
  room: Room,
  mx: MatrixClient
): RoomLastMessagePreview | undefined {
  const events = room.getLiveTimeline().getEvents();
  const match = findLastDisplayableEvent(events);
  if (!match) return undefined;
  const preview = buildMessagePreview(match);
  if (!preview) return undefined;

  const senderId = match.getSender();
  const senderLabel =
    senderId === mx.getUserId()
      ? 'You'
      : (getMemberDisplayName(room, senderId ?? '') ?? displayNameFromMxid(senderId ?? 'Unknown'));

  return {
    event: match,
    preview,
    senderLabel,
    text: `${senderLabel}: ${preview.text}`,
  };
}

export function getLastMessageText(room: Room, mx: MatrixClient): string | undefined {
  return getLastMessagePreview(room, mx)?.text;
}

export function useRoomLastMessage(
  room: Room | undefined,
  mx: MatrixClient | undefined
): RoomLastMessagePreview | undefined {
  const [preview, setPreview] = useState<RoomLastMessagePreview | undefined>(() =>
    room && mx ? getLastMessagePreview(room, mx) : undefined
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!room || !mx) {
      setPreview(undefined);
      return undefined;
    }

    const update = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setPreview(getLastMessagePreview(room, mx));
      }, 300);
    };

    room.on(RoomEventEnum.Timeline, update);
    room.on(RoomEventEnum.LocalEchoUpdated, update);

    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.getRoomId() === room.roomId) update();
    };
    mx.on(MatrixEventEvent.Decrypted, onDecrypted);

    update();

    const events = room.getLiveTimeline().getEvents();
    const lastDisplayable = findLastDisplayableEvent(events);
    if (lastDisplayable) {
      if (lastDisplayable.isEncrypted()) {
        mx.decryptEventIfNeeded(lastDisplayable).catch(() => undefined);
      }
      const replacingEvent =
        typeof lastDisplayable.replacingEvent === 'function'
          ? lastDisplayable.replacingEvent()
          : undefined;
      if (replacingEvent?.isEncrypted()) {
        mx.decryptEventIfNeeded(replacingEvent).catch(() => undefined);
      }
    }

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

  return preview;
}
