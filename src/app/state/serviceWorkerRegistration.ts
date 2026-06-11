import { atom } from 'jotai';
import { hasServiceWorker } from '$utils/platform';

export async function getServiceWorkerRegistration(
  serviceWorker: Pick<ServiceWorkerContainer, 'getRegistration' | 'ready'>
): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return (await serviceWorker.getRegistration()) ?? undefined;
  } catch {
    return undefined;
  }
}

export const registrationAtom = atom(async () => {
  if (!hasServiceWorker()) return null;
  return (
    (await getServiceWorkerRegistration(navigator.serviceWorker)) ?? navigator.serviceWorker.ready
  );
});
