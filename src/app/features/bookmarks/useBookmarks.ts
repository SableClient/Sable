import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  bookmarkDeletedListAtom,
  bookmarkIdSetAtom,
  bookmarkListAtom,
  bookmarkLoadingAtom,
} from '$state/bookmarks';
import type { BookmarkItemContent } from './bookmarkDomain';
import { computeBookmarkId } from './bookmarkDomain';
import {
  addBookmark,
  listBookmarks,
  listDeletedBookmarks,
  purgeBookmark,
  removeBookmark,
  isBookmarked,
} from './bookmarkRepository';
import { clearBookmarkReminder, listReminders, setBookmarkReminder } from './reminderRepository';
import type { BookmarkReminder } from '$types/matrix/accountData';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { CustomAccountDataEvent as AccountDataEvent } from '$types/matrix/accountData';

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

  const purge = useCallback(
    async (bookmarkId: string) => {
      // Optimistic update: remove from the archived list immediately
      setDeletedList((prev) => prev.filter((b) => b.bookmark_id !== bookmarkId));
      // Write purged:true to account data so the item is hidden on all devices
      // after the next sync (Matrix account data cannot actually be deleted).
      await purgeBookmark(mx, bookmarkId);
    },
    [mx, setDeletedList]
  );

  const checkIsBookmarked = useCallback(
    (roomId: string, eventId: string): boolean =>
      isBookmarked(mx, computeBookmarkId(roomId, eventId)),
    [mx]
  );

  return { refresh, add, remove, restore, purge, checkIsBookmarked };
}

/**
 * Returns the live list of bookmark reminders, re-read whenever the
 * `moe.sable.bookmarks.reminders` account data event changes.
 */
export function useBookmarkReminders(): BookmarkReminder[] {
  const mx = useMatrixClient();
  const [reminders, setReminders] = useState<BookmarkReminder[]>(() => listReminders(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mxEvent) => {
        if (mxEvent.getType() === (AccountDataEvent.SableBookmarksReminders as string)) {
          setReminders(listReminders(mx));
        }
      },
      [mx]
    )
  );

  // Re-read when mx changes (e.g. session switch)
  useEffect(() => {
    setReminders(listReminders(mx));
  }, [mx]);

  return reminders;
}

/**
 * Returns callbacks to set and clear a reminder for a specific bookmark.
 */
export function useBookmarkReminderActions() {
  const mx = useMatrixClient();

  const setReminder = useCallback(
    async (reminder: BookmarkReminder) => {
      await setBookmarkReminder(mx, reminder);
    },
    [mx]
  );

  const clearReminder = useCallback(
    async (bookmarkId: string) => {
      await clearBookmarkReminder(mx, bookmarkId);
    },
    [mx]
  );

  return { setReminder, clearReminder };
}

/**
 * Returns the count of reminder bookmarks that have fired (remindAt <= now)
 * but haven't been cleared yet. These represent unread/unacknowledged reminders.
 *
 * Updates every minute to catch newly fired reminders without requiring
 * account data changes.
 */
export function useFiredReminderCount(): number {
  const reminders = useBookmarkReminders();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const computeCount = () => {
      const now = Date.now();
      return reminders.filter((r) => r.remindAt <= now).length;
    };

    setCount(computeCount());

    // Recompute every minute to catch reminders that become due
    const interval = setInterval(() => {
      setCount(computeCount());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [reminders]);

  return count;
}
