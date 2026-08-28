import type { WritableAtom } from 'jotai';
import { atom } from 'jotai';
import { produce } from 'immer';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './atomWithLocalStorage';

export type StringSetAction = { type: 'PUT' | 'DELETE'; value: string };

export type StringSetAtom = WritableAtom<Set<string>, [StringSetAction], undefined>;

/**
 * A per-account Set of strings persisted to local storage. `loadInitial` is for
 * the one caller whose stored value is overridden by a setting.
 */
export const makeStringSetAtom = (
  storeKey: string,
  loadInitial: (key: string) => Set<string> = (key) =>
    new Set(getLocalStorageItem<string[]>(key, []))
): StringSetAtom => {
  const baseAtom = atomWithLocalStorage<Set<string>>(storeKey, loadInitial, (key, value) => {
    setLocalStorageItem(key, Array.from(value));
  });

  return atom<Set<string>, [StringSetAction], undefined>(
    (get) => get(baseAtom),
    (get, set, action) => {
      set(
        baseAtom,
        produce(get(baseAtom), (draft) => {
          if (action.type === 'DELETE') draft.delete(action.value);
          else draft.add(action.value);
        })
      );
    }
  );
};
