import { atom } from 'jotai';

type ServiceWorkerRegistrationSource = Pick<ServiceWorkerContainer, 'getRegistration'>;

export const getServiceWorkerRegistration = async (
  serviceWorker: ServiceWorkerRegistrationSource | undefined = globalThis.navigator?.serviceWorker
): Promise<ServiceWorkerRegistration | undefined> => {
  if (!serviceWorker) return undefined;

  try {
    return await serviceWorker.getRegistration();
  } catch {
    return undefined;
  }
};

export const registrationAtom = atom<ServiceWorkerRegistration | undefined>(undefined);

registrationAtom.onMount = (set) => {
  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (!serviceWorker) return undefined;

  let disposed = false;

  const refreshRegistration = async () => {
    const registration = await getServiceWorkerRegistration(serviceWorker);
    if (!disposed) set(registration);
  };

  const handleControllerChange = () => {
    void refreshRegistration();
  };

  void refreshRegistration();
  serviceWorker.addEventListener('controllerchange', handleControllerChange);
  serviceWorker.ready
    .then((registration) => {
      if (!disposed) set(registration);
    })
    .catch(() => {
      void refreshRegistration();
    });

  return () => {
    disposed = true;
    serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  };
};
