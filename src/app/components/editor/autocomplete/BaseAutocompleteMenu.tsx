import { ReactNode } from 'react';
import * as css from './AutocompleteMenu.css';

type BaseAutocompleteMenuProps = {
  children: ReactNode;
};
export function BaseAutocompleteMenu({ children }: BaseAutocompleteMenuProps) {
  return (
    <div className={css.AutocompleteMenuBase}>
      <div className={css.AutocompleteMenuContainer} data-autocomplete-menu="true">
        {children}
      </div>
    </div>
  );
}
