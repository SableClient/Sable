import type { ChangeEventHandler } from 'react';
import { useRef } from 'react';
import { Input, Chip, Text } from 'folds';
import { isMobileOrTablet } from '$utils/platform';
import { ArrowRight, sizedIcon, MagnifyingGlass } from '$components/icons/phosphor';
import { useClientConfig } from '$hooks/useClientConfig';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getGifProvider } from '$utils/gifProviders';
import { EmojiBoardTab } from '../types';

type SearchInputProps = {
  query?: string;
  defaultValue?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  allowTextCustomEmoji?: boolean;
  onTextCustomEmojiSelect?: (text: string) => void;
  tab?: EmojiBoardTab;
};
export function SearchInput({
  query,
  defaultValue,
  onChange,
  allowTextCustomEmoji,
  onTextCustomEmojiSelect,
  tab,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clientConfig = useClientConfig();
  const [gifProviderSetting] = useSetting(settingsAtom, 'gifProvider');
  const gifProvider = getGifProvider(clientConfig.gifs, gifProviderSetting);

  const handleReact = () => {
    const textEmoji = inputRef.current?.value.trim();
    if (!textEmoji) return;
    onTextCustomEmojiSelect?.(textEmoji);
  };

  return (
    <Input
      ref={inputRef}
      variant="SurfaceVariant"
      size="400"
      placeholder={
        tab === EmojiBoardTab.Gif
          ? `Search ${gifProvider.label}`
          : allowTextCustomEmoji
            ? 'Search or Text Reaction '
            : 'Search'
      }
      maxLength={50}
      defaultValue={defaultValue}
      after={
        allowTextCustomEmoji && query && tab !== EmojiBoardTab.Gif ? (
          <Chip
            variant="Primary"
            radii="Pill"
            after={sizedIcon(ArrowRight, '50')}
            outlined
            onClick={handleReact}
          >
            <Text size="L400">React</Text>
          </Chip>
        ) : (
          sizedIcon(MagnifyingGlass, '50')
        )
      }
      onChange={onChange}
      autoFocus={!isMobileOrTablet()}
    />
  );
}
