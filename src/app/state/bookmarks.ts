import { atom } from 'jotai';
import { BookmarkItemContent } from '../features/bookmarks/bookmarkDomain';

/** Ordered list of active bookmark items (mirrors the server index order). */
export const bookmarkListAtom = atom<BookmarkItemContent[]>([]);

/**
 * Ordered list of deleted (tombstoned) bookmark items that are recoverable.
 * Populated alongside bookmarkListAtom so the UI can show a "Recently Removed"
 * section with a Restore button for each entry.
 */
export const bookmarkDeletedListAtom = atom<BookmarkItemContent[]>([]);

/** True while a refresh from account data is in progress. */
export const bookmarkLoadingAtom = atom<boolean>(false);

/**
 * Derived set of active bookmark IDs — used for O(1) per-message
 * "is this message bookmarked?" checks.
 *
 * MSC4438 §Checking if a message is bookmarked: use a local reverse lookup
 * rather than issuing server requests.
 */
export const bookmarkIdSetAtom = atom<Set<string>>((get) => {
  const list = get(bookmarkListAtom);
  return new Set(list.map((b) => b.bookmark_id));
});
