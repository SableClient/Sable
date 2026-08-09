import { describe, expect, it } from 'vitest';
import { createComposerController } from './composerController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('composer controller', () => {
  it('runs a later send only after a slow one finishes', async () => {
    const controller = createComposerController();
    const slow = deferred<void>();
    const order: string[] = [];

    const slowSend = controller.enqueue(async () => {
      order.push('slow:start');
      await slow.promise;
      order.push('slow:end');
    });
    const nextSend = controller.enqueue(() => {
      order.push('next');
    });

    await Promise.resolve();
    expect(order).toEqual(['slow:start']);
    slow.resolve();
    await Promise.all([slowSend, nextSend]);
    expect(order).toEqual(['slow:start', 'slow:end', 'next']);
  });

  it('reports the composer as gone after disposal', async () => {
    const controller = createComposerController();
    const completion = deferred<void>();
    let cleanupCount = 0;

    const send = controller.enqueue(async (isLive) => {
      await completion.promise;
      if (isLive()) cleanupCount += 1;
    });

    await Promise.resolve();
    controller.dispose();
    completion.resolve();
    await send;

    expect(cleanupCount).toBe(0);
  });

  it('skips operations enqueued after disposal', async () => {
    const controller = createComposerController();
    let ran = false;

    controller.dispose();

    await expect(controller.enqueue(() => (ran = true))).resolves.toBeUndefined();
    expect(ran).toBe(false);
  });

  it('advances the tail after a rejected operation', async () => {
    const controller = createComposerController();

    await expect(
      controller.enqueue(() => {
        throw new Error('send failed');
      })
    ).rejects.toThrow('send failed');
    await expect(controller.enqueue(() => 'completed')).resolves.toBe('completed');
  });
});
