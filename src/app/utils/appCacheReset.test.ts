/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from 'vitest';
import { clearClientCachesAndServiceWorkers } from './appCacheReset';

describe('clearClientCachesAndServiceWorkers', () => {
  it('clears all cache storage entries and unregisters all service workers', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);

    await clearClientCachesAndServiceWorkers({
      cacheStorage: {
        keys: vi.fn().mockResolvedValue(['cache-a', 'cache-b']),
        delete: deleteCache,
      },
      serviceWorker: {
        getRegistrations: vi
          .fn()
          .mockResolvedValue([{ unregister: unregisterA }, { unregister: unregisterB }]),
      },
    });

    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith('cache-a');
    expect(deleteCache).toHaveBeenCalledWith('cache-b');
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
      })
    ).resolves.toBeUndefined();

    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
