import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import type { Editor } from 'slate';
import { ReactEditor } from 'slate-react';
import { Avatar, Icon, Icons, MenuItem, Text } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';
import { JoinRule } from '$types/matrix-sdk';
import { useAtomValue } from 'jotai';

import { getDirectRoomAvatarUrl } from '$utils/room';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { isRoomAlias } from '$utils/matrix';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import type { UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useKeyDown } from '$hooks/useKeyDown';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { factoryRoomIdByActivity } from '$utils/sort';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { getViaServers } from '$plugins/via-servers';
import { createMentionElement, moveCursor, replaceWithElement } from '$components/editor/utils';
import { getMxIdServer } from '$utils/mxIdHelper';
import { AutocompleteMenu } from './AutocompleteMenu';
import type { AutocompleteQuery } from './autocompleteQuery';

type MentionAutoCompleteHandler = (roomAliasOrId: string, name: string) => void;

const roomAliasFromQueryText = (mx: MatrixClient, text: string) =>
  isRoomAlias(`#${text}`)
    ? `#${text}`
    : `#${text}${text.endsWith(':') ? '' : ':'}${getMxIdServer(mx.getUserId() ?? '')}`;

function UnknownRoomMentionItem({
  query,
  handleAutocomplete,
}: {
  query: AutocompleteQuery<string>;
  handleAutocomplete: MentionAutoCompleteHandler;
}) {
  const mx = useMatrixClient();
  const roomAlias: string = roomAliasFromQueryText(mx, query.text);

  const handleSelect = () => handleAutocomplete(roomAlias, roomAlias);

  return (
    <MenuItem
      as="button"
      radii="300"
      onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) => onTabPress(evt, handleSelect)}
      onClick={handleSelect}
      before={
        <Avatar size="200">
          <Icon src={Icons.Hash} size="100" />
        </Avatar>
      }
    >
      <Text style={{ flexGrow: 1 }} size="B400">
        {roomAlias}
      </Text>
    </MenuItem>
  );
}

type RoomMentionAutocompleteProps = {
  roomId: string;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

export function RoomMentionAutocomplete({
  roomId,
  editor,
  query,
  requestClose,
}: RoomMentionAutocompleteProps) {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);

  const allRoomsFromAtom = useAtomValue(allRoomsAtom);
  const allRooms = useMemo(
    () => allRoomsFromAtom.toSorted(factoryRoomIdByActivity(mx)),
    [allRoomsFromAtom, mx]
  );

  const [result, search, resetSearch] = useAsyncSearch(
    allRooms,
    useCallback(
      (rId) => {
        const r = mx.getRoom(rId);
        if (!r) return 'Unknown Room';
        const alias = r.getCanonicalAlias();
        if (alias) return [r.name, alias];
        return r.name;
      },
      [mx]
    ),
    SEARCH_OPTIONS
  );

  const autoCompleteRoomIds = result ? result.items.slice(0, 20) : allRooms.slice(0, 20);

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: MentionAutoCompleteHandler = (roomAliasOrId, name) => {
    const mentionRoom = mx.getRoom(roomAliasOrId);
    const viaServers = mentionRoom ? getViaServers(mentionRoom) : undefined;
    const mentionEl = createMentionElement(
      roomAliasOrId,
      name.startsWith('#') ? name : `#${name}`,
      roomId === roomAliasOrId || mx.getRoom(roomId)?.getCanonicalAlias() === roomAliasOrId,
      undefined,
      viaServers
    );
    replaceWithElement(editor, query.range, mentionEl);
    moveCursor(editor, true);
    ReactEditor.focus(editor);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (autoCompleteRoomIds.length === 0) {
        const alias = roomAliasFromQueryText(mx, query.text);
        handleAutocomplete(alias, alias);
        return;
      }
      const rId = autoCompleteRoomIds[0];
      const r = mx.getRoom(rId);
      const name = r?.name ?? rId;
      handleAutocomplete(r?.getCanonicalAlias() ?? rId ?? '', name as string);
    });
  });

  return (
    <AutocompleteMenu
      headerContent={<Text size="L400">Rooms</Text>}
      requestClose={requestClose}
      editor={editor}
    >
      {autoCompleteRoomIds.length === 0 ? (
        <UnknownRoomMentionItem query={query} handleAutocomplete={handleAutocomplete} />
      ) : (
        autoCompleteRoomIds.map((rId) => {
          const room = mx.getRoom(rId);
          if (!room) return null;
          const dm = mDirects.has(room.roomId);

          const handleSelect = () => handleAutocomplete(room.getCanonicalAlias() ?? rId, room.name);

          return (
            <MenuItem
              key={rId}
              as="button"
              radii="300"
              onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                onTabPress(evt, handleSelect)
              }
              onClick={handleSelect}
              after={
                <Text size="T200" priority="300" truncate>
                  {room.getCanonicalAlias() ?? ''}
                </Text>
              }
              before={
                <Avatar size="200">
                  {dm ? (
                    <RoomAvatar
                      roomId={room.roomId}
                      src={getDirectRoomAvatarUrl(mx, room)}
                      alt={room.name}
                      renderFallback={() => (
                        <RoomIcon
                          size="50"
                          joinRule={room.getJoinRule() ?? JoinRule.Restricted}
                          roomType={room.getType()}
                          filled
                        />
                      )}
                    />
                  ) : (
                    <RoomIcon size="100" joinRule={room.getJoinRule()} roomType={room.getType()} />
                  )}
                </Avatar>
              }
            >
              <Text style={{ flexGrow: 1 }} size="B400" truncate>
                {room.name}
              </Text>
            </MenuItem>
          );
        })
      )}
    </AutocompleteMenu>
  );
}
