import { atom } from 'jotai';
import type { UnifiedPushRegistrationStatus } from '$features/settings/notifications/UnifiedPushTransport';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const UP_ENDPOINT_KEY = 'unifiedPushEndpoint';

export type UnifiedPushState = {
  endpoint?: string;
  instance?: string;
  appId?: string;
  gatewayUrl?: string;
  status?: UnifiedPushRegistrationStatus;
  distributor?: string;
  error?: string;
  permissionState?: 'granted' | 'denied' | 'default';
  distributors?: string[];
  pubKeySet?: {
    pubKey: string;
    auth: string;
  };
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
