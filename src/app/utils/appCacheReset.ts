type CacheStorageLike = Pick<CacheStorage, 'keys' | 'delete'>;
type ServiceWorkerContainerLike = Pick<ServiceWorkerContainer, 'getRegistrations'>;

type ClearClientCacheOptions = {
  cacheStorage?: CacheStorageLike;
  serviceWorker?: ServiceWorkerContainerLike;
};

async function deleteAllCacheStorageEntries(cacheStorage: CacheStorageLike): Promise<void> {
  const cacheNames = await cacheStorage.keys();
  await Promise.allSettled(cacheNames.map((cacheName) => cacheStorage.delete(cacheName)));
}

async function unregisterAllServiceWorkers(
  serviceWorker: ServiceWorkerContainerLike
): Promise<void> {
  const registrations = await serviceWorker.getRegistrations();
  await Promise.allSettled(registrations.map((registration) => registration.unregister()));
}

export async function clearClientCachesAndServiceWorkers(
  options: ClearClientCacheOptions = {}
): Promise<void> {
  const cacheStorage = options.cacheStorage ?? (typeof caches !== 'undefined' ? caches : undefined);
  const serviceWorker =
    options.serviceWorker ??
    (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : undefined);

  await Promise.allSettled([
    cacheStorage ? deleteAllCacheStorageEntries(cacheStorage) : Promise.resolve(),
    serviceWorker ? unregisterAllServiceWorkers(serviceWorker) : Promise.resolve(),
  ]);
}
