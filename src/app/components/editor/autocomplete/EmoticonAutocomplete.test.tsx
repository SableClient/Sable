import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IEmoji } from '$plugins/emoji';
import type {
  EditorAutocompleteQuery,
  ProseMirrorEditorController,
} from '../prosemirrorController';
import { EmoticonAutocomplete } from './EmoticonAutocomplete';

let searchResult: { items: IEmoji[] } | undefined;
const mocks = vi.hoisted(() => ({
  reset: vi.fn<() => void>(),
  search: vi.fn<(query: string) => void>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({ useMatrixClient: () => ({}) }));
vi.mock('$hooks/useMediaAuthentication', () => ({ useMediaAuthentication: () => false }));
vi.mock('$hooks/useImagePacks', () => ({ useRelevantImagePacks: () => [] }));
vi.mock('$hooks/useRecentEmoji', () => ({ useRecentEmoji: () => [] }));
vi.mock('$hooks/useAsyncSearch', () => ({
  useAsyncSearch: () => [searchResult, mocks.search, mocks.reset],
}));
vi.mock('$hooks/useKeyDown', () => ({ useKeyDown: () => undefined }));
vi.mock('$state/hooks/settings', () => ({ useSetting: () => [2] }));
vi.mock('$utils/matrix', () => ({ mxcUrlToHttp: () => undefined }));

const query: EditorAutocompleteQuery<string> = {
  from: 1,
  prefix: ':',
  text: 'zxy',
  to: 4,
};

const emoji = { shortcode: 'zxy-face', unicode: 'Z' } as IEmoji;

describe('EmoticonAutocomplete', () => {
  afterEach(() => {
    searchResult = undefined;
  });

  it('keeps the menu mounted while results change from none to matches', () => {
    searchResult = { items: [] };
    const requestClose = vi.fn<() => void>();
    const { rerender } = render(
      <EmoticonAutocomplete
        controller={{} as ProseMirrorEditorController}
        imagePackRooms={[]}
        query={query}
        requestClose={requestClose}
      />
    );
    const menu = document.querySelector('[data-autocomplete-menu]')!;

    expect(screen.getByText('No emojis found')).toBeInTheDocument();

    searchResult = { items: [emoji] };
    rerender(
      <EmoticonAutocomplete
        controller={{} as ProseMirrorEditorController}
        imagePackRooms={[]}
        query={{ ...query, text: 'zx' }}
        requestClose={requestClose}
      />
    );

    expect(menu).toBeInTheDocument();
    expect(screen.getByText(':zxy-face:')).toBeInTheDocument();
  });

  it('does not show the menu before the emoji threshold is reached', () => {
    render(
      <EmoticonAutocomplete
        controller={{} as ProseMirrorEditorController}
        imagePackRooms={[]}
        query={{ ...query, text: '' }}
        requestClose={vi.fn<() => void>()}
      />
    );

    expect(document.querySelector('[data-autocomplete-menu]')).not.toBeInTheDocument();
  });
});
