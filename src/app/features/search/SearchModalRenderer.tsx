import { lazy, Suspense, useCallback } from 'react';
import { isKeyHotkey } from 'is-hotkey';
import { useAtom } from 'jotai';
import { useKeyDown } from '$hooks/useKeyDown';
import { searchModalAtom } from '$state/searchModal';

const Search = lazy(async () => {
  const mod = await import('./Search');
  return { default: mod.Search };
});

export function SearchModalRenderer() {
  const [opened, setOpen] = useAtom(searchModalAtom);

  useKeyDown(
    window,
    useCallback(
      (event) => {
        if (isKeyHotkey('mod+k', event) || isKeyHotkey('mod+f', event)) {
          event.preventDefault();
          if (opened) {
            setOpen(false);
            return;
          }

          const portalContainer = document.getElementById('portalContainer');
          if (portalContainer && portalContainer.children.length > 0) {
            return;
          }
          setOpen(true);
        }
      },
      [opened, setOpen]
    )
  );

  if (!opened) return null;

  return (
    <Suspense fallback={null}>
      <Search requestClose={() => setOpen(false)} />
    </Suspense>
  );
}
