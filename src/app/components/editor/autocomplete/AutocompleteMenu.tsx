import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Header, Menu, Scroll, config } from 'folds';

import { preventScrollWithArrowKey, stopPropagation } from '$utils/keyboard';
import { useAlive } from '$hooks/useAlive';
import * as css from './AutocompleteMenu.css';
import { BaseAutocompleteMenu } from './BaseAutocompleteMenu';

export const AUTOCOMPLETE_NAVIGATE_EVENT = 'autocomplete-navigate';
export type AutocompleteNavigateDetail = { direction: 1 | -1 };

type AutocompleteMenuProps = {
  requestClose: () => void;
  headerContent: ReactNode;
  children: ReactNode;
};
export function AutocompleteMenu({ headerContent, requestClose, children }: AutocompleteMenuProps) {
  const alive = useAlive();
  const itemsRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prevButtonCountRef = useRef(-1);

  const handleDeactivate = () => {
    if (alive()) {
      // The component is unmounted so we will not call for `requestClose`
      requestClose();
    }
  };

  // Sync data-selected to DOM; reset to index 0 when the item list changes.
  // No dep array — runs after every render so newly-loaded buttons are stamped
  // immediately (buttons arrive async when search results load).
  // setSelectedIndex is a stable React setter; the conditional call never
  // triggers an infinite update chain (it only fires when button count changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const buttons = Array.from(
      itemsRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    );
    const count = buttons.length;

    let idx = selectedIndex;
    if (count !== prevButtonCountRef.current) {
      prevButtonCountRef.current = count;
      idx = 0;
      if (selectedIndex !== 0) setSelectedIndex(0);
    }

    const safeIdx = Math.max(0, Math.min(idx, count - 1));
    buttons.forEach((btn, i) => {
      btn.setAttribute('data-selected', String(i === safeIdx));
    });
  });

  // Listen for navigation events dispatched by the editor key handler
  useEffect(() => {
    const container = itemsRef.current?.closest('[data-autocomplete-menu]');
    if (!container) return undefined;
    const handler = (e: Event) => {
      const { direction } = (e as CustomEvent<AutocompleteNavigateDetail>).detail;
      setSelectedIndex((prev) => {
        const buttons = itemsRef.current?.querySelectorAll('button') ?? [];
        return Math.max(0, Math.min(prev + direction, buttons.length - 1));
      });
    };
    container.addEventListener(AUTOCOMPLETE_NAVIGATE_EVENT, handler);
    return () => container.removeEventListener(AUTOCOMPLETE_NAVIGATE_EVENT, handler);
  }, []);

  return (
    <BaseAutocompleteMenu>
      <FocusTrap
        focusTrapOptions={{
          initialFocus: false,
          onPostDeactivate: handleDeactivate,
          returnFocusOnDeactivate: false,
          clickOutsideDeactivates: true,
          allowOutsideClick: true,
          escapeDeactivates: stopPropagation,
        }}
      >
        <Menu className={css.AutocompleteMenu}>
          <Header className={css.AutocompleteMenuHeader} size="400">
            {headerContent}
          </Header>
          <Scroll style={{ flexGrow: 1 }} onKeyDown={preventScrollWithArrowKey}>
            <div
              ref={itemsRef}
              className={css.AutocompleteMenuItems}
              style={{ padding: config.space.S200 }}
            >
              {children}
            </div>
          </Scroll>
        </Menu>
      </FocusTrap>
    </BaseAutocompleteMenu>
  );
}
