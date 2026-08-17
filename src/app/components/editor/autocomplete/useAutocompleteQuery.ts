import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type {
  EditorAutocompleteQuery,
  ProseMirrorEditorController,
} from '../prosemirrorController';
import type { AutocompletePrefix } from './autocompleteQuery';

export function useAutocompleteQuery(editor: ProseMirrorEditorController) {
  const [query, setQuery] = useState<EditorAutocompleteQuery<AutocompletePrefix>>();
  const refocusEditor = useRef(false);

  useLayoutEffect(() => {
    if (query !== undefined || !refocusEditor.current) return;
    refocusEditor.current = false;
    editor.focus();
  }, [query, editor]);

  const close = useCallback(() => {
    if (query === undefined) return;
    refocusEditor.current = true;
    setQuery(undefined);
  }, [query]);

  return [query, setQuery, close] as const;
}
