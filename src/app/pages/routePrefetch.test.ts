import { describe, expect, it, vi } from 'vitest';
import {
  __resetRoutePrefetchForTests,
  prefetchRouteChunks,
  scheduleInitialRoutePrefetch,
} from './routePrefetch';

describe('routePrefetch', () => {
  it('deduplicates concurrent prefetches by key', async () => {
    __resetRoutePrefetchForTests();
    const importer = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

    await Promise.all([
      prefetchRouteChunks('shared-key', [importer]),
      prefetchRouteChunks('shared-key', [importer]),
      prefetchRouteChunks('shared-key', [importer]),
    ]);

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('schedules only one initial idle prefetch run', () => {
    __resetRoutePrefetchForTests();
    const runPrefetch = vi.fn<() => void>();
    const requestIdleCallback =
      vi.fn<
        (cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => number
      >();
    const setTimeout = vi.fn<(cb: () => void, delay: number) => number>();
    const win = { requestIdleCallback, setTimeout } as unknown as Window &
      typeof globalThis & {
        requestIdleCallback: (cb: () => void, options: { timeout: number }) => number;
      };

    scheduleInitialRoutePrefetch(runPrefetch, win);
    scheduleInitialRoutePrefetch(runPrefetch, win);

    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 1200 });
    expect(setTimeout).not.toHaveBeenCalled();

    const firstCall = requestIdleCallback.mock.calls[0];
    if (!firstCall) throw new Error('Expected requestIdleCallback to have been called');
    const callback = firstCall[0] as () => void;
    callback();
    expect(runPrefetch).toHaveBeenCalledTimes(1);
  });
});
