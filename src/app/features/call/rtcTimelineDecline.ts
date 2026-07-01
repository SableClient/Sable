import * as Sentry from '@sentry/react';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { decryptRtcTimelineEvent } from './callSignalingDecrypt';
import { parseRtcDecline, type ParsedRtcDecline } from './rtcNotificationParser';

const relationFromContent = (content: unknown) => {
  if (!content || typeof content !== 'object') return undefined;
  const maybeRelates = (content as { 'm.relates_to'?: unknown })['m.relates_to'];
  if (!maybeRelates || typeof maybeRelates !== 'object') return undefined;
  const relation = maybeRelates as { rel_type?: unknown; event_id?: unknown };
  return {
    rel_type: typeof relation.rel_type === 'string' ? relation.rel_type : undefined,
    event_id: typeof relation.event_id === 'string' ? relation.event_id : undefined,
  };
};

export const parseRtcDeclineFromTimelineEvent = async (
  event: MatrixEvent,
  room: Room,
  liveEvent: boolean,
  myUserId: string,
  mx: MatrixClient
): Promise<ParsedRtcDecline | undefined> => {
  let eventType = event.getType();
  let content = event.getContent();

  if (event.isEncrypted()) {
    const decrypted = await decryptRtcTimelineEvent(event, mx);
    if (!decrypted?.content || !decrypted.type) {
      Sentry.metrics.count('sable.call.signal.decrypt_timeout', 1);
      return undefined;
    }
    eventType = decrypted.type;
    content = decrypted.content;
  }

  const relation = event.getRelation() ?? relationFromContent(content);

  return parseRtcDecline(
    {
      type: eventType,
      sender: event.getSender() ?? '',
      roomId: room.roomId,
      eventId: event.getId() ?? '',
      originServerTs: event.getTs(),
      content,
      relation: relation
        ? {
            rel_type: relation.rel_type,
            event_id: relation.event_id,
          }
        : undefined,
      isLiveEvent: liveEvent,
      isEncrypted: false,
    },
    { myUserId }
  );
};
