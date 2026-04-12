/**
 * Unit tests for MSC4438 bookmark repository layer.
 *
 * The repository functions are pure in the sense that they read and write
 * synchronously from a MatrixClient mock that returns predictable account data.
 * No network calls are made.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import { addBookmark, removeBookmark, listBookmarks, isBookmarked } from './bookmarkRepository';
import {
  bookmarkItemEventType,
  emptyIndex,
  type BookmarkIndexContent,
  type BookmarkItemContent,
} from './bookmarkDomain';

// ---------------------------------------------------------------------------
// Stub MatrixClient
// ---------------------------------------------------------------------------

/**
 * Build a minimal MatrixClient stub backed by an in-memory store.
 * `getAccountData` returns a fake MatrixEvent whose `getContent()` reads
 * from the store; `setAccountData` writes to the store.
 */
function makeClient(initialData: Record<string, unknown> = {}): MatrixClient {
  const store: Record<string, unknown> = { ...initialData };
  const accountData = new Map<string, unknown>(Object.entries(store));

  return {
    getAccountData: vi.fn((eventType: string) => {
      const content = store[eventType];
      if (content === undefined) return undefined;
      return { getContent: () => content };
    }),
    setAccountData: vi.fn(async (eventType: string, content: unknown) => {
      store[eventType] = content;
      accountData.set(eventType, content);
    }),
    store: { accountData },
    _store: store, // exposed for inspection in tests
  } as unknown as MatrixClient;
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<BookmarkItemContent> = {}): BookmarkItemContent {
  return {
    version: 1,
    bookmark_id: 'bmk_aabbccdd',
    uri: 'matrix:roomid/foo/e/bar',
    room_id: '!room:s',
    event_id: '$event:s',
    event_ts: 1_000_000,
    bookmarked_ts: 2_000_000,
    ...overrides,
  };
}

function makeIndex(overrides: Partial<BookmarkIndexContent> = {}): BookmarkIndexContent {
  return {
    ...emptyIndex(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addBookmark
// ---------------------------------------------------------------------------

describe('addBookmark', () => {
  let mx: MatrixClient;

  beforeEach(() => {
    mx = makeClient();
  });

  it('writes the item event before writing the index', async () => {
    const item = makeItem();
    const callOrder: string[] = [];

    (mx.setAccountData as ReturnType<typeof vi.fn>).mockImplementation(
      async (type: string, content: unknown) => {
        callOrder.push(type);
        // keep default in-memory behaviour
        (mx as any)._store[type] = content;
      }
    );

    await addBookmark(mx, item);

    expect(callOrder[0]).toBe(bookmarkItemEventType(item.bookmark_id));
    expect(callOrder[1]).toBe(AccountDataEvent.BookmarksIndex);
  });

  it('prepends the bookmark ID to bookmark_ids in the index', async () => {
    const existing = makeItem({ bookmark_id: 'bmk_11111111' });
    const mx2 = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [existing.bookmark_id] }),
      [bookmarkItemEventType(existing.bookmark_id)]: existing,
    });

    const newItem = makeItem({ bookmark_id: 'bmk_22222222' });
    await addBookmark(mx2, newItem);

    const store = (mx2 as any)._store;
    const idx = store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.bookmark_ids[0]).toBe('bmk_22222222');
    expect(idx.bookmark_ids[1]).toBe('bmk_11111111');
  });

  it('does not duplicate an ID already in the index', async () => {
    const item = makeItem();
    const mx2 = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [item.bookmark_id] }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    await addBookmark(mx2, item);

    const idx = (mx2 as any)._store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.bookmark_ids.filter((id) => id === item.bookmark_id)).toHaveLength(1);
  });

  it('increments the index revision', async () => {
    const item = makeItem();
    await addBookmark(mx, item);

    const idx = (mx as any)._store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.revision).toBe(1);
  });

  it('works when no index exists yet (creates an empty one)', async () => {
    const item = makeItem();
    await addBookmark(mx, item);

    const idx = (mx as any)._store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.bookmark_ids).toContain(item.bookmark_id);
  });
});

// ---------------------------------------------------------------------------
// removeBookmark
// ---------------------------------------------------------------------------

describe('removeBookmark', () => {
  it('removes the bookmark ID from the index', async () => {
    const item = makeItem();
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [item.bookmark_id] }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    await removeBookmark(mx, item.bookmark_id);

    const idx = (mx as any)._store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.bookmark_ids).not.toContain(item.bookmark_id);
  });

  it('soft-deletes the item event (sets deleted: true)', async () => {
    const item = makeItem();
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [item.bookmark_id] }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    await removeBookmark(mx, item.bookmark_id);

    const stored = (mx as any)._store[
      bookmarkItemEventType(item.bookmark_id)
    ] as BookmarkItemContent;
    expect(stored.deleted).toBe(true);
  });

  it('increments the index revision', async () => {
    const item = makeItem();
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({
        bookmark_ids: [item.bookmark_id],
        revision: 3,
      }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    await removeBookmark(mx, item.bookmark_id);

    const idx = (mx as any)._store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.revision).toBe(4);
  });

  it('succeeds without error when the item event does not exist', async () => {
    const item = makeItem();
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [item.bookmark_id] }),
      // No item event stored
    });

    await expect(removeBookmark(mx, item.bookmark_id)).resolves.not.toThrow();
  });

  it('tombstones a malformed item event (sets deleted: true even when validation fails)', async () => {
    // A malformed item exists in account data (e.g. written by a buggy client).
    // removeBookmark must still tombstone it so orphan recovery does not resurrect it.
    const badContent = { not_a_valid: 'item' };
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: ['bmk_bad'] }),
      [bookmarkItemEventType('bmk_bad')]: badContent,
    });

    await removeBookmark(mx, 'bmk_bad');

    const stored = (mx as any)._store[bookmarkItemEventType('bmk_bad')];
    expect(stored.deleted).toBe(true);
  });

  it('tombstones an already-deleted item event (idempotent)', async () => {
    // If for any reason the same bookmark is removed twice, the tombstone write
    // should still succeed and the item should remain deleted.
    const item = makeItem({ deleted: true });
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [item.bookmark_id] }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    await expect(removeBookmark(mx, item.bookmark_id)).resolves.not.toThrow();
    const stored = (mx as any)._store[bookmarkItemEventType(item.bookmark_id)] as BookmarkItemContent;
    expect(stored.deleted).toBe(true);
  });

  it('leaves the index unchanged when the ID was not present', async () => {
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: ['bmk_aaaabbbb'] }),
    });

    await removeBookmark(mx, 'bmk_nonexistent');

    const idx = (mx as any)._store[AccountDataEvent.BookmarksIndex] as BookmarkIndexContent;
    expect(idx.bookmark_ids).toEqual(['bmk_aaaabbbb']);
  });
});

// ---------------------------------------------------------------------------
// listBookmarks
// ---------------------------------------------------------------------------

describe('listBookmarks', () => {
  it('returns an empty array when there is no index', () => {
    const mx = makeClient();
    expect(listBookmarks(mx)).toEqual([]);
  });

  it('returns active items in index order', () => {
    const a = makeItem({ bookmark_id: 'bmk_aaaaaaaa' });
    const b = makeItem({ bookmark_id: 'bmk_bbbbbbbb' });
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({
        bookmark_ids: [a.bookmark_id, b.bookmark_id],
      }),
      [bookmarkItemEventType(a.bookmark_id)]: a,
      [bookmarkItemEventType(b.bookmark_id)]: b,
    });

    const result = listBookmarks(mx);
    expect(result.map((i) => i.bookmark_id)).toEqual([a.bookmark_id, b.bookmark_id]);
  });

  it('skips items that are soft-deleted (deleted: true)', () => {
    const item = makeItem({ deleted: true });
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [item.bookmark_id] }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    expect(listBookmarks(mx)).toEqual([]);
  });

  it('skips item IDs whose event is missing from account data', () => {
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: ['bmk_orphaned'] }),
      // No item event
    });

    expect(listBookmarks(mx)).toEqual([]);
  });

  it('deduplicates IDs that appear more than once in bookmark_ids', () => {
    const item = makeItem();
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({
        bookmark_ids: [item.bookmark_id, item.bookmark_id],
      }),
      [bookmarkItemEventType(item.bookmark_id)]: item,
    });

    expect(listBookmarks(mx)).toHaveLength(1);
  });

  it('skips malformed item events', () => {
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: ['bmk_bad'] }),
      [bookmarkItemEventType('bmk_bad')]: { not_a_valid: 'item' },
    });

    expect(listBookmarks(mx)).toEqual([]);
  });

  it('recovers orphaned items whose event exists but ID is absent from the index', () => {
    // Simulate a concurrent-write race: device A's bookmark_id was dropped from the
    // index by a last-write-wins overwrite, but the item event still exists.
    const orphan = makeItem({ bookmark_id: 'bmk_orphan1' });
    const indexed = makeItem({ bookmark_id: 'bmk_indexed' });
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: [indexed.bookmark_id] }),
      [bookmarkItemEventType(indexed.bookmark_id)]: indexed,
      [bookmarkItemEventType(orphan.bookmark_id)]: orphan,
    });

    const result = listBookmarks(mx);
    expect(result.map((i) => i.bookmark_id)).toContain(orphan.bookmark_id);
    expect(result.map((i) => i.bookmark_id)).toContain(indexed.bookmark_id);
    // Indexed item should appear before the orphan
    expect(result[0].bookmark_id).toBe(indexed.bookmark_id);
  });

  it('does not return soft-deleted orphaned items', () => {
    const orphan = makeItem({ bookmark_id: 'bmk_orphan2', deleted: true });
    const mx = makeClient({
      // No index entry for the orphan — deleted orphan should still be skipped
      [bookmarkItemEventType(orphan.bookmark_id)]: orphan,
    });

    expect(listBookmarks(mx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isBookmarked
// ---------------------------------------------------------------------------

describe('isBookmarked', () => {
  it('returns true when the ID is in the index', () => {
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: ['bmk_aabbccdd'] }),
    });
    expect(isBookmarked(mx, 'bmk_aabbccdd')).toBe(true);
  });

  it('returns false when the ID is not in the index', () => {
    const mx = makeClient({
      [AccountDataEvent.BookmarksIndex]: makeIndex({ bookmark_ids: ['bmk_aabbccdd'] }),
    });
    expect(isBookmarked(mx, 'bmk_ffffffff')).toBe(false);
  });

  it('returns false when there is no index', () => {
    const mx = makeClient();
    expect(isBookmarked(mx, 'bmk_aabbccdd')).toBe(false);
  });
});
