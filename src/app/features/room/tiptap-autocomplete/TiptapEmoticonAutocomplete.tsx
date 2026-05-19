import type { KeyboardEvent as ReactKbEvent } from 'react';
import { useEffect, useMemo } from 'react';
import { Box, MenuItem, Text, toRem } from 'folds';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAsyncSearch, type UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useKeyDown } from '$hooks/useKeyDown';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { useRelevantImagePacks } from '$hooks/useImagePacks';
import type { IEmoji } from '$plugins/emoji';
import { emojis } from '$plugins/emoji';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { PackImageReader } from '$plugins/custom-emoji';
import { ImageUsage } from '$plugins/custom-emoji';
import { getEmoticonSearchStr } from '$plugins/utils';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { TiptapAutocompleteMenu } from './TiptapAutocompleteMenu';

type EmoticonItem = PackImageReader | IEmoji;
const SEARCH_OPTIONS: UseAsyncSearchOptions = { matchOptions: { contain: true } };

type Props = {
  imagePackRooms: Room[];
  useAuthentication: boolean;
  queryText: string;
  onSelect: (key: string, shortcode: string) => void;
  onClose: () => void;
};

export function TiptapEmoticonAutocomplete({
  imagePackRooms,
  useAuthentication,
  queryText,
  onSelect,
  onClose,
}: Props) {
  const mx = useMatrixClient();
  const imagePacks = useRelevantImagePacks(ImageUsage.Emoticon, imagePackRooms);
  const recentEmoji = useRecentEmoji(mx, 20);
  const [emojiThreshold] = useSetting(settingsAtom, 'emojiSuggestThreshold');

  const searchList = useMemo<Array<EmoticonItem>>(
    () => [...imagePacks.flatMap((p) => p.getImages(ImageUsage.Emoticon)), ...emojis],
    [imagePacks]
  );

  const [result, search, resetSearch] = useAsyncSearch(searchList, getEmoticonSearchStr, SEARCH_OPTIONS);

  const candidates = useMemo(() => {
    if (queryText.length < emojiThreshold) return [];
    return result ? result.items.slice(0, 20) : recentEmoji;
  }, [queryText.length, emojiThreshold, result, recentEmoji]);

  useEffect(() => {
    if (queryText) search(queryText);
    else resetSearch();
  }, [queryText, search, resetSearch]);

  function getKey(item: EmoticonItem): string {
    return 'url' in item ? (item as PackImageReader).url : (item as IEmoji).unicode;
  }

  function getShortcode(item: EmoticonItem): string {
    return 'shortcode' in item ? (item as PackImageReader).shortcode : (item as IEmoji).shortcode;
  }

  function handleSelect(item: EmoticonItem) {
    const key = getKey(item);
    const shortcode = getShortcode(item);
    onSelect(key, shortcode);
    onClose();
  }

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (candidates.length === 0) return;
      handleSelect(candidates[0]!);
    });
  });

  return (
    <TiptapAutocompleteMenu headerContent={<Text size="L400">Emoticons</Text>} onClose={onClose}>
      {candidates.length === 0 && (
        <Text size="T300" style={{ padding: '4px 8px', opacity: 0.7 }}>
          Type at least {emojiThreshold} character{emojiThreshold > 1 ? 's' : ''} to search
        </Text>
      )}
      {candidates.map((item) => {
        const key = getKey(item);
        const shortcode = getShortcode(item);
        const isMxc = key.startsWith('mxc://');
        const imgSrc = isMxc
          ? mxcUrlToHttp(mx, key, useAuthentication) ?? key
          : undefined;
        return (
          <MenuItem
            key={key}
            as="button"
            radii="300"
            onKeyDown={(e: ReactKbEvent<HTMLButtonElement>) => onTabPress(e, () => handleSelect(item))}
            onClick={() => handleSelect(item)}
            before={
              isMxc ? (
                <img
                  src={imgSrc}
                  alt={shortcode}
                  style={{ height: toRem(20), width: 'auto', verticalAlign: 'middle' }}
                />
              ) : (
                <span style={{ fontSize: toRem(20) }}>{key}</span>
              )
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400">
              :{shortcode}:
            </Text>
          </MenuItem>
        );
      })}
    </TiptapAutocompleteMenu>
  );
}
