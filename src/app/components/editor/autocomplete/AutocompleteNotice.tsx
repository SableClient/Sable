import type { ReactNode } from 'react';
import { Header, Menu } from 'folds';
import { BaseAutocompleteMenu } from './BaseAutocompleteMenu';
import * as css from './AutocompleteMenu.css';

type AutocompleteNoticeProps = {
  children: ReactNode;
};
export function AutocompleteNotice({ children }: AutocompleteNoticeProps) {
  return (
    <BaseAutocompleteMenu>
      <Menu className={css.AutocompleteMenu}>
        <Header className={css.AutocompleteNotice} size="400">
          {children}
        </Header>
      </Menu>
    </BaseAutocompleteMenu>
  );
}
