/**
 * Unit tests for the Jotai bookmark atoms in src/app/state/bookmarks.ts.
 *
 * The derived `bookmarkIdSetAtom` is the only atom with non-trivial logic —
 * it builds an O(1) lookup Set from the bookmark list.  The primitive atoms
 * (`bookmarkListAtom`, `bookmarkLoadingAtom`) are default Jotai atoms whose
 * read/write semantics are provided by the library itself and do not need
 * additional testing.
 */
import { describe, it, expect } from 'vitest';
import { createStore } from 'jotai';
import { bookmarkIdSetAtom, bookmarkListAtom } from './bookmarks';
import type { BookmarkItemContent } from '../features/bookmarks/bookmarkDomain';

// Helper: minimal valid bookmark item
function makeItem(id: string): BookmarkItemContent {
  return {
    version: 1,
    bookmark_id: id,
    uri: `matrix:roomid/foo/e/${id}`,
    room_id: '!room:s',
    event_id: `$${id}:s`,
    event_ts: 1_000_000,
    bookmarked_ts: 2_000_000,
  };
}

describe('bookmarkIdSetAtom (derived)', () => {
  it('returns an empty Set when the list is empty', () => {
    const store = createStore();
    const set = store.get(bookmarkIdSetAtom);
    expect(set.size).toBe(0);
  });

  it('contains the IDs of every item in bookmarkListAtom', () => {
    const store = createStore();
    store.set(bookmarkListAtom, [makeItem('bmk_aaaaaaaa'), makeItem('bmk_bbbbbbbb')]);

    const set = store.get(bookmarkIdSetAtom);
    expect(set.has('bmk_aaaaaaaa')).toBe(true);
    expect(set.has('bmk_bbbbbbbb')).toBe(true);
  });

  it('does not contain IDs not in the list', () => {
    const store = createStore();
    store.set(bookmarkListAtom, [makeItem('bmk_aaaaaaaa')]);

    const set = store.get(bookmarkIdSetAtom);
    expect(set.has('bmk_ffffffff')).toBe(false);
  });

  it('updates reactively when the list changes', () => {
    const store = createStore();
    store.set(bookmarkListAtom, [makeItem('bmk_11111111')]);

    expect(store.get(bookmarkIdSetAtom).has('bmk_11111111')).toBe(true);

    store.set(bookmarkListAtom, []);
    expect(store.get(bookmarkIdSetAtom).has('bmk_11111111')).toBe(false);
  });

  it('returns a Set whose size equals the number of unique items', () => {
    const store = createStore();
    const items = [makeItem('bmk_aaaaaaaa'), makeItem('bmk_bbbbbbbb'), makeItem('bmk_cccccccc')];
    store.set(bookmarkListAtom, items);

    expect(store.get(bookmarkIdSetAtom).size).toBe(3);
  });
});
