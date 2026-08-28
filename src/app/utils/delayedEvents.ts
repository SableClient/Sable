import { EventType, MatrixEvent, UpdateDelayedEventAction } from '$types/matrix-sdk';
import type {
  DelayedEventInfoItem,
  SendDelayedEventResponse,
  IContent,
  MatrixClient,
  Room,
  RoomMessageEventContent,
  TimelineEvents,
} from '$types/matrix-sdk';

// Grab types needed for encryption
interface EncryptableBackend {
  encryptEvent(event: MatrixEvent, room: Room): Promise<void>;
}

// matrix-js-sdk's own `DelayedEventInfo` type declares this array under `scheduled`, but its
// `_unstable_getDelayedEvents` call is a raw passthrough of the server's response, and MSC4140
// (and every homeserver implementing it) puts the array under `delayed_events`:
// https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/4140-delayed-events-futures.md
export type DelayedEventsResponse = {
  delayed_events: DelayedEventInfoItem[];
  next_batch?: string;
};

export async function supportsDelayedEvents(mx: MatrixClient): Promise<boolean> {
  try {
    return await mx.doesServerSupportUnstableFeature('org.matrix.msc4140');
  } catch {
    return false;
  }
}

export async function sendDelayedMessage(
  mx: MatrixClient,
  roomId: string,
  content: IContent,
  delayMs: number,
  threadId?: string | null,
  eventType: keyof TimelineEvents = EventType.RoomMessage
): Promise<SendDelayedEventResponse> {
  return mx._unstable_sendDelayedEvent(
    roomId,
    { delay: delayMs },
    threadId ?? null,
    eventType as Parameters<typeof mx._unstable_sendDelayedEvent>[3],
    content as RoomMessageEventContent
  );
}

/**
 * Send a delayed message in an E2EE room by pre-encrypting the content at
 * scheduling time. The message is encrypted with the current Megolm session.
 * Devices that join or add new device keys after this call will not be
 * able to decrypt it.
 */
export async function sendDelayedMessageE2EE(
  mx: MatrixClient,
  roomId: string,
  room: Room,
  content: IContent,
  delayMs: number,
  threadId?: string | null,
  eventType: keyof TimelineEvents = EventType.RoomMessage
): Promise<SendDelayedEventResponse> {
  const crypto = mx.getCrypto();
  if (!crypto || !('encryptEvent' in crypto)) {
    throw new Error('Encryption not available: no crypto backend with encryptEvent');
  }

  // Create a temporary MatrixEvent to encrypt in-place.
  const event = new MatrixEvent({
    type: eventType,
    content,
    room_id: roomId,
    sender: mx.getUserId() ?? '',
    event_id: `~${roomId}:${Date.now()}`,
    origin_server_ts: Date.now(),
    unsigned: {},
  });

  // Minimal interface to CryptoAPI
  await (crypto as unknown as EncryptableBackend).encryptEvent(event, room);

  // After encryption:
  //   event.getWireType()    === 'm.room.encrypted'
  //   event.getWireContent() === the Megolm ciphertext object
  // Pass the pre-encrypted payload directly to the delayed-events API.

  return (
    mx as unknown as { _unstable_sendDelayedEvent: typeof mx._unstable_sendDelayedEvent }
  )._unstable_sendDelayedEvent(
    roomId,
    { delay: delayMs },
    threadId ?? null,
    event.getWireType() as Parameters<typeof mx._unstable_sendDelayedEvent>[3],
    event.getWireContent() as TimelineEvents[keyof TimelineEvents]
  );
}

export async function getDelayedEvents(mx: MatrixClient): Promise<DelayedEventsResponse> {
  return mx._unstable_getDelayedEvents() as unknown as Promise<DelayedEventsResponse>;
}

export async function cancelDelayedEvent(mx: MatrixClient, delayId: string): Promise<void> {
  await mx._unstable_updateDelayedEvent(delayId, UpdateDelayedEventAction.Cancel);
}

export function computeDelayMs(targetDate: Date): number {
  const delay = targetDate.getTime() - Date.now();
  if (delay <= 0) throw new Error('Scheduled time must be in the future');
  return delay;
}
