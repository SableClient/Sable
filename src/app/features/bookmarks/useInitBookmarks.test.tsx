import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { bookmarkListAtom, bookmarkDeletedListAtom } from '$state/bookmarks';
import { useInitBookmarks } from './useInitBookmarks';
import type { BookmarkItemContent, BookmarkIndexContent } from './bookmarkDomain';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const BOOKMARKS_INDEX = 'org.matrix.msc4438.bookmarks.index';
const BOOKMARK_PREFIX = 'org.matrix.msc4438.bookmark.';

const { accountDataCB, syncStateCB, mockMx } = vi.hoisted(() => {
  const adCB: { current: ((event: { getType: () => string }) => void) | null } = { current: null };
  const ssCB: { current: ((state: string, prev: string) => void) | null } = { current: null };

  const item: BookmarkItemContent = {
    version: 1,
    bookmark_id: 'bmk_aabb',
    uri: 'matrix:roomid/foo/e/bar',
    room_id: '!room:s',
    event_id: '$ev:s',
    event_ts: 1_000,
    bookmarked_ts: 2_000,
  };
  const deletedItem: BookmarkItemContent = {
    version: 1,
    bookmark_id: 'bmk_ccdd',
    uri: 'matrix:roomid/baz/e/qux',
    room_id: '!room2:s',
    event_id: '$ev2:s',
    event_ts: 3_000,
    bookmarked_ts: 4_000,
    deleted: true,
  };
  const index: BookmarkIndexContent = {
    version: 1,
    revision: 1,
    updated_ts: 5_000,
    bookmark_ids: ['bmk_aabb', 'bmk_ccdd'],
  };

  const store: Record<string, unknown> = {
    'org.matrix.msc4438.bookmarks.index': index,
    'org.matrix.msc4438.bookmark.bmk_aabb': item,
    'org.matrix.msc4438.bookmark.bmk_ccdd': deletedItem,
  };

  const mx = {
    getAccountData: vi.fn((type: string) => {
      const content = store[type];
      if (!content) return undefined;
      return { getContent: () => content };
    }),
    setAccountData: vi.fn(),
    store: { accountData: new Map(Object.entries(store)) },
  };

  return { accountDataCB: adCB, syncStateCB: ssCB, mockMx: mx };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

vi.mock('$hooks/useAccountDataCallback', () => ({
  useAccountDataCallback: (_mx: unknown, cb: (event: { getType: () => string }) => void) => {
    accountDataCB.current = cb;
  },
}));

vi.mock('$hooks/useSyncState', () => ({
  useSyncState: (_mx: unknown, cb: (state: string, prev: string) => void) => {
    syncStateCB.current = cb;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore() {
  return createStore();
}

function makeWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInitBookmarks', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = makeStore();
    accountDataCB.current = null;
    syncStateCB.current = null;
  });

  it('loads bookmarks on mount', () => {
    renderHook(() => useInitBookmarks(), { wrapper: makeWrapper(store) });

    const list = store.get(bookmarkListAtom);
    const deleted = store.get(bookmarkDeletedListAtom);
    expect(list).toHaveLength(1);
    expect(list[0].bookmark_id).toBe('bmk_aabb');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].bookmark_id).toBe('bmk_ccdd');
  });

  it('reloads when BookmarksIndex account data event fires', () => {
    renderHook(() => useInitBookmarks(), { wrapper: makeWrapper(store) });

    // Clear the atom to prove the callback re-populates it
    store.set(bookmarkListAtom, []);

    accountDataCB.current!({ getType: () => BOOKMARKS_INDEX });

    expect(store.get(bookmarkListAtom)).toHaveLength(1);
  });

  it('reloads when a bookmark item account data event fires', () => {
    renderHook(() => useInitBookmarks(), { wrapper: makeWrapper(store) });

    store.set(bookmarkListAtom, []);

    accountDataCB.current!({
      getType: () => `${BOOKMARK_PREFIX}bmk_aabb`,
    });

    expect(store.get(bookmarkListAtom)).toHaveLength(1);
  });

  it('ignores unrelated account data events', () => {
    renderHook(() => useInitBookmarks(), { wrapper: makeWrapper(store) });

    store.set(bookmarkListAtom, []);

    accountDataCB.current!({ getType: () => 'm.room.message' });

    // Should still be empty — callback should not have triggered a reload
    expect(store.get(bookmarkListAtom)).toHaveLength(0);
  });
});
