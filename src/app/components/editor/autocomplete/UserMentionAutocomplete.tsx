import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, MenuItem, Text } from 'folds';
import { userFallbackIcon } from '$components/icons/phosphor';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';

import { useRoomMembers } from '$hooks/useRoomMembers';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { SearchItemStrGetter, UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import { onTabPress } from '$utils/keyboard';
import { useKeyDown } from '$hooks/useKeyDown';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getAvatarUrl, getMemberDisplayName, getMemberSearchStr } from '$utils/room/display';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';

import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { createMentionElement, mentionNameForUserAutocomplete } from '$components/editor/utils';
import { getMxIdServer } from '$utils/mxIdHelper';
import { AutocompleteMenu } from './AutocompleteMenu';
import type {
  EditorAutocompleteQuery,
  ProseMirrorEditorController,
} from '../prosemirrorController';
import { KnownMembership } from '$types/matrix-sdk';

type MentionAutoCompleteHandler = (userId: string, name: string) => void;
type UserDirectoryEntry = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
};

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
      onMouseDown={(evt: ReactMouseEvent<HTMLButtonElement>) => evt.preventDefault()}
      onClick={() => handleAutocomplete(userId, name)}
      before={
        <Avatar size="200">
          <UserAvatar userId={userId} renderFallback={() => userFallbackIcon('sm')} />
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
  controller: ProseMirrorEditorController;
  query: EditorAutocompleteQuery<string>;
  requestClose: () => void;
};

const withAllowedMembership = (member: RoomMember): boolean =>
  member.membership === KnownMembership.Join ||
  member.membership === KnownMembership.Invite ||
  member.membership === KnownMembership.Knock;

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  // The menu only displays 20 members; continuing to search reorders its visible results.
  limit: 20,
  matchOptions: {
    contain: true,
  },
};
const MAX_MENTION_RESULTS = 20;
const DIRECTORY_SEARCH_DELAY_MS = 200;

const mxIdToName = (mxId: string) => getMxIdLocalPart(mxId) ?? mxId;

export function UserMentionAutocomplete({
  room,
  controller,
  query,
  requestClose,
}: UserMentionAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const roomId: string = room.roomId;
  const roomAliasOrId = room.getCanonicalAlias() || roomId;
  const memberListComplete = room.membersLoaded();
  const members = useRoomMembers(mx, roomId);
  const mentionableMembers = useMemo(() => members.filter(withAllowedMembership), [members]);
  const [directoryResults, setDirectoryResults] = useState<UserDirectoryEntry[]>([]);

  const getRoomMemberStr = useCallback<SearchItemStrGetter<RoomMember>>(
    (m, searchQuery) => getMemberSearchStr(m, searchQuery, mxIdToName, nicknames),
    [nicknames]
  );

  const [result, search, resetSearch] = useAsyncSearch(
    mentionableMembers,
    getRoomMemberStr,
    SEARCH_OPTIONS
  );
  const autoCompleteMembers = result?.items ?? mentionableMembers.slice(0, MAX_MENTION_RESULTS);
  const directoryMatches = useMemo(() => {
    const memberIds = new Set(autoCompleteMembers.map((member) => member.userId));
    return directoryResults
      .filter((member) => !memberIds.has(member.userId))
      .slice(0, MAX_MENTION_RESULTS - autoCompleteMembers.length);
  }, [autoCompleteMembers, directoryResults]);

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  useEffect(() => {
    if (!query.text || query.text === 'room' || memberListComplete) {
      setDirectoryResults([]);
      return undefined;
    }

    let disposed = false;
    setDirectoryResults([]);
    const searchId = window.setTimeout(() => {
      void mx
        .searchUserDirectory({ term: query.text, limit: MAX_MENTION_RESULTS })
        .then(({ results }) => {
          if (disposed) return;
          setDirectoryResults(
            results.map(
              ({ user_id: userId, display_name: displayName, avatar_url: avatarUrl }) => ({
                userId,
                displayName,
                avatarUrl,
              })
            )
          );
        })
        .catch(() => {
          if (!disposed) setDirectoryResults([]);
        });
    }, DIRECTORY_SEARCH_DELAY_MS);

    return () => {
      disposed = true;
      window.clearTimeout(searchId);
    };
  }, [memberListComplete, mx, query.text]);

  const handleAutocomplete: MentionAutoCompleteHandler = (id, displayName) => {
    const isRoomPing = displayName === '@room';
    const isCurrentRoom = roomId === id || room.getCanonicalAlias() === id || roomAliasOrId === id;
    const mentionEl = createMentionElement(
      id,
      mentionNameForUserAutocomplete(id, displayName, { room, nicknames }),
      isRoomPing ? isCurrentRoom : mx.getUserId() === id || isCurrentRoom
    );
    controller.insertInline(mentionEl, query.from, query.to);
    controller.insertText(' ');
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
      if (autoCompleteMembers.length === 0 && directoryMatches.length === 0) {
        const userId = userIdFromQueryText(mx, query.text);
        handleAutocomplete(userId, userId);
        return;
      }
      const roomMember = autoCompleteMembers[0];
      if (roomMember) {
        handleAutocomplete(roomMember.userId, getName(roomMember));
        return;
      }
      const directoryMember = directoryMatches[0]!;
      handleAutocomplete(
        directoryMember.userId,
        directoryMember.displayName ??
          getMxIdLocalPart(directoryMember.userId) ??
          directoryMember.userId
      );
    });
  });

  return (
    <AutocompleteMenu headerContent={<Text size="L400">Mentions</Text>} requestClose={requestClose}>
      {query.text === 'room' && (
        <UnknownMentionItem
          userId={roomAliasOrId}
          name="@room"
          handleAutocomplete={handleAutocomplete}
        />
      )}
      {autoCompleteMembers.length === 0 && directoryMatches.length === 0 ? (
        <UnknownMentionItem
          userId={userIdFromQueryText(mx, query.text)}
          name={userIdFromQueryText(mx, query.text)}
          handleAutocomplete={handleAutocomplete}
        />
      ) : (
        <>
          {autoCompleteMembers.map((roomMember) => {
            const avatarMxcUrl = roomMember.getMxcAvatarUrl();
            const avatarUrl = getAvatarUrl(mx, avatarMxcUrl, 32, useAuthentication);
            return (
              <MenuItem
                key={roomMember.userId}
                as="button"
                radii="300"
                onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                  onTabPress(evt, () => handleAutocomplete(roomMember.userId, getName(roomMember)))
                }
                onMouseDown={(evt: ReactMouseEvent<HTMLButtonElement>) => evt.preventDefault()}
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
                      renderFallback={() => userFallbackIcon('sm')}
                    />
                  </Avatar>
                }
              >
                <Text style={{ flexGrow: 1 }} size="B400" truncate>
                  {getName(roomMember)}
                </Text>
              </MenuItem>
            );
          })}
          {directoryMatches.map((directoryMember) => {
            const name =
              directoryMember.displayName ??
              getMxIdLocalPart(directoryMember.userId) ??
              directoryMember.userId;
            const avatarUrl = getAvatarUrl(mx, directoryMember.avatarUrl, 32, useAuthentication);
            return (
              <MenuItem
                key={directoryMember.userId}
                as="button"
                radii="300"
                onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                  onTabPress(evt, () => handleAutocomplete(directoryMember.userId, name))
                }
                onMouseDown={(evt: ReactMouseEvent<HTMLButtonElement>) => evt.preventDefault()}
                onClick={() => handleAutocomplete(directoryMember.userId, name)}
                after={
                  <Text size="T200" priority="300" truncate>
                    {directoryMember.userId}
                  </Text>
                }
                before={
                  <Avatar size="200">
                    <UserAvatar
                      userId={directoryMember.userId}
                      src={avatarUrl ?? undefined}
                      alt={name}
                      renderFallback={() => userFallbackIcon('sm')}
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
        </>
      )}
    </AutocompleteMenu>
  );
}
