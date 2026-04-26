/**
 * Bookmark repository: low-level read/write operations against Matrix account data.
 *
 * All writes follow the MSC4438 ordering guarantee:
 *   item is written first → index is updated second
 * This ensures that when other devices receive the updated index via /sync, the
 * referenced item event is already available.
 */

import { MatrixClient } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import {
  BookmarkIndexContent,
  BookmarkItemContent,
  bookmarkItemEventType,
  emptyIndex,
  isValidBookmarkItem,
  isValidIndexContent,
} from './bookmarkDomain';

// Internal helpers
function readIndex(mx: MatrixClient): BookmarkIndexContent {
  const evt = mx.getAccountData(AccountDataEvent.BookmarksIndex as any);
  const content = evt?.getContent();
  if (isValidIndexContent(content)) return content;
  return emptyIndex();
}

function readItem(mx: MatrixClient, bookmarkId: string): BookmarkItemContent | undefined {
  const evt = mx.getAccountData(bookmarkItemEventType(bookmarkId) as any);
  const content = evt?.getContent();
  // Must be valid and not tombstoned (MSC4438 §Listing bookmarks)
  if (isValidBookmarkItem(content) && !content.deleted) return content;
  return undefined;
}

async function writeIndex(mx: MatrixClient, index: BookmarkIndexContent): Promise<void> {
  await mx.setAccountData(AccountDataEvent.BookmarksIndex as any, index as any);
}

async function writeItem(mx: MatrixClient, item: BookmarkItemContent): Promise<void> {
  await mx.setAccountData(bookmarkItemEventType(item.bookmark_id) as any, item as any);
}

// Public API
/**
 * Add a bookmark.  Also handles re-activation: if the same (roomId, eventId) was
 * previously removed (tombstoned), calling addBookmark again clears the tombstone
 * and restores it to the active list.
 *
 * MSC4438 §Adding a bookmark:
 *  1. Write the item event first (strips any deleted flag to guarantee re-activation).
 *  2. Prepend the ID to bookmark_ids (if not already present).
 *  3. Increment revision and update timestamp.
 *  4. Write the updated index.
 */
export async function addBookmark(mx: MatrixClient, item: BookmarkItemContent): Promise<void> {
  // Strip deleted so that re-bookmarking a previously removed message always
  // produces an active item, even if a stale tombstoned item is passed in.
  const { deleted, ...activeItem } = item;
  // Write item before updating index (cross-device consistency)
  await writeItem(mx, activeItem as BookmarkItemContent);

  const index = readIndex(mx);
  if (!index.bookmark_ids.includes(item.bookmark_id)) {
    index.bookmark_ids.unshift(item.bookmark_id);
  }
  index.revision += 1;
  index.updated_ts = Date.now();
  await writeIndex(mx, index);
}

/**
 * Remove a bookmark.
 *
 * MSC4438 §Removing a bookmark:
 *  1. Soft-delete the item first (set deleted: true).
 *  2. Remove the ID from the index.
 *  3. Increment revision and update timestamp.
 *  4. Write the updated index.
 *
 * Account data events cannot be deleted from the server, so soft-deletion is
 * used.  This implementation intentionally tombstones the item before updating
 * the index to mirror addBookmark()'s item-first ordering and avoid transient
 * orphan recovery/resurrection if a removal only partially completes.
 */
export async function removeBookmark(mx: MatrixClient, bookmarkId: string): Promise<void> {
  // Tombstone the item event directly — bypass readItem()'s validation so that
  // malformed or already-deleted items still get marked deleted: true.  Without
  // this, orphan recovery can resurrect items whose deletion write failed halfway.
  const evt = mx.getAccountData(bookmarkItemEventType(bookmarkId) as any);
  const raw = evt?.getContent();
  if (raw != null) {
    // Write using the bookmarkId param as the canonical type key, not item.bookmark_id,
    // so malformed items (missing bookmark_id field) still get the right event type.
    await mx.setAccountData(
      bookmarkItemEventType(bookmarkId) as any,
      { ...(raw as object), deleted: true } as any
    );
  }

  const index = readIndex(mx);
  index.bookmark_ids = index.bookmark_ids.filter((id) => id !== bookmarkId);
  index.revision += 1;
  index.updated_ts = Date.now();
  await writeIndex(mx, index);
}

/**
 * List all active bookmarks in index order, with orphan recovery.
 *
 * MSC4438 §Listing bookmarks:
 *  - Iterates bookmark_ids in order.
 *  - Skips missing, malformed, or tombstoned items.
 *  - Deduplicates by first occurrence.
 *
 * Orphan recovery: also scans the in-memory account data store for bookmark
 * item events that exist but are absent from the index.  These arise when two
 * devices concurrently write the index (last-write-wins drops the other
 * device's new bookmark_id while the item event itself persists).  Orphaned
 * items are appended after the index-ordered items.
 */
export function listBookmarks(mx: MatrixClient): BookmarkItemContent[] {
  const index = readIndex(mx);
  const seen = new Set<string>();

  const items = index.bookmark_ids
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => readItem(mx, id))
    .filter((item): item is BookmarkItemContent => item != null);

  // Walk the in-memory account data store for orphaned item events.
  const prefix = AccountDataEvent.BookmarkItemPrefix as string;
  Array.from(mx.store.accountData.keys()).forEach((key) => {
    if (!key.startsWith(prefix)) return;
    const bookmarkId = key.slice(prefix.length);
    if (seen.has(bookmarkId)) return;
    const item = readItem(mx, bookmarkId);
    if (item) {
      seen.add(bookmarkId);
      items.push(item);
    }
  });

  return items;
}

/**
 * List all deleted (tombstoned) bookmark items.
 *
 * Includes both:
 *  - Items still referenced in the index whose item event carries deleted: true
 *    (arises when the index write fails after a soft-delete).
 *  - Orphaned tombstones whose ID has already been removed from the index
 *    (the normal case after a successful remove).
 *
 * Results are deduplicated and include only items that pass isValidBookmarkItem
 * (ensuring enough stored metadata is available to display and restore them).
 */
export function listDeletedBookmarks(mx: MatrixClient): BookmarkItemContent[] {
  const index = readIndex(mx);
  const results: BookmarkItemContent[] = [];
  const seen = new Set<string>();

  // 1. Index-referenced items that are tombstoned (partial remove failure)
  index.bookmark_ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const content = mx.getAccountData(bookmarkItemEventType(id) as any)?.getContent();
    if (isValidBookmarkItem(content) && content.deleted === true) results.push(content);
  });

  // 2. Orphan tombstones (properly removed from index but item event persists)
  const prefix = AccountDataEvent.BookmarkItemPrefix as string;
  Array.from(mx.store.accountData.keys()).forEach((key) => {
    if (!key.startsWith(prefix)) return;
    const bookmarkId = key.slice(prefix.length);
    if (seen.has(bookmarkId)) return;
    seen.add(bookmarkId);
    const content = mx.getAccountData(key as any)?.getContent();
    if (isValidBookmarkItem(content) && content.deleted === true) results.push(content);
  });

  return results;
}

/**
 * Check whether a specific bookmark ID is in the index.
 *
 * NOTE: Do not rely on the bookmark ID being deterministically derivable from
 * (roomId, eventId) for this check — different clients may use different
 * algorithms.  Use the bookmarkIdSet atom (derived from the live list) for
 * O(1) per-message checks instead.
 */
export function isBookmarked(mx: MatrixClient, bookmarkId: string): boolean {
  const index = readIndex(mx);
  return index.bookmark_ids.includes(bookmarkId);
}
