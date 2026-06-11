import { atom } from 'jotai';
import { hasServiceWorker } from '$utils/platform';

export const registrationAtom = atom(async () => {
  if (!hasServiceWorker()) return null;
  return navigator.serviceWorker.ready;
});
