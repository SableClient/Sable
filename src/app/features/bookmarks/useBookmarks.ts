import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  bookmarkDeletedListAtom,
  bookmarkIdSetAtom,
  bookmarkListAtom,
  bookmarkLoadingAtom,
} from '$state/bookmarks';
import { BookmarkItemContent, computeBookmarkId } from './bookmarkDomain';
import {
  addBookmark,
  listBookmarks,
  listDeletedBookmarks,
  removeBookmark,
  isBookmarked,
} from './bookmarkRepository';

/** Returns the current ordered bookmark list. */
export function useBookmarkList(): BookmarkItemContent[] {
  return useAtomValue(bookmarkListAtom);
}

/** Returns deleted (tombstoned) bookmarks that can be restored. */
export function useBookmarkDeletedList(): BookmarkItemContent[] {
  return useAtomValue(bookmarkDeletedListAtom);
}

/** Returns true while a bookmark refresh is in progress. */
export function useBookmarkLoading(): boolean {
  return useAtomValue(bookmarkLoadingAtom);
}

/**
 * Returns true if the given (roomId, eventId) is currently bookmarked.
 *
 * Uses the locally cached bookmarkIdSetAtom for O(1) lookup.
 * MSC4438 §Checking if a message is bookmarked.
 */
export function useIsBookmarked(roomId: string, eventId: string): boolean {
  const idSet = useAtomValue(bookmarkIdSetAtom);
  return idSet.has(computeBookmarkId(roomId, eventId));
}

/**
 * Returns bookmark action callbacks: refresh, add, remove, checkIsBookmarked.
 *
 * `refresh` re-reads all bookmark items from the locally cached account data.
 * `add` / `remove` optimistically update the local atom before writing to the server.
 */
export function useBookmarkActions() {
  const mx = useMatrixClient();
  const setList = useSetAtom(bookmarkListAtom);
  const setDeletedList = useSetAtom(bookmarkDeletedListAtom);
  const setLoading = useSetAtom(bookmarkLoadingAtom);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setList(listBookmarks(mx));
      setDeletedList(listDeletedBookmarks(mx));
    } finally {
      setLoading(false);
    }
  }, [mx, setList, setDeletedList, setLoading]);

  const add = useCallback(
    async (item: BookmarkItemContent) => {
      // Optimistic update: add to active list, remove from deleted list
      setList((prev) => {
        if (prev.some((b) => b.bookmark_id === item.bookmark_id)) return prev;
        return [item, ...prev];
      });
      setDeletedList((prev) => prev.filter((b) => b.bookmark_id !== item.bookmark_id));
      await addBookmark(mx, item);
    },
    [mx, setList, setDeletedList]
  );

  const remove = useCallback(
    async (bookmarkId: string) => {
      // Optimistic update: move from active list to deleted list
      setList((prev) => {
        const removed = prev.find((b) => b.bookmark_id === bookmarkId);
        if (removed) {
          setDeletedList((del) => {
            if (del.some((b) => b.bookmark_id === bookmarkId)) return del;
            return [{ ...removed, deleted: true }, ...del];
          });
        }
        return prev.filter((b) => b.bookmark_id !== bookmarkId);
      });
      await removeBookmark(mx, bookmarkId);
    },
    [mx, setList, setDeletedList]
  );

  const restore = useCallback(
    async (item: BookmarkItemContent) => {
      // Optimistic update: move from deleted list to active list
      setDeletedList((prev) => prev.filter((b) => b.bookmark_id !== item.bookmark_id));
      setList((prev) => {
        if (prev.some((b) => b.bookmark_id === item.bookmark_id)) return prev;
        return [item, ...prev];
      });
      await addBookmark(mx, item); // strips deleted flag
    },
    [mx, setList, setDeletedList]
  );

  const checkIsBookmarked = useCallback(
    (roomId: string, eventId: string): boolean =>
      isBookmarked(mx, computeBookmarkId(roomId, eventId)),
    [mx]
  );

  return { refresh, add, remove, restore, checkIsBookmarked };
}
