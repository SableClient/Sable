import { atom } from 'jotai';

type ListAction<T> =
  | {
      type: 'PUT';
      item: T | T[];
    }
  | {
      type: 'REPLACE';
      item: T;
      replacement: T;
    }
  | {
      type: 'DELETE';
      item: T | T[];
    };

export const createListAtom = <T>() => {
  const baseListAtom = atom<T[]>([]);
  return atom<T[], [ListAction<T>], undefined>(
    (get) => get(baseListAtom),
    (get, set, action) => {
      const items = get(baseListAtom);
      const newItems = Array.isArray(action.item) ? action.item : [action.item];
      if (action.type === 'DELETE') {
        set(
          baseListAtom,
          items.filter((item) => !newItems.includes(item))
        );
        return;
      }
      if (action.type === 'PUT') {
        set(baseListAtom, [...items, ...newItems]);
        return;
      }
      if (action.type === 'REPLACE') {
        set(
          baseListAtom,
          items.map((item) => (item === action.item ? action.replacement : item))
        );
      }
    }
  );
};
