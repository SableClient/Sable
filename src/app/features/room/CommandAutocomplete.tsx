import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import type { Editor } from 'slate';
import { Box, config, MenuItem, Text } from 'folds';
import type { Room } from '$types/matrix-sdk';
import type { Command } from '$hooks/useCommands';
import { useCommands } from '$hooks/useCommands';
import type { AutocompleteQuery } from '$components/editor';
import {
  AutocompleteMenu,
  createCommandElement,
  moveCursor,
  replaceWithElement,
} from '$components/editor';
import type { UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useKeyDown } from '$hooks/useKeyDown';
import { onTabPress } from '$utils/keyboard';

type CommandAutoCompleteHandler = (commandName: string) => void;

type CommandAutocompleteProps = {
  room: Room;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

export function CommandAutocomplete({
  room,
  editor,
  query,
  requestClose,
}: CommandAutocompleteProps) {
  const mx = useMatrixClient();
  const commands = useCommands(mx, room);
  const commandNames = useMemo(() => Object.keys(commands) as Command[], [commands]);

  const [result, search, resetSearch] = useAsyncSearch(
    commandNames,
    useCallback((commandName: string) => commandName, []),
    SEARCH_OPTIONS
  );

  const autoCompleteNames = result ? result.items : commandNames;

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: CommandAutoCompleteHandler = (commandName) => {
    const cmdEl = createCommandElement(commandName);
    replaceWithElement(editor, query.range, cmdEl);
    moveCursor(editor, true);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (autoCompleteNames.length === 0) {
        return;
      }
      const cmdName = autoCompleteNames[0]!;
      handleAutocomplete(cmdName);
    });
  });

  return autoCompleteNames.length === 0 ? null : (
    <AutocompleteMenu
      headerContent={
        <Box grow="Yes" direction="Row" gap="200" justifyContent="SpaceBetween">
          <Text size="L400">Commands</Text>
        </Box>
      }
      requestClose={requestClose}
      editor={editor}
    >
      {autoCompleteNames.map((commandName) => (
        <MenuItem
          key={commandName}
          as="button"
          radii="300"
          style={{ height: 'unset' }}
          onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
            onTabPress(evt, () => handleAutocomplete(commandName))
          }
          onClick={() => handleAutocomplete(commandName)}
        >
          <Box
            style={{ padding: `${config.space.S300} 0` }}
            grow="Yes"
            direction="Column"
            gap="100"
            justifyContent="SpaceBetween"
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              {`/${commandName}`}
            </Text>
            <Text truncate priority="300" size="T200">
              {commands[commandName].description}
            </Text>
          </Box>
        </MenuItem>
      ))}
    </AutocompleteMenu>
  );
}
