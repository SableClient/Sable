import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { bookmarkListAtom, bookmarkDeletedListAtom } from '$state/bookmarks';
import { useBookmarkActions } from './useBookmarks';
import type { BookmarkItemContent } from './bookmarkDomain';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockMx } = vi.hoisted(() => {
  const store: Record<string, unknown> = {};
  return {
    mockMx: {
      getAccountData: vi.fn((type: string) => {
        const content = store[type];
        if (!content) return undefined;
        return { getContent: () => content };
      }),
      setAccountData: vi.fn(async (type: string, content: unknown) => {
        store[type] = content;
      }),
      store: { accountData: new Map<string, unknown>() },
    },
  };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

// Mock the repository so removeBookmark doesn't try to read real account data
vi.mock('./bookmarkRepository', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./bookmarkRepository')>();
  return {
    ...orig,
    removeBookmark: vi.fn(async () => {}),
    addBookmark: vi.fn(async () => {}),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(id: string): BookmarkItemContent {
  return {
    version: 1,
    bookmark_id: id,
    uri: `matrix:roomid/foo/e/${id}`,
    room_id: '!room:s',
    event_id: `$${id}:s`,
    event_ts: 1_000,
    bookmarked_ts: 2_000,
  };
}

function makeWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBookmarkActions.remove', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('moves item from active list to deleted list optimistically', async () => {
    const item = makeItem('bmk_1111');
    store.set(bookmarkListAtom, [item]);
    store.set(bookmarkDeletedListAtom, []);

    const { result } = renderHook(() => useBookmarkActions(), {
      wrapper: makeWrapper(store),
    });

    await act(async () => {
      await result.current.remove('bmk_1111');
    });

    expect(store.get(bookmarkListAtom)).toHaveLength(0);

    const deleted = store.get(bookmarkDeletedListAtom);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].bookmark_id).toBe('bmk_1111');
    expect(deleted[0].deleted).toBe(true);
  });

  it('does not duplicate item in deleted list if already present', async () => {
    const item = makeItem('bmk_2222');
    const deletedItem = { ...item, deleted: true as const };
    store.set(bookmarkListAtom, [item]);
    store.set(bookmarkDeletedListAtom, [deletedItem]);

    const { result } = renderHook(() => useBookmarkActions(), {
      wrapper: makeWrapper(store),
    });

    await act(async () => {
      await result.current.remove('bmk_2222');
    });

    expect(store.get(bookmarkDeletedListAtom)).toHaveLength(1);
  });

  it('handles removing a non-existent item gracefully', async () => {
    store.set(bookmarkListAtom, [makeItem('bmk_3333')]);
    store.set(bookmarkDeletedListAtom, []);

    const { result } = renderHook(() => useBookmarkActions(), {
      wrapper: makeWrapper(store),
    });

    await act(async () => {
      await result.current.remove('bmk_nonexistent');
    });

    // Original item untouched
    expect(store.get(bookmarkListAtom)).toHaveLength(1);
    // Nothing added to deleted list since the item wasn't found
    expect(store.get(bookmarkDeletedListAtom)).toHaveLength(0);
  });
});
