import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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

  const handleDeactivate = () => {
    if (alive()) {
      // The component is unmounted so we will not call for `requestClose`
      requestClose();
    }
  };
  const [isActive, setIsActive] = useState(true);
  useEffect(() => ReactEditor.focus(editor), [editor, isActive]);
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
            <div ref={itemsRef} style={{ padding: config.space.S200 }}>
              {children}
            </div>
          </Scroll>
        </Menu>
      </FocusTrap>
    </BaseAutocompleteMenu>
  );
}
