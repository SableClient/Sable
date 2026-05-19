import type { KeyboardEvent as ReactKbEvent } from 'react';
import { useEffect } from 'react';
import { Avatar, Icon, Icons, MenuItem, Text } from 'folds';
import type { Room, RoomMember } from '$types/matrix-sdk';
import { useRoomMembers } from '$hooks/useRoomMembers';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { SearchItemStrGetter, UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useKeyDown } from '$hooks/useKeyDown';
import { getMxIdLocalPart } from '$utils/matrix';
import { getMemberDisplayName, getMemberSearchStr } from '$utils/room';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { KnownMembership } from '$types/matrix-sdk';
import { TiptapAutocompleteMenu } from './TiptapAutocompleteMenu';

const SEARCH_OPTIONS: UseAsyncSearchOptions = { limit: 1000, matchOptions: { contain: true } };
const mxIdToName = (id: string) => getMxIdLocalPart(id) ?? id;
const getSearchStr: SearchItemStrGetter<RoomMember> = (m, q) => getMemberSearchStr(m, q, mxIdToName);
const allowedMembership = (m: RoomMember) =>
  m.membership === KnownMembership.Join ||
  m.membership === KnownMembership.Invite ||
  m.membership === KnownMembership.Knock;

type Props = {
  room: Room;
  queryText: string;
  onSelect: (userId: string, displayName: string, highlight: boolean) => void;
  onClose: () => void;
};

export function TiptapMentionAutocomplete({ room, queryText, onSelect, onClose }: Props) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const roomAliasOrId = room.getCanonicalAlias() || room.roomId;
  const members = useRoomMembers(mx, room.roomId);

  const [result, search, resetSearch] = useAsyncSearch(members, getSearchStr, SEARCH_OPTIONS);
  const candidates = (result ? result.items.slice(0, 20) : members.slice(0, 20)).filter(
    allowedMembership
  );

  useEffect(() => {
    if (queryText) search(queryText);
    else resetSearch();
  }, [queryText, search, resetSearch]);

  function getName(member: RoomMember) {
    return (
      getMemberDisplayName(room, member.userId, nicknames) ??
      getMxIdLocalPart(member.userId) ??
      member.userId
    );
  }

  function handleSelect(userId: string, name: string) {
    const highlight = mx.getUserId() === userId || roomAliasOrId === userId;
    onSelect(userId, name, highlight);
    onClose();
  }

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (queryText === 'room') {
        handleSelect(roomAliasOrId, '@room');
        return;
      }
      if (candidates.length === 0) return;
      const first = candidates[0]!;
      handleSelect(first.userId, getName(first));
    });
  });

  return (
    <TiptapAutocompleteMenu headerContent={<Text size="L400">Mentions</Text>} onClose={onClose}>
      {queryText === 'room' && (
        <MenuItem
          as="button"
          radii="300"
          onKeyDown={(e: ReactKbEvent<HTMLButtonElement>) =>
            onTabPress(e, () => handleSelect(roomAliasOrId, '@room'))
          }
          onClick={() => handleSelect(roomAliasOrId, '@room')}
          before={
            <Avatar size="200">
              <Icon size="50" src={Icons.HashGlobe} filled />
            </Avatar>
          }
        >
          <Text size="B400">@room</Text>
        </MenuItem>
      )}
      {candidates.map((member) => {
        const name = getName(member);
        const avatarUrl = member.getMxcAvatarUrl()
          ? mx.mxcUrlToHttp(member.getMxcAvatarUrl()!, 32, 32, 'crop', undefined, false, useAuthentication) ?? undefined
          : undefined;
        return (
          <MenuItem
            key={member.userId}
            as="button"
            radii="300"
            onKeyDown={(e: ReactKbEvent<HTMLButtonElement>) =>
              onTabPress(e, () => handleSelect(member.userId, name))
            }
            onClick={() => handleSelect(member.userId, name)}
            after={
              <Text size="T200" priority="300" truncate>
                {member.userId}
              </Text>
            }
            before={
              <Avatar size="200">
                <UserAvatar
                  userId={member.userId}
                  src={avatarUrl}
                  alt={name}
                  renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                />
              </Avatar>
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              {name}
            </Text>
          </MenuItem>
        );
      })}
    </TiptapAutocompleteMenu>
  );
}
