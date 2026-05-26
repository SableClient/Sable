/**
 * Shared Tiptap autocomplete menu wrapper — identical visual layout to the
 * existing AutocompleteMenu but with no Slate / ReactEditor dependency.
 */
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { Header, Menu, Scroll, config } from 'folds';
import { preventScrollWithArrowKey, stopPropagation } from '$utils/keyboard';
import { useAlive } from '$hooks/useAlive';
import * as css from '$components/editor/autocomplete/AutocompleteMenu.css';

type TiptapAutocompleteMenuProps = {
  onClose: () => void;
  headerContent: ReactNode;
  children: ReactNode;
};

export function TiptapAutocompleteMenu({
  headerContent,
  onClose,
  children,
}: TiptapAutocompleteMenuProps) {
  const alive = useAlive();
  const [isActive, setIsActive] = useState(true);

  const handleDeactivate = () => {
    if (alive()) onClose();
  };

  function handleInput(evt: ReactKeyboardEvent) {
    if (!evt) return;
    if (
      isKeyHotkey('arrowdown', evt.nativeEvent) ||
      isKeyHotkey('arrowup', evt.nativeEvent) ||
      isKeyHotkey('tab', evt.nativeEvent) ||
      isKeyHotkey('esc', evt.nativeEvent) ||
      isKeyHotkey('Enter', evt.nativeEvent)
    )
      return;
    setIsActive(false);
  }

  return (
    <div className={css.AutocompleteMenuBase}>
      <div className={css.AutocompleteMenuContainer} data-autocomplete-menu="true">
        <FocusTrap
          active={isActive}
          focusTrapOptions={{
            initialFocus: false,
            onPostDeactivate: handleDeactivate,
            returnFocusOnDeactivate: false,
            clickOutsideDeactivates: true,
            allowOutsideClick: true,
            isKeyForward: (e: KeyboardEvent) => isKeyHotkey('arrowdown', e),
            isKeyBackward: (e: KeyboardEvent) => isKeyHotkey('arrowup', e),
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            className={css.AutocompleteMenu}
            onKeyDown={(e) => handleInput(e as ReactKeyboardEvent)}
          >
            <Header className={css.AutocompleteMenuHeader} size="400">
              {headerContent}
            </Header>
            <Scroll style={{ flexGrow: 1 }} onKeyDown={preventScrollWithArrowKey}>
              <div style={{ padding: config.space.S200 }}>{children}</div>
            </Scroll>
          </Menu>
        </FocusTrap>
      </div>
    </div>
  );
}
