/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from 'vitest';
import { clearClientCachesAndServiceWorkers } from './appCacheReset';

describe('clearClientCachesAndServiceWorkers', () => {
  it('clears all cache storage entries without unregistering service workers by default', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi
      .fn()
      .mockResolvedValue([{ unregister: unregisterA }, { unregister: unregisterB }]);

    await clearClientCachesAndServiceWorkers({
      cacheStorage: {
        keys: vi.fn().mockResolvedValue(['cache-a', 'cache-b']),
        delete: deleteCache,
      },
      serviceWorker: {
        getRegistrations,
      },
    });

    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith('cache-a');
    expect(deleteCache).toHaveBeenCalledWith('cache-b');
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(unregisterA).not.toHaveBeenCalled();
    expect(unregisterB).not.toHaveBeenCalled();
  });

  it('unregisters service workers when explicitly requested', async () => {
    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);

    await clearClientCachesAndServiceWorkers({
      serviceWorker: {
        getRegistrations: vi
          .fn()
          .mockResolvedValue([{ unregister: unregisterA }, { unregister: unregisterB }]),
      },
      unregisterServiceWorkers: true,
    });

    expect(unregisterA).toHaveBeenCalledTimes(1);
    expect(unregisterB).toHaveBeenCalledTimes(1);
  });

  it('continues when cache or service worker cleanup fails', async () => {
    const unregister = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      clearClientCachesAndServiceWorkers({
        cacheStorage: {
          keys: vi.fn().mockRejectedValue(new Error('cache-failed')),
          delete: vi.fn(),
        },
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
        },
        unregisterServiceWorkers: true,
      })
    ).resolves.toBeUndefined();

    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
