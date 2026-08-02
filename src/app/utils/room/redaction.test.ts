import { describe, it, expect, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { EventStatus, MatrixEvent } from '$types/matrix-sdk';
import { isLocalEventId, redactOrCancelEvent, resolveRemoteEventId } from './redaction';

const ROOM_ID = '!r:example.org';

const makeMx = () =>
  ({
    redactEvent: vi.fn<() => Promise<{ event_id: string }>>(async () => ({
      event_id: '$redaction',
    })),
    cancelPendingEvent: vi.fn<() => void>(),
  }) as unknown as MatrixClient & {
    redactEvent: ReturnType<typeof vi.fn>;
    cancelPendingEvent: ReturnType<typeof vi.fn>;
  };

const makeEvent = (eventId: string, status: EventStatus | null = null) => {
  const mEvent = new MatrixEvent({
    type: 'm.reaction',
    event_id: eventId,
    room_id: ROOM_ID,
    sender: '@me:example.org',
    content: {},
  });
  mEvent.setStatus(status);
  return mEvent;
};

describe('isLocalEventId', () => {
  it('recognises the local echo prefix', () => {
    expect(isLocalEventId('~!r:example.org:txn1')).toBe(true);
    expect(isLocalEventId('$real')).toBe(false);
  });
});

describe('redactOrCancelEvent', () => {
  it('redacts an event the server already knows about', async () => {
    const mx = makeMx();
    await redactOrCancelEvent(mx, makeEvent('$real'), { reason: 'spam' });

    expect(mx.redactEvent).toHaveBeenCalledWith(ROOM_ID, '$real', undefined, { reason: 'spam' });
    expect(mx.cancelPendingEvent).not.toHaveBeenCalled();
  });

  it('cancels a queued event instead of redacting a local echo id', async () => {
    const mx = makeMx();
    const mEvent = makeEvent('~!r:example.org:txn1', EventStatus.QUEUED);

    await redactOrCancelEvent(mx, mEvent);

    expect(mx.cancelPendingEvent).toHaveBeenCalledWith(mEvent);
    expect(mx.redactEvent).not.toHaveBeenCalled();
  });

  it('waits for the server id before redacting an event that is in flight', async () => {
    const mx = makeMx();
    const mEvent = makeEvent('~!r:example.org:txn1', EventStatus.SENDING);

    const redacting = redactOrCancelEvent(mx, mEvent);
    await Promise.resolve();
    expect(mx.redactEvent).not.toHaveBeenCalled();

    mEvent.replaceLocalEventId('$real');
    await redacting;

    expect(mx.redactEvent).toHaveBeenCalledWith(ROOM_ID, '$real', undefined, undefined);
  });

  it('rejects when the in flight send fails, so the caller cannot report success', async () => {
    const mx = makeMx();
    const mEvent = makeEvent('~!r:example.org:txn1', EventStatus.SENDING);

    const redacting = redactOrCancelEvent(mx, mEvent);
    mEvent.setStatus(EventStatus.CANCELLED);

    await expect(redacting).rejects.toThrow('never sent');
    expect(mx.redactEvent).not.toHaveBeenCalled();
  });
});

describe('resolveRemoteEventId', () => {
  it('returns a server id unchanged', async () => {
    await expect(resolveRemoteEventId(makeEvent('$real'))).resolves.toBe('$real');
  });

  it('waits for a pending event to receive its server id', async () => {
    const mEvent = makeEvent('~!r:example.org:txn1', EventStatus.SENDING);
    const eventId = resolveRemoteEventId(mEvent);

    mEvent.replaceLocalEventId('$real');

    await expect(eventId).resolves.toBe('$real');
  });

  it('gives up when the send is abandoned', async () => {
    const mEvent = makeEvent('~!r:example.org:txn1', EventStatus.SENDING);
    const eventId = resolveRemoteEventId(mEvent);

    mEvent.setStatus(EventStatus.NOT_SENT);

    await expect(eventId).resolves.toBeUndefined();
  });

  it('gives up on a send that stays queued', async () => {
    vi.useFakeTimers();
    try {
      const mEvent = makeEvent('~!r:example.org:txn1', EventStatus.SENDING);
      const eventId = resolveRemoteEventId(mEvent);

      await vi.advanceTimersByTimeAsync(30000);

      await expect(eventId).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
