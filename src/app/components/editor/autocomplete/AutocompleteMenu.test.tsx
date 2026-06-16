import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Editor } from 'slate';
import { vi } from 'vitest';

import { AutocompleteMenu } from './AutocompleteMenu';

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('slate-react', () => ({
  ReactEditor: {
    focus: vi.fn<() => void>(),
  },
}));

describe('AutocompleteMenu', () => {
  const editor = {} as Editor;

  it('marks the first item selected by default', () => {
    render(
      <AutocompleteMenu headerContent="Test" requestClose={vi.fn<() => void>()} editor={editor}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </AutocompleteMenu>
    );

    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute(
      'data-selected',
      'false'
    );
  });

  it('updates the selected item when autocomplete-navigate is dispatched', () => {
    const { container } = render(
      <AutocompleteMenu headerContent="Test" requestClose={vi.fn<() => void>()} editor={editor}>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </AutocompleteMenu>
    );

    const menu = container.querySelector('[data-autocomplete-menu]');
    expect(menu).not.toBeNull();

    menu!.dispatchEvent(new CustomEvent('autocomplete-navigate', { detail: { direction: 1 } }));

    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('data-selected', 'false');
  });
});
