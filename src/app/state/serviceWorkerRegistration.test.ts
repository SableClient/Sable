import { describe, expect, it, vi } from 'vitest';

import { getServiceWorkerRegistration } from './serviceWorkerRegistration';

describe('getServiceWorkerRegistration', () => {
  it('returns the current registration when one exists', async () => {
    const registration = { scope: 'https://example.com/' } as ServiceWorkerRegistration;
    const serviceWorker = {
      getRegistration: vi
        .fn<ServiceWorkerContainer['getRegistration']>()
        .mockResolvedValue(registration),
      ready: new Promise<ServiceWorkerRegistration>(() => undefined),
    } as Pick<ServiceWorkerContainer, 'getRegistration' | 'ready'>;

    await expect(getServiceWorkerRegistration(serviceWorker)).resolves.toBe(registration);
    expect(serviceWorker.getRegistration).toHaveBeenCalledOnce();
  });

  it('does not block on serviceWorker.ready when no registration exists', async () => {
    const serviceWorker = {
      getRegistration: vi
        .fn<ServiceWorkerContainer['getRegistration']>()
        .mockResolvedValue(undefined),
      ready: new Promise<ServiceWorkerRegistration>(() => undefined),
    } as Pick<ServiceWorkerContainer, 'getRegistration' | 'ready'>;

    await expect(getServiceWorkerRegistration(serviceWorker)).resolves.toBeUndefined();
    expect(serviceWorker.getRegistration).toHaveBeenCalledOnce();
  });

  it('returns undefined when registration lookup fails', async () => {
    const serviceWorker = {
      getRegistration: vi
        .fn<ServiceWorkerContainer['getRegistration']>()
        .mockRejectedValue(new Error('boom')),
      ready: new Promise<ServiceWorkerRegistration>(() => undefined),
    } as Pick<ServiceWorkerContainer, 'getRegistration' | 'ready'>;

    await expect(getServiceWorkerRegistration(serviceWorker)).resolves.toBeUndefined();
    expect(serviceWorker.getRegistration).toHaveBeenCalledOnce();
  });
});
