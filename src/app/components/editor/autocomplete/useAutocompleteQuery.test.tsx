import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  EditorAutocompleteQuery,
  ProseMirrorEditorController,
} from '../prosemirrorController';
import { AutocompletePrefix } from './autocompleteQuery';
import { useAutocompleteQuery } from './useAutocompleteQuery';

const query: EditorAutocompleteQuery<AutocompletePrefix> = {
  prefix: AutocompletePrefix.Emoticon,
  text: 'smile',
  from: 0,
  to: 6,
};

const setup = () => {
  const events: string[] = [];
  const editor = {
    focus: () => events.push('focus'),
  } as unknown as ProseMirrorEditorController;

  function Harness() {
    const [autocompleteQuery, setAutocompleteQuery, closeAutocomplete] =
      useAutocompleteQuery(editor);
    return (
      <>
        <button type="button" onClick={() => setAutocompleteQuery(query)}>
          open
        </button>
        <button type="button" onClick={closeAutocomplete}>
          close
        </button>
        {autocompleteQuery && (
          <div
            ref={(node) => {
              if (!node) events.push('menu-unmount');
            }}
          />
        )}
      </>
    );
  }

  return { events, view: render(<Harness />) };
};

describe('useAutocompleteQuery', () => {
  it('focuses the editor only once the menu is unmounted', () => {
    const { events, view } = setup();

    fireEvent.click(view.getByText('open'));
    fireEvent.click(view.getByText('close'));

    expect(events).toEqual(['menu-unmount', 'focus']);
  });

  it('does not focus the editor when no menu is open', () => {
    const { events, view } = setup();

    fireEvent.click(view.getByText('close'));

    expect(events).toEqual([]);
  });
});
