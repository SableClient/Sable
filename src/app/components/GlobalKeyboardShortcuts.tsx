/**
 * Global keyboard shortcuts for navigation and accessibility.
 *
 * Shortcuts provided:
 *   Alt+N              — jump to the highest-priority unread room
 *   Alt+Shift+Down     — cycle forward through unread rooms
 *   Alt+Shift+Up       — cycle backward through unread rooms
 *   Ctrl+Down / Ctrl+Up: cycle through messages to reply to
 */
import { useCallback, useRef } from 'react';
import { useNavigate, useLocation, matchPath } from 'react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { mDirectAtom } from '$state/mDirectList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useKeyDown } from '$hooks/useKeyDown';
import {
  getDirectRoomPath,
  getDirectForumPath,
  getCreateRoomPath,
  getHomeForumPath,
  getHomeRoomPath,
  getHomeSearchPath,
  getInboxBookmarksPath,
  getNavigatePath,
  getSpaceRoomPath,
  getSpaceForumPath,
  getSpaceSearchPath,
  withSearchParam,
} from '$pages/pathUtils';
import type { SearchPathSearchParams } from '$pages/paths';
import {
  DIRECT_ROOM_FORUM_PATH,
  DIRECT_ROOM_PATH,
  HOME_ROOM_FORUM_PATH,
  HOME_ROOM_PATH,
  SPACE_ROOM_FORUM_PATH,
  SPACE_ROOM_PATH,
} from '$pages/paths';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import { announce } from '$utils/announce';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import type { Room } from '$types/matrix-sdk';
import { useSelectedSpace } from '$hooks/router/useSelectedSpace';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { CustomRoomType } from '$types/matrix/room';
import { useOpenShallowRoute } from '$pages/client/useShallowRoute';
import { matchesShortcut } from '../keyboard/shortcuts';

export function GlobalKeyboardShortcuts() {
  const [shortcutOverrides] = useSetting(settingsAtom, 'shortcutOverrides');
  const navigate = useNavigate();
  const openShallowRoute = useOpenShallowRoute();
  const location = useLocation();
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const unreadIndexRef = useRef(0);

  // Derive the current room ID from the URL so we know which room is active.
  const roomMatch =
    matchPath(HOME_ROOM_FORUM_PATH, location.pathname) ??
    matchPath(DIRECT_ROOM_FORUM_PATH, location.pathname) ??
    matchPath(SPACE_ROOM_FORUM_PATH, location.pathname) ??
    matchPath(HOME_ROOM_PATH, location.pathname) ??
    matchPath(DIRECT_ROOM_PATH, location.pathname) ??
    matchPath(SPACE_ROOM_PATH, location.pathname);
  const roomIdOrAlias = roomMatch?.params.roomIdOrAlias
    ? decodeURIComponent(roomMatch.params.roomIdOrAlias)
    : undefined;
  const currentSpace = useSelectedSpace();
  let currentRoom: Room | null = null;

  if (roomIdOrAlias) {
    if (roomIdOrAlias.startsWith('!')) {
      currentRoom = mx.getRoom(roomIdOrAlias);
    } else {
      currentRoom = mx.getRooms().find((r) => r.getCanonicalAlias() === roomIdOrAlias) ?? null;
    }
  }
  const replyDraftAtomFamily = roomIdToReplyDraftAtomFamily(currentRoom?.roomId ?? '');
  const replyDraft = useAtomValue(replyDraftAtomFamily);
  const setReplyDraft = useSetAtom(replyDraftAtomFamily);

  /** Navigate to a room by ID and announce it to screen readers. */
  const navigateToRoom = useCallback(
    (roomId: string, remaining: number) => {
      const roomIdOrAliasToNav = getCanonicalAliasOrRoomId(mx, roomId);
      const isDirect = mDirects.has(roomId);
      const isForum = mx.getRoom(roomId)?.getType() === CustomRoomType.Forum;
      if (isDirect) {
        navigate(
          isForum ? getDirectForumPath(roomIdOrAliasToNav) : getDirectRoomPath(roomIdOrAliasToNav)
        );
      } else {
        const parents = roomToParents.get(roomId);
        if (parents && parents.size > 0) {
          const spaceId = Array.from(parents)[0];
          if (!spaceId) {
            navigate(
              isForum ? getHomeForumPath(roomIdOrAliasToNav) : getHomeRoomPath(roomIdOrAliasToNav)
            );
            return;
          }
          const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, spaceId);
          navigate(
            isForum
              ? getSpaceForumPath(spaceIdOrAlias, roomIdOrAliasToNav)
              : getSpaceRoomPath(spaceIdOrAlias, roomIdOrAliasToNav)
          );
        } else {
          navigate(
            isForum ? getHomeForumPath(roomIdOrAliasToNav) : getHomeRoomPath(roomIdOrAliasToNav)
          );
        }
      }
      const roomName = mx.getRoom(roomId)?.name ?? 'Room';
      const roomType = isDirect ? 'Direct Message' : 'Group Room';
      announce(`${roomName}, ${roomType}. ${remaining} room${remaining === 1 ? '' : 's'} unread.`);
    },
    [mx, mDirects, roomToParents, navigate]
  );

  /** Alt+N: jump to the top-priority unread room and reset the cycle index. */
  const handleNextUnreadKeyDown = useCallback(
    (evt: KeyboardEvent) => {
      if (!matchesShortcut('navigation.nextUnread', evt, shortcutOverrides)) return;
      const unreadEntries = Array.from(roomToUnread.entries())
        .filter(([id, u]) => u.total > 0 && id !== currentRoom?.roomId)
        .toSorted((a, b) => b[1].highlight - a[1].highlight || b[1].total - a[1].total);
      if (unreadEntries.length === 0) return;
      evt.preventDefault();
      unreadIndexRef.current = 0;
      const [roomId] = unreadEntries[0]!;
      navigateToRoom(roomId, unreadEntries.length - 1);
    },
    [roomToUnread, currentRoom?.roomId, navigateToRoom, shortcutOverrides]
  );

  /** Alt+Shift+Down / Alt+Shift+Up: cycle through unread rooms. */
  const handleUnreadNavKeyDown = useCallback(
    (evt: KeyboardEvent) => {
      const isDown = matchesShortcut('navigation.cycleNextUnread', evt, shortcutOverrides);
      const isUp = matchesShortcut('navigation.cyclePreviousUnread', evt, shortcutOverrides);
      if (!isDown && !isUp) return;
      const unreadEntries = Array.from(roomToUnread.entries())
        .filter(([, u]) => u.total > 0)
        .toSorted((a, b) => b[1].highlight - a[1].highlight || b[1].total - a[1].total);
      if (unreadEntries.length === 0) return;
      evt.preventDefault();
      if (isDown) {
        unreadIndexRef.current = (unreadIndexRef.current + 1) % unreadEntries.length;
      } else {
        unreadIndexRef.current =
          (unreadIndexRef.current - 1 + unreadEntries.length) % unreadEntries.length;
      }
      const currentEntry = unreadEntries[unreadIndexRef.current];
      if (!currentEntry) return;
      const [roomId] = currentEntry;
      navigateToRoom(roomId, unreadEntries.length - 1);
    },
    [roomToUnread, navigateToRoom, shortcutOverrides]
  );

  /** Ctrl+Down / Ctrl+Up: cycle through messages to reply to. */
  const handleReplyKeyDown = useCallback(
    (evt: KeyboardEvent) => {
      const isDown = matchesShortcut('navigation.nextReply', evt, shortcutOverrides);
      const isUp = matchesShortcut('navigation.previousReply', evt, shortcutOverrides);
      if (currentRoom === null) return;
      if (!isDown && !isUp) return;

      const events = currentRoom.getUnfilteredTimelineSet().getLiveTimeline().getEvents();

      // when no message is currently targeted, just target the first one
      if (replyDraft?.eventId === undefined) {
        const latestEvent = events.at(-1);
        if (latestEvent === undefined) return;
        const eventId = latestEvent.event.event_id;
        if (eventId === undefined) return;
        setReplyDraft({ userId: currentRoom.myUserId, eventId, body: '' });
        return;
      }
      const currentReplyIndex = events.findIndex((e) => e.event.event_id === replyDraft.eventId);
      if (currentReplyIndex === events.length - 1 && isDown) return; // you cant go further down than that idiot
      const newTargetEvent = isUp ? events[currentReplyIndex - 1] : events[currentReplyIndex + 1];
      if (!newTargetEvent) return;
      const eventId = newTargetEvent.event.event_id;
      if (eventId === undefined) return;
      setReplyDraft({ userId: currentRoom.myUserId, eventId, body: '' });
    },
    [currentRoom, replyDraft, setReplyDraft, shortcutOverrides]
  );

  const handleBookmarkKeyDown = useCallback(
    (evt: KeyboardEvent) => {
      if (!matchesShortcut('app.openBookmarks', evt, shortcutOverrides)) return;
      evt.preventDefault();

      navigate(getInboxBookmarksPath());
      announce(`Navigated to bookmarks`);
    },
    [navigate, shortcutOverrides]
  );

  const handleCreateRoomKeyDown = useCallback(
    (evt: KeyboardEvent) => {
      if (!matchesShortcut('app.createRoom', evt, shortcutOverrides)) return;
      evt.preventDefault();
      openShallowRoute(getCreateRoomPath(currentSpace));
    },
    [currentSpace, openShallowRoute, shortcutOverrides]
  );

  /** Opens the room search palette */
  const handleOpenRoomSearch = useCallback(
    (evt: KeyboardEvent) => {
      if (!matchesShortcut('navigation.openRoomSearch', evt, shortcutOverrides)) return;
      evt.preventDefault();
      openShallowRoute(getNavigatePath());
    },
    [openShallowRoute, shortcutOverrides]
  );

  /** Ctrl+F: Search for messages */
  const handleSearchMessageInRoom = useCallback(
    (evt: KeyboardEvent) => {
      if (!matchesShortcut('app.searchMessages', evt, shortcutOverrides)) return;
      evt.preventDefault();

      const searchParams: SearchPathSearchParams = {
        rooms: currentRoom?.roomId,
      };
      const path = currentSpace
        ? getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, currentSpace))
        : getHomeSearchPath();
      const roomName = mx.getRoom(currentRoom?.roomId)?.name;
      navigate(withSearchParam(path, searchParams));
      announce(`Start Searching messages ${roomName ? `in ${roomName}` : ''}`);
    },
    [mx, currentRoom, currentSpace, navigate, shortcutOverrides]
  );

  useKeyDown(window, handleNextUnreadKeyDown);
  useKeyDown(window, handleUnreadNavKeyDown);
  useKeyDown(window, handleReplyKeyDown);
  useKeyDown(window, handleBookmarkKeyDown);
  useKeyDown(window, handleCreateRoomKeyDown);
  useKeyDown(window, handleSearchMessageInRoom);
  useKeyDown(window, handleOpenRoomSearch);

  return null;
}
