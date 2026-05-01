import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo } from 'react';
import type { Editor } from 'slate';
import { ReactEditor } from 'slate-react';
import { Box, MenuItem, Text, toRem } from 'folds';
import type { Room } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import type { UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { useRelevantImagePacks } from '$hooks/useImagePacks';
import type { IEmoji } from '$plugins/emoji';
import { emojis } from '$plugins/emoji';
import { useKeyDown } from '$hooks/useKeyDown';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { PackImageReader } from '$plugins/custom-emoji';
import { ImageUsage } from '$plugins/custom-emoji';
import { getEmoticonSearchStr } from '$plugins/utils';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { createEmoticonElement, moveCursor, replaceWithElement } from '$components/editor/utils';
import { AutocompleteMenu } from './AutocompleteMenu';
import type { AutocompleteQuery } from './autocompleteQuery';

type EmoticonCompleteHandler = (key: string, shortcode: string) => void;

type EmoticonSearchItem = PackImageReader | IEmoji;

type EmoticonAutocompleteProps = {
  title?: string;
  imagePackRooms: Room[];
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
  // this allows you to override the default behaviour of inserting the selection
  // used to implement the +: reaction shortcut
  onEmoticonSelected?: EmoticonCompleteHandler;
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

export function EmoticonAutocomplete({
  title,
  imagePackRooms,
  editor,
  query,
  requestClose,
  onEmoticonSelected,
}: EmoticonAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const imagePacks = useRelevantImagePacks(ImageUsage.Emoticon, imagePackRooms);
  const recentEmoji = useRecentEmoji(mx, 20);

  const [emojiThreshold] = useSetting(settingsAtom, 'emojiSuggestThreshold');

  const searchList = useMemo<Array<EmoticonSearchItem>>(
    () => [...imagePacks.flatMap((pack) => pack.getImages(ImageUsage.Emoticon)), ...emojis],
    [imagePacks]
  );

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );
  const autoCompleteEmoticon = useMemo(() => {
    if (query.text.length < emojiThreshold) {
      return [];
    }
    return result ? result.items.slice(0, 20) : recentEmoji;
  }, [query.text.length, emojiThreshold, result, recentEmoji]);

  useEffect(() => {
    if (query.text && query.text.length >= emojiThreshold) {
      search(query.text);
    } else {
      resetSearch();
    }
  }, [query.text, search, resetSearch, emojiThreshold]);

  const handleAutocomplete: EmoticonCompleteHandler =
    onEmoticonSelected ??
    ((key, shortcode) => {
      const emoticonEl = createEmoticonElement(key, shortcode);
      replaceWithElement(editor, query.range, emoticonEl);
      moveCursor(editor, true);
      ReactEditor.focus(editor);
      requestClose();
    });

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (autoCompleteEmoticon.length === 0) return;
      const emoticon = autoCompleteEmoticon[0]!;
      const key = 'url' in emoticon ? emoticon.url : emoticon.unicode;
      handleAutocomplete(key, emoticon.shortcode);
    });
  });

  return autoCompleteEmoticon.length === 0 ? null : (
    <AutocompleteMenu
      headerContent={<Text size="L400">{title ?? 'Emojis'}</Text>}
      requestClose={requestClose}
      editor={editor}
    >
      {autoCompleteEmoticon.map((emoticon) => {
        const isCustomEmoji = 'url' in emoticon;
        const key = isCustomEmoji ? emoticon.url : emoticon.unicode;
        const customEmojiUrl = mxcUrlToHttp(mx, key, useAuthentication);

        return (
          <MenuItem
            key={emoticon.shortcode + key}
            as="button"
            radii="300"
            onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
              onTabPress(evt, () => handleAutocomplete(key, emoticon.shortcode))
            }
            onClick={() => handleAutocomplete(key, emoticon.shortcode)}
            before={
              isCustomEmoji && customEmojiUrl ? (
                <Box
                  shrink="No"
                  as="img"
                  src={customEmojiUrl}
                  alt={emoticon.shortcode}
                  style={{
                    width: toRem(24),
                    height: toRem(24),
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <Box
                  shrink="No"
                  as="span"
                  display="InlineFlex"
                  style={{ fontSize: toRem(24), lineHeight: toRem(24) }}
                >
                  {key}
                </Box>
              )
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              :{emoticon.shortcode}:
            </Text>
          </MenuItem>
        );
      })}
    </AutocompleteMenu>
  );
}
