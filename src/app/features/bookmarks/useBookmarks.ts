import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { bookmarkIdSetAtom, bookmarkListAtom, bookmarkLoadingAtom } from '$state/bookmarks';
import { BookmarkItemContent, computeBookmarkId } from './bookmarkDomain';
import { addBookmark, removeBookmark, listBookmarks, isBookmarked } from './bookmarkRepository';

/** Returns the current ordered bookmark list. */
export function useBookmarkList(): BookmarkItemContent[] {
  return useAtomValue(bookmarkListAtom);
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
  const setLoading = useSetAtom(bookmarkLoadingAtom);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = listBookmarks(mx);
      setList(items);
    } finally {
      setLoading(false);
    }
  }, [mx, setList, setLoading]);

  const add = useCallback(
    async (item: BookmarkItemContent) => {
      // Optimistic update
      setList((prev) => {
        if (prev.some((b) => b.bookmark_id === item.bookmark_id)) return prev;
        return [item, ...prev];
      });
      await addBookmark(mx, item);
    },
    [mx, setList]
  );

  const remove = useCallback(
    async (bookmarkId: string) => {
      // Optimistic update
      setList((prev) => prev.filter((b) => b.bookmark_id !== bookmarkId));
      await removeBookmark(mx, bookmarkId);
    },
    [mx, setList]
  );

  const checkIsBookmarked = useCallback(
    (roomId: string, eventId: string): boolean =>
      isBookmarked(mx, computeBookmarkId(roomId, eventId)),
    [mx]
  );

  return { refresh, add, remove, checkIsBookmarked };
}
