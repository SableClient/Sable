import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { computeBookmarkId } from '$features/bookmarks/bookmarkDomain';
import {
  addBookmark as repoAdd,
  removeBookmark as repoRemove,
  listBookmarks,
  isBookmarked as repoIsBookmarked,
} from '$features/bookmarks/bookmarkRepository';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  bookmarkIdSetAtom,
  bookmarkListAtom,
  bookmarkLoadingAtom,
  bookmarkRefreshErrorAtom,
} from '$state/bookmarks';
import type { BookmarkItemContent } from '$types/matrix-sdk-events';

export function useBookmarkList(): BookmarkItemContent[] {
  return useAtomValue(bookmarkListAtom);
}

export function useBookmarkLoading(): boolean {
  return useAtomValue(bookmarkLoadingAtom);
}

export function useBookmarkRefreshError(): Error | undefined {
  return useAtomValue(bookmarkRefreshErrorAtom);
}

export function useIsBookmarked(roomId: string, eventId: string): boolean {
  const idSet = useAtomValue(bookmarkIdSetAtom);
  return idSet.has(computeBookmarkId(roomId, eventId));
}

export function useBookmarkActions() {
  const mx = useMatrixClient();
  const setList = useSetAtom(bookmarkListAtom);
  const setLoading = useSetAtom(bookmarkLoadingAtom);
  const setRefreshError = useSetAtom(bookmarkRefreshErrorAtom);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listBookmarks(mx);
      setList(items);
      setRefreshError(undefined);
    } catch (error) {
      setRefreshError(error as Error);
    } finally {
      setLoading(false);
    }
  }, [mx, setList, setLoading, setRefreshError]);

  const add = useCallback(
    async (item: BookmarkItemContent) => {
      setList((prev) => {
        if (prev.some((b) => b.bookmark_id === item.bookmark_id)) return prev;
        return [item, ...prev];
      });
      await repoAdd(mx, item);
    },
    [mx, setList]
  );

  const remove = useCallback(
    async (bookmarkId: string) => {
      setList((prev) => prev.filter((b) => b.bookmark_id !== bookmarkId));
      await repoRemove(mx, bookmarkId);
    },
    [mx, setList]
  );

  const checkIsBookmarked = useCallback(
    (roomId: string, eventId: string): boolean =>
      repoIsBookmarked(mx, computeBookmarkId(roomId, eventId)),
    [mx]
  );

  return { refresh, add, remove, checkIsBookmarked };
}
