import { atom } from 'jotai';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

export type UpdatePhase =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'downloading'; progress: number }
  | { type: 'ready'; version: string }
  | { type: 'installing' };

export const updatePhaseAtom = atom<UpdatePhase>({ type: 'idle' });

export const updateBannerVisibleAtom = atom(false);

export const triggerUpdateCheckAtom = atom(0);

const DESKTOP_UPDATE_LAST_CHECKED_KEY = 'desktopUpdateLastChecked';

export const desktopUpdateLastCheckedAtom = atomWithLocalStorage<string | null>(
  DESKTOP_UPDATE_LAST_CHECKED_KEY,
  (key) => getLocalStorageItem<string | null>(key, null),
  (key, value) => setLocalStorageItem(key, value)
);

export const fakeDesktopUpdate = (): boolean =>
  localStorage.getItem('sable_fake_desktop_update') === '1';
