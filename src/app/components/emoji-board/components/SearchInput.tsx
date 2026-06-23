import type { ChangeEventHandler } from 'react';
import { useRef } from 'react';
import { Input, Chip, Text } from 'folds';
import { mobileOrTablet } from '$utils/user-agent';
import { ArrowRight, sizedIcon, MagnifyingGlass } from '$components/icons/phosphor';
import { EmojiBoardTab } from '../types';

type SearchInputProps = {
  query?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  allowTextCustomEmoji?: boolean;
  onTextCustomEmojiSelect?: (text: string) => void;
  tab?: EmojiBoardTab;
};
export function SearchInput({
  query,
  onChange,
  allowTextCustomEmoji,
  onTextCustomEmojiSelect,
  tab,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
          ? 'Search KLIPY'
          : allowTextCustomEmoji
            ? 'Search or Text Reaction '
            : 'Search'
      }
      maxLength={50}
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
      autoFocus={!mobileOrTablet()}
    />
  );
}
