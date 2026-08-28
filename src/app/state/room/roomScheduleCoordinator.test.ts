import { describe, expect, it, vi } from 'vitest';
import { roomScheduleCoordinator } from './roomScheduleCoordinator';

const account = (userId: string) => ({ getSafeUserId: () => userId });
const alice = account('@alice:example.org');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('roomScheduleCoordinator', () => {
  it('runs operations in FIFO order for a room', async () => {
    const first = deferred();
    const order: string[] = [];

    const firstOperation = roomScheduleCoordinator.run(alice, '!room:example.org', async () => {
      order.push('first-start');
      await first.promise;
      order.push('first-end');
    });
    const secondOperation = roomScheduleCoordinator.run(alice, '!room:example.org', async () => {
      order.push('second');
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['first-start']);

    first.resolve();
    await Promise.all([firstOperation, secondOperation]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('continues the room queue after an operation fails', async () => {
    const second = vi.fn<() => Promise<string>>(async () => 'completed');

    await expect(
      roomScheduleCoordinator.run(alice, '!room:example.org', async () => {
        throw new Error('cancel failed');
      })
    ).rejects.toThrow('cancel failed');
    await expect(roomScheduleCoordinator.run(alice, '!room:example.org', second)).resolves.toBe(
      'completed'
    );

    expect(second).toHaveBeenCalledOnce();
  });

  it('does not serialize operations for different rooms', async () => {
    const first = deferred();
    const second = vi.fn<() => Promise<string>>(async () => 'completed');

    const firstOperation = roomScheduleCoordinator.run(
      alice,
      '!first:example.org',
      () => first.promise
    );
    const secondOperation = roomScheduleCoordinator.run(alice, '!second:example.org', second);

    await expect(secondOperation).resolves.toBe('completed');
    expect(second).toHaveBeenCalledOnce();

    first.resolve();
    await firstOperation;
  });

  it('does not serialize the same room ID across accounts', async () => {
    const first = deferred();
    const second = vi.fn<() => Promise<string>>(async () => 'completed');

    const firstOperation = roomScheduleCoordinator.run(
      alice,
      '!room:example.org',
      () => first.promise
    );
    const secondOperation = roomScheduleCoordinator.run(
      account('@bob:example.org'),
      '!room:example.org',
      second
    );

    await expect(secondOperation).resolves.toBe('completed');
    expect(second).toHaveBeenCalledOnce();

    first.resolve();
    await firstOperation;
  });
});
