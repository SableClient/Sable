import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect } from 'react';
import type { Editor } from 'slate';
import { ReactEditor } from 'slate-react';
import { Avatar, Icon, Icons, MenuItem, Text } from 'folds';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';

import { useRoomMembers } from '$hooks/useRoomMembers';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { SearchItemStrGetter, UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useKeyDown } from '$hooks/useKeyDown';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getMemberDisplayName, getMemberSearchStr } from '$utils/room';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';

import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { createMentionElement, moveCursor, replaceWithElement } from '$components/editor/utils';
import { getMxIdServer } from '$utils/mxIdHelper';
import { AutocompleteMenu } from './AutocompleteMenu';
import type { AutocompleteQuery } from './autocompleteQuery';
import { KnownMembership } from '$types/matrix-sdk';

type MentionAutoCompleteHandler = (userId: string, name: string) => void;

const userIdFromQueryText = (mx: MatrixClient, text: string) =>
  isUserId(`@${text}`)
    ? `@${text}`
    : `@${text}${text.endsWith(':') ? '' : ':'}${getMxIdServer(mx.getUserId() ?? '')}`;

function UnknownMentionItem({
  userId,
  name,
  handleAutocomplete,
}: {
  userId: string;
  name: string;
  handleAutocomplete: MentionAutoCompleteHandler;
}) {
  return (
    <MenuItem
      as="button"
      radii="300"
      onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
        onTabPress(evt, () => handleAutocomplete(userId, name))
      }
      onClick={() => handleAutocomplete(userId, name)}
      before={
        <Avatar size="200">
          <UserAvatar
            userId={userId}
            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
          />
        </Avatar>
      }
    >
      <Text style={{ flexGrow: 1 }} size="B400">
        {name}
      </Text>
    </MenuItem>
  );
}

type UserMentionAutocompleteProps = {
  room: Room;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const withAllowedMembership = (member: RoomMember): boolean =>
  member.membership === KnownMembership.Join ||
  member.membership === KnownMembership.Invite ||
  member.membership === KnownMembership.Knock;

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const mxIdToName = (mxId: string) => getMxIdLocalPart(mxId) ?? mxId;
const getRoomMemberStr: SearchItemStrGetter<RoomMember> = (m, query) =>
  getMemberSearchStr(m, query, mxIdToName);

export function UserMentionAutocomplete({
  room,
  editor,
  query,
  requestClose,
}: UserMentionAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const roomId: string = room.roomId;
  const roomAliasOrId = room.getCanonicalAlias() || roomId;
  const members = useRoomMembers(mx, roomId);

  const [result, search, resetSearch] = useAsyncSearch(members, getRoomMemberStr, SEARCH_OPTIONS);
  const autoCompleteMembers = (result ? result.items.slice(0, 20) : members.slice(0, 20)).filter(
    withAllowedMembership
  );

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: MentionAutoCompleteHandler = (uId, name) => {
    const mentionEl = createMentionElement(
      uId,
      name.startsWith('@') ? name : `@${name}`,
      mx.getUserId() === uId || roomAliasOrId === uId
    );
    replaceWithElement(editor, query.range, mentionEl);
    moveCursor(editor, true);
    ReactEditor.focus(editor);
    requestClose();
  };

  function getName(member: RoomMember) {
    return (
      getMemberDisplayName(room, member.userId, nicknames) ??
      getMxIdLocalPart(member.userId) ??
      member.userId
    );
  }

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (query.text === 'room') {
        handleAutocomplete(roomAliasOrId, '@room');
        return;
      }
      if (autoCompleteMembers.length === 0) {
        const userId = userIdFromQueryText(mx, query.text);
        handleAutocomplete(userId, userId);
        return;
      }
      const roomMember = autoCompleteMembers[0]!;
      handleAutocomplete(roomMember.userId, getName(roomMember));
    });
  });

  return (
    <AutocompleteMenu
      headerContent={<Text size="L400">Mentions</Text>}
      requestClose={requestClose}
      editor={editor}
    >
      {query.text === 'room' && (
        <UnknownMentionItem
          userId={roomAliasOrId}
          name="@room"
          handleAutocomplete={handleAutocomplete}
        />
      )}
      {autoCompleteMembers.length === 0 ? (
        <UnknownMentionItem
          userId={userIdFromQueryText(mx, query.text)}
          name={userIdFromQueryText(mx, query.text)}
          handleAutocomplete={handleAutocomplete}
        />
      ) : (
        autoCompleteMembers.map((roomMember) => {
          const avatarMxcUrl = roomMember.getMxcAvatarUrl();
          const avatarUrl = avatarMxcUrl
            ? mx.mxcUrlToHttp(avatarMxcUrl, 32, 32, 'crop', undefined, false, useAuthentication)
            : undefined;
          return (
            <MenuItem
              key={roomMember.userId}
              as="button"
              radii="300"
              onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                onTabPress(evt, () => handleAutocomplete(roomMember.userId, getName(roomMember)))
              }
              onClick={() => handleAutocomplete(roomMember.userId, getName(roomMember))}
              after={
                <Text size="T200" priority="300" truncate>
                  {roomMember.userId}
                </Text>
              }
              before={
                <Avatar size="200">
                  <UserAvatar
                    userId={roomMember.userId}
                    src={avatarUrl ?? undefined}
                    alt={getName(roomMember)}
                    renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                  />
                </Avatar>
              }
            >
              <Text style={{ flexGrow: 1 }} size="B400" truncate>
                {getName(roomMember)}
              </Text>
            </MenuItem>
          );
        })
      )}
    </AutocompleteMenu>
  );
}
