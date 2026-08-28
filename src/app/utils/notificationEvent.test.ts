import { describe, expect, it, vi } from 'vitest';
import type { IEvent, MatrixClient } from '$types/matrix-sdk';
import { fetchNotificationEvent } from './notificationEvent';

const ROOM = '!room:example.com';

const rawEvent = (eventId: string, overrides: Partial<IEvent> = {}): Partial<IEvent> => ({
  event_id: eventId,
  room_id: ROOM,
  type: 'm.room.message',
  sender: '@other:example.com',
  origin_server_ts: 1,
  content: { msgtype: 'm.text', body: 'the real body' },
  ...overrides,
});

const makeMx = (fetchImpl: (roomId: string, eventId: string) => Promise<Partial<IEvent>>) => {
  const fetchRoomEvent = vi
    .fn<(roomId: string, eventId: string) => Promise<Partial<IEvent>>>()
    .mockImplementation(fetchImpl);
  const decryptEventIfNeeded = vi.fn<() => Promise<void>>().mockResolvedValue();

  return {
    mx: { fetchRoomEvent, decryptEventIfNeeded } as unknown as MatrixClient,
    fetchRoomEvent,
    decryptEventIfNeeded,
  };
};

describe('fetchNotificationEvent', () => {
  it('returns the event body the stored notification does not keep', async () => {
    const { mx } = makeMx((_roomId, eventId) => Promise.resolve(rawEvent(eventId)));

    const event = await fetchNotificationEvent(mx, ROOM, '$body');

    expect(event.getId()).toBe('$body');
    expect(event.getContent().body).toBe('the real body');
  });

  it('fetches an event only once across remounts', async () => {
    const { mx, fetchRoomEvent } = makeMx((_roomId, eventId) => Promise.resolve(rawEvent(eventId)));

    await fetchNotificationEvent(mx, ROOM, '$cached');
    await fetchNotificationEvent(mx, ROOM, '$cached');

    expect(fetchRoomEvent).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent callers', async () => {
    const { mx, fetchRoomEvent } = makeMx((_roomId, eventId) => Promise.resolve(rawEvent(eventId)));

    const [first, second] = await Promise.all([
      fetchNotificationEvent(mx, ROOM, '$concurrent'),
      fetchNotificationEvent(mx, ROOM, '$concurrent'),
    ]);

    expect(fetchRoomEvent).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('retries after a failure instead of caching it', async () => {
    const { mx, fetchRoomEvent } = makeMx((_roomId, eventId) =>
      fetchRoomEvent.mock.calls.length === 1
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(rawEvent(eventId))
    );

    await expect(fetchNotificationEvent(mx, ROOM, '$retry')).rejects.toThrow('offline');
    const event = await fetchNotificationEvent(mx, ROOM, '$retry');

    expect(fetchRoomEvent).toHaveBeenCalledTimes(2);
    expect(event.getContent().body).toBe('the real body');
  });

  it('decrypts an encrypted event before returning it', async () => {
    const { mx, decryptEventIfNeeded } = makeMx((_roomId, eventId) =>
      Promise.resolve(
        rawEvent(eventId, {
          type: 'm.room.encrypted',
          content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AAAA' },
        })
      )
    );

    await fetchNotificationEvent(mx, ROOM, '$encrypted');

    expect(decryptEventIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('still returns the event when decryption fails', async () => {
    const { mx, decryptEventIfNeeded } = makeMx((_roomId, eventId) =>
      Promise.resolve(
        rawEvent(eventId, {
          type: 'm.room.encrypted',
          content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AAAA' },
        })
      )
    );
    decryptEventIfNeeded.mockRejectedValue(new Error('no keys'));

    const event = await fetchNotificationEvent(mx, ROOM, '$undecryptable');

    expect(event.getId()).toBe('$undecryptable');
  });

  it('does not decrypt a plaintext event', async () => {
    const { mx, decryptEventIfNeeded } = makeMx((_roomId, eventId) =>
      Promise.resolve(rawEvent(eventId))
    );

    await fetchNotificationEvent(mx, ROOM, '$plain');

    expect(decryptEventIfNeeded).not.toHaveBeenCalled();
  });
});
