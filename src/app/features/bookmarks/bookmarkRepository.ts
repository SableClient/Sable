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
 * Add a bookmark.
 *
 * MSC4438 §Adding a bookmark:
 *  1. Write the item event first.
 *  2. Prepend the ID to bookmark_ids (if not already present).
 *  3. Increment revision and update timestamp.
 *  4. Write the updated index.
 */
export async function addBookmark(mx: MatrixClient, item: BookmarkItemContent): Promise<void> {
  // Write item before updating index (cross-device consistency)
  await writeItem(mx, item);

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
 *  1. Remove the ID from the index.
 *  2. Soft-delete the item (set deleted: true).
 *
 * Account data events cannot be deleted from the server, so soft-deletion is
 * used.  Other clients that encounter the item event can see it is explicitly
 * removed.
 */
export async function removeBookmark(mx: MatrixClient, bookmarkId: string): Promise<void> {
  // Soft-delete the item FIRST — mirrors the item-before-index ordering of addBookmark.
  // If writeIndex ran first, orphan recovery in listBookmarks() would transiently resurface the
  // bookmark (item not yet deleted, but ID also not in index) between the two writes.
  const existing = readItem(mx, bookmarkId);
  if (existing) {
    await writeItem(mx, { ...existing, deleted: true });
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
