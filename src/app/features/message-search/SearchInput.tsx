import type { FormEventHandler, RefObject } from 'react';
import { Box, Text, Input, Spinner, Chip, config } from 'folds';
import { sizedIcon, MagnifyingGlass, X } from '$components/icons/phosphor';

type SearchProps = {
  active?: boolean;
  loading?: boolean;
  searchInputRef: RefObject<HTMLInputElement>;
  onSearch: (term: string) => void;
  onReset: () => void;
};
export function SearchInput({ active, loading, searchInputRef, onSearch, onReset }: SearchProps) {
  const handleSearchSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const { searchInput } = evt.target as HTMLFormElement & {
      searchInput: HTMLInputElement;
    };

    const searchTerm = searchInput.value.trim() || undefined;
    if (searchTerm) {
      onSearch(searchTerm);
    }
  };

  return (
    <Box as="form" direction="Column" gap="100" onSubmit={handleSearchSubmit}>
      <span data-spacing-node />
      <Text size="L400">Search</Text>
      <Input
        ref={searchInputRef}
        style={{ paddingRight: config.space.S300 }}
        name="searchInput"
        autoFocus
        size="500"
        variant="Background"
        placeholder="Search for keyword"
        autoComplete="off"
        before={
          active && loading ? (
            <Spinner variant="Secondary" size="200" />
          ) : (
            sizedIcon(MagnifyingGlass, '200')
          )
        }
        after={
          active ? (
            <Chip
              key="resetButton"
              type="reset"
              variant="Secondary"
              size="400"
              radii="Pill"
              outlined
              after={sizedIcon(X, '50')}
              onClick={onReset}
            >
              <Text size="B300">Clear</Text>
            </Chip>
          ) : (
            <Chip type="submit" variant="Primary" size="400" radii="Pill" outlined>
              <Text size="B300">Enter</Text>
            </Chip>
          )
        }
      />
    </Box>
  );
}
