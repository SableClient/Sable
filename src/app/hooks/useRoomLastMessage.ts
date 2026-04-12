import { useEffect, useState } from 'react';
import { MatrixEvent, MsgType, Room, RoomEvent as RoomEventEnum } from '$types/matrix-sdk';
import { MessageEvent } from '$types/matrix/room';

function eventToPreviewText(ev: MatrixEvent): string | undefined {
  if (ev.isRedacted()) return undefined;

  const type = ev.getType();

  if (type === MessageEvent.RoomMessageEncrypted) return '🔒 Encrypted message';

  if (type === MessageEvent.RoomMessage) {
    const content = ev.getContent();
    const { msgtype } = content;
    if (msgtype === MsgType.Text || msgtype === MsgType.Emote || msgtype === MsgType.Notice) {
      return content.body;
    }
    if (msgtype === MsgType.Image) return '📷 Image';
    if (msgtype === MsgType.Video) return '📹 Video';
    if (msgtype === MsgType.Audio) return '🎵 Audio';
    if (msgtype === MsgType.File) return '📎 File';
  }

  if (type === MessageEvent.Sticker) {
    return `🎉 ${ev.getContent().body ?? 'Sticker'}`;
  }

  return undefined;
}

function getLastMessageText(room: Room): string | undefined {
  const events = room.getLiveTimeline().getEvents();
  const match = [...events].reverse().find((ev) => eventToPreviewText(ev) !== undefined);
  return match ? eventToPreviewText(match) : undefined;
}

/**
 * Reactively returns a human-readable preview of the last message in a room's
 * live timeline. Listens to Timeline events so the preview updates as messages
 * arrive. Pass `undefined` to disable (returns `undefined`).
 */
export function useRoomLastMessage(room: Room | undefined): string | undefined {
  const [text, setText] = useState<string | undefined>(() =>
    room ? getLastMessageText(room) : undefined
  );

  useEffect(() => {
    if (!room) {
      setText(undefined);
      return undefined;
    }
    setText(getLastMessageText(room));

    const update = () => setText(getLastMessageText(room));
    room.on(RoomEventEnum.Timeline, update);
    room.on(RoomEventEnum.LocalEchoUpdated, update);
    return () => {
      room.off(RoomEventEnum.Timeline, update);
      room.off(RoomEventEnum.LocalEchoUpdated, update);
    };
  }, [room]);

  return text;
}
