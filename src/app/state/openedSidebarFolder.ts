import { getLocalStorageItem } from './utils/atomWithLocalStorage';
import { makeStringSetAtom } from './utils/stringSetAtom';
import type { StringSetAtom } from './utils/stringSetAtom';
import { getSettings } from './settings';

const OPENED_SIDEBAR_FOLDER = 'openedSidebarFolder';

export type OpenedSidebarFolderAtom = StringSetAtom;

export const makeOpenedSidebarFolderAtom = (userId: string): OpenedSidebarFolderAtom =>
  makeStringSetAtom(`${OPENED_SIDEBAR_FOLDER}${userId}`, (key) => {
    const settings = getSettings();
    if (settings.closeFoldersByDefault) {
      return new Set<string>();
    }
    return new Set(getLocalStorageItem<string[]>(key, []));
  });
