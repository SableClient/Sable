import { atom } from 'jotai';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const UP_ENDPOINT_KEY = 'unifiedPushEndpoint';

type UnifiedPushState = {
  endpoint: string;
  instance: string;
} | null;

const baseAtom = atomWithLocalStorage<UnifiedPushState>(
  UP_ENDPOINT_KEY,
  (key) => getLocalStorageItem<UnifiedPushState>(key, null),
  (key, value) => {
    setLocalStorageItem(key, value);
  }
);

export const unifiedPushEndpointAtom = atom(
  (get) => get(baseAtom),
  (_get, set, value: UnifiedPushState) => {
    set(baseAtom, value);
  }
);
