import type { MatrixClient } from '$types/matrix-sdk';
import { MatrixEvent } from '$types/matrix-sdk';

// Notification records deliberately do not persist message bodies, so previewing
// one outside a loaded timeline means reading the real event. Cached because the
// inbox virtualizer remounts its rows on every scroll.
const inFlight = new Map<string, Promise<MatrixEvent>>();

export const fetchNotificationEvent = (
  mx: MatrixClient,
  roomId: string,
  eventId: string
): Promise<MatrixEvent> => {
  const key = `${roomId}/${eventId}`;
  const cached = inFlight.get(key);
  if (cached) return cached;

  const request = mx.fetchRoomEvent(roomId, eventId).then(async (raw) => {
    const event = new MatrixEvent(raw);
    if (event.isEncrypted()) await mx.decryptEventIfNeeded(event).catch(() => undefined);
    return event;
  });
  // Do not cache a failure; the next render should retry.
  request.catch(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};
