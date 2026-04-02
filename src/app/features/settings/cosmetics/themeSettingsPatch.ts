import { useCallback } from 'react';
import { useStore } from 'jotai/react';

import { settingsAtom, type Settings } from '$state/settings';

export function usePatchSettings() {
  const store = useStore();
  return useCallback(
    (partial: Partial<Settings>) => {
      const next = { ...store.get(settingsAtom), ...partial };
      store.set(settingsAtom, next);
    },
    [store]
  );
}
