import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const AUTO_UPDATE_CHECK_KEY = 'autoUpdateCheck';

export const autoUpdateCheckAtom = atomWithLocalStorage<boolean>(
  AUTO_UPDATE_CHECK_KEY,
  (key) => getLocalStorageItem<boolean>(key, true),
  (key, value) => setLocalStorageItem(key, value)
);
