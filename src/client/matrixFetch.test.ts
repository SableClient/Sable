import { describe, expect, it, vi } from 'vitest';
import { createMatrixFetch } from './matrixFetch';

describe('createMatrixFetch', () => {
  it('adds a timeout abort only to Matrix event send PUTs', async () => {
    const baseFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response()));
    const matrixFetch = createMatrixFetch(baseFetch);

    await matrixFetch('https://matrix.example/_matrix/client/v3/sync');
    await matrixFetch(
      'https://matrix.example/_matrix/client/v3/rooms/!r:ex/send/m.room.message/m1',
      { method: 'PUT' }
    );
    await matrixFetch(
      'https://matrix.example/_matrix/client/v3/rooms/!r:ex/send/m.room.encrypted/m2',
      { method: 'PUT' }
    );
    await matrixFetch('https://matrix.example/_matrix/client/v3/rooms/!r:ex/redact/$e/m3', {
      method: 'PUT',
    });

    expect(baseFetch.mock.calls[0]?.[1]?.signal).toBeUndefined();
    expect(baseFetch.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(baseFetch.mock.calls[2]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(baseFetch.mock.calls[3]?.[1]?.signal).toBeUndefined();
  });

  it('merges with an existing abort signal on the request', async () => {
    const baseFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response()));
    const matrixFetch = createMatrixFetch(baseFetch);
    const controller = new AbortController();

    await matrixFetch(
      new Request('https://matrix.example/_matrix/client/v3/rooms/!r:ex/send/m.room.message/m1', {
        method: 'PUT',
        signal: controller.signal,
      })
    );

    const signal = baseFetch.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal).not.toBe(controller.signal);
  });
});
