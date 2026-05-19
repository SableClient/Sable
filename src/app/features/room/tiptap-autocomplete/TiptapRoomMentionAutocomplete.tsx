import type { KeyboardEvent as ReactKbEvent } from 'react';
import { useEffect, useMemo } from 'react';
import { Avatar, MenuItem, Text } from 'folds';
import type { Room } from '$types/matrix-sdk';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAsyncSearch, type UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useKeyDown } from '$hooks/useKeyDown';
import { allRoomsAtom } from '$state/room-list/roomList';
import { factoryRoomIdByActivity } from '$utils/sort';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';

import { TiptapAutocompleteMenu } from './TiptapAutocompleteMenu';

const SEARCH_OPTIONS: UseAsyncSearchOptions = { matchOptions: { contain: true } };

type Props = {
  queryText: string;
  onSelect: (roomId: string, roomAlias: string) => void;
  onClose: () => void;
};

export function TiptapRoomMentionAutocomplete({ queryText, onSelect, onClose }: Props) {
  const mx = useMatrixClient();
  const allRooms = useAtomValue(allRoomsAtom);

  const roomsWithAlias = useMemo(
    () =>
      allRooms
        .toSorted(factoryRoomIdByActivity(mx))
        .map((rId) => mx.getRoom(rId))
        .filter((r): r is Room => r !== null && r.getCanonicalAlias() !== null),
    [allRooms, mx]
  );

  const getSearchStr = (room: Room) => {
    const alias = room.getCanonicalAlias() ?? '';
    return `${room.name}${alias}`;
  };

  const [result, search, resetSearch] = useAsyncSearch(
    roomsWithAlias,
    getSearchStr,
    SEARCH_OPTIONS
  );
  const candidates = result ? result.items.slice(0, 20) : roomsWithAlias.slice(0, 20);

  useEffect(() => {
    if (queryText) search(queryText);
    else resetSearch();
  }, [queryText, search, resetSearch]);

  function handleSelect(room: Room) {
    const alias = room.getCanonicalAlias() ?? room.roomId;
    onSelect(room.roomId, alias);
    onClose();
  }

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (candidates.length === 0) return;
      handleSelect(candidates[0]!);
    });
  });

  return (
    <TiptapAutocompleteMenu headerContent={<Text size="L400">Rooms</Text>} onClose={onClose}>
      {candidates.map((room) => {
        const alias = room.getCanonicalAlias() ?? room.roomId;
        const avatarUrl = room.getMxcAvatarUrl()
          ? (mx.mxcUrlToHttp(room.getMxcAvatarUrl()!, 32, 32, 'crop') ?? undefined)
          : undefined;
        return (
          <MenuItem
            key={room.roomId}
            as="button"
            radii="300"
            onKeyDown={(e: ReactKbEvent<HTMLButtonElement>) =>
              onTabPress(e, () => handleSelect(room))
            }
            onClick={() => handleSelect(room)}
            after={
              <Text size="T200" priority="300" truncate>
                {alias}
              </Text>
            }
            before={
              <Avatar size="200">
                <RoomAvatar
                  roomId={room.roomId}
                  src={avatarUrl}
                  alt={room.name}
                  renderFallback={() => <RoomIcon size="50" joinRule={room.getJoinRule()} filled />}
                />
              </Avatar>
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              {room.name}
            </Text>
          </MenuItem>
        );
      })}
    </TiptapAutocompleteMenu>
  );
}
