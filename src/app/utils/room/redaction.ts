import type { IRedactOpts, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { EventStatus, MatrixEventEvent } from '$types/matrix-sdk';

const LOCAL_EVENT_ID_PREFIX = '~';

const REMOTE_EVENT_ID_TIMEOUT_MS = 30000;

const CANCELLABLE_STATUSES = new Set<EventStatus | null>([
  EventStatus.QUEUED,
  EventStatus.NOT_SENT,
  EventStatus.ENCRYPTING,
]);

export const isLocalEventId = (eventId: string): boolean =>
  eventId.startsWith(LOCAL_EVENT_ID_PREFIX);

const waitForRemoteEventId = (mEvent: MatrixEvent): Promise<string | undefined> =>
  new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const settle = (eventId: string | undefined) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      mEvent.off(MatrixEventEvent.LocalEventIdReplaced, onIdReplaced);
      mEvent.off(MatrixEventEvent.Status, onStatus);
      // oxlint-disable-next-line promise/no-multiple-resolved
      resolve(eventId);
    };
    function onIdReplaced() {
      settle(mEvent.getId());
    }
    function onStatus(_: MatrixEvent, status: EventStatus | null) {
      if (status === EventStatus.NOT_SENT || status === EventStatus.CANCELLED) settle(undefined);
    }
    mEvent.on(MatrixEventEvent.LocalEventIdReplaced, onIdReplaced);
    mEvent.on(MatrixEventEvent.Status, onStatus);
    timer = setTimeout(() => settle(undefined), REMOTE_EVENT_ID_TIMEOUT_MS);

    const eventId = mEvent.getId();
    if (eventId && !isLocalEventId(eventId)) settle(eventId);
    else if (mEvent.status === EventStatus.NOT_SENT || mEvent.status === EventStatus.CANCELLED) {
      settle(undefined);
    }
  });

export const resolveRemoteEventId = async (mEvent: MatrixEvent): Promise<string | undefined> => {
  const eventId = mEvent.getId();
  if (!eventId || !isLocalEventId(eventId)) return eventId;

  const remoteEventId = await waitForRemoteEventId(mEvent);
  return remoteEventId && !isLocalEventId(remoteEventId) ? remoteEventId : undefined;
};

// mx.redactEvent throws on a local echo id: it resolves the target through
// Room.getPendingEvents(), unavailable under chronological pending event ordering.
export const redactOrCancelEvent = async (
  mx: MatrixClient,
  mEvent: MatrixEvent,
  opts?: IRedactOpts
): Promise<void> => {
  const roomId = mEvent.getRoomId();
  if (!roomId) throw new Error('Cannot redact an event that belongs to no room');

  const localEventId = mEvent.getId();
  if (localEventId && isLocalEventId(localEventId) && CANCELLABLE_STATUSES.has(mEvent.status)) {
    mx.cancelPendingEvent(mEvent);
    return;
  }

  const eventId = await resolveRemoteEventId(mEvent);
  if (!eventId) throw new Error('Cannot redact an event that was never sent');

  await mx.redactEvent(roomId, eventId, undefined, opts);
};
