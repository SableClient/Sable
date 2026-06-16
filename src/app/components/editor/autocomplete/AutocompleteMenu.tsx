import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { Header, Menu, Scroll, config } from 'folds';

import { preventScrollWithArrowKey, stopPropagation } from '$utils/keyboard';
import { useAlive } from '$hooks/useAlive';
import type { Editor } from 'slate';
import { ReactEditor } from 'slate-react';
import * as css from './AutocompleteMenu.css';
import { BaseAutocompleteMenu } from './BaseAutocompleteMenu';

type AutocompleteMenuProps = {
  requestClose: () => void;
  headerContent: ReactNode;
  children: ReactNode;
  editor: Editor;
};
export function AutocompleteMenu({
  headerContent,
  requestClose,
  children,
  editor,
}: AutocompleteMenuProps) {
  const alive = useAlive();
  const itemsRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(0);

  const handleDeactivate = () => {
    if (alive()) {
      // The component is unmounted so we will not call for `requestClose`
      requestClose();
    }
  };
  const [isActive, setIsActive] = useState(true);
  useEffect(() => ReactEditor.focus(editor), [editor, isActive]);

  const applySelectedIndex = useCallback((nextIndex: number, focus = false) => {
    const buttons = Array.from(
      itemsRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    );
    if (buttons.length === 0) {
      selectedIndexRef.current = 0;
      return;
    }

    const clampedIndex = Math.max(0, Math.min(nextIndex, buttons.length - 1));
    selectedIndexRef.current = clampedIndex;

    buttons.forEach((button, index) => {
      button.dataset.selected = String(index === clampedIndex);
    });

    if (focus) {
      const selectedButton = buttons[clampedIndex];
      selectedButton?.focus({ preventScroll: true });
      selectedButton?.scrollIntoView?.({ block: 'nearest' });
    }
  }, []);

  useEffect(() => {
    applySelectedIndex(0);
  }, [children, applySelectedIndex]);

  useEffect(() => {
    const items = itemsRef.current;
    const menuRoot = items?.closest('[data-autocomplete-menu]');
    if (!items || !menuRoot) return undefined;

    const handleNavigate = (event: Event) => {
      const direction = Number(
        (event as CustomEvent<{ direction?: number }>).detail?.direction ?? 0
      );
      if (!Number.isFinite(direction) || direction === 0) return;
      applySelectedIndex(selectedIndexRef.current + direction, true);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const buttons = Array.from(items.querySelectorAll<HTMLButtonElement>('button'));
      const index = buttons.indexOf(target);
      if (index >= 0) applySelectedIndex(index);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('button');
      if (!button) return;
      const buttons = Array.from(items.querySelectorAll<HTMLButtonElement>('button'));
      const index = buttons.indexOf(button);
      if (index >= 0) applySelectedIndex(index);
    };

    menuRoot.addEventListener('autocomplete-navigate', handleNavigate as EventListener);
    items.addEventListener('focusin', handleFocusIn);
    items.addEventListener('pointermove', handlePointerMove);
    return () => {
      menuRoot.removeEventListener('autocomplete-navigate', handleNavigate as EventListener);
      items.removeEventListener('focusin', handleFocusIn);
      items.removeEventListener('pointermove', handlePointerMove);
    };
  }, [applySelectedIndex]);

  function handleInput(evt: KeyboardEvent) {
    if (!evt) return;
    if (
      isKeyHotkey('arrowdown', evt) ||
      isKeyHotkey('arrowup', evt) ||
      isKeyHotkey('tab', evt) ||
      isKeyHotkey('esc', evt) ||
      isKeyHotkey('Enter', evt)
    )
      return;
    setIsActive(false);
  }

  return (
    <BaseAutocompleteMenu>
      <FocusTrap
        active={isActive}
        focusTrapOptions={{
          initialFocus: false,
          onPostDeactivate: handleDeactivate,
          returnFocusOnDeactivate: false,
          clickOutsideDeactivates: true,
          allowOutsideClick: true,
          isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
          isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
          escapeDeactivates: stopPropagation,
          tabbableOptions: { displayCheck: 'none' },
        }}
      >
        <Menu
          className={css.AutocompleteMenu}
          onKeyDown={(evt) => handleInput(evt as unknown as KeyboardEvent)}
        >
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
