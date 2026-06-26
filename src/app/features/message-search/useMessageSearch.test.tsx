import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { atom } from 'jotai';
import { useMessageSearch } from './useMessageSearch';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockMx } = vi.hoisted(() => ({
  mockMx: {
    search: vi.fn<(args: { body: unknown; next_batch?: string }) => Promise<unknown>>(),
  },
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

vi.mock('$hooks/useClientConfig', () => ({
  useClientConfig: () => ({ features: {} }),
}));

vi.mock('$hooks/useSearchIndex', () => ({
  useSearchIndex: () => undefined,
}));

vi.mock('$state/settings', () => ({
  // encryptedSearch disabled keeps the hook on the pure server-search path.
  settingsAtom: atom({ encryptedSearch: false, idbSearchIndex: false }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Item = { msgtype: string; body: string };

function searchPage(items: Item[], nextBatch?: string) {
  return {
    search_categories: {
      room_events: {
        next_batch: nextBatch,
        highlights: [],
        results: items.map((item, index) => ({
          rank: 1,
          result: {
            event_id: `$ev${index}`,
            room_id: '!room:example.org',
            sender: '@alice:example.org',
            origin_server_ts: index + 1,
            type: 'm.room.message',
            content: { msgtype: item.msgtype, body: item.body },
          },
          context: {},
        })),
      },
    },
  };
}

const textItem: Item = { msgtype: 'm.text', body: 'hello world' };
const imageItem: Item = { msgtype: 'm.image', body: 'hello world' };

describe('useMessageSearch — has: filter pagination', () => {
  beforeEach(() => {
    mockMx.search.mockReset();
  });

  it('keeps paging when a client-side has: filter empties earlier server pages', async () => {
    // Page 1: 20 text matches, none are images -> filtered to empty, but more pages remain.
    // Page 2: contains an image match.
    mockMx.search
      .mockResolvedValueOnce(searchPage(Array.from({ length: 20 }, () => textItem), 'page-2'))
      .mockResolvedValueOnce(searchPage([imageItem, textItem], 'page-3'));

    const { result } = renderHook(() =>
      useMessageSearch({ term: 'hello', hasTypes: ['image'], order: 'recent' })
    );

    const search = await result.current();

    // Before the fix this returned the empty page-1 result and stalled.
    expect(mockMx.search).toHaveBeenCalledTimes(2);
    expect(search.groups).toHaveLength(1);
    expect(search.groups[0]?.items).toHaveLength(1);
    expect(search.groups[0]?.items[0]?.event.content?.msgtype).toBe('m.image');
    // The surviving cursor lets the UI resume paging.
    expect(search.nextToken).toBe('page-3');
  });

  it('stops paging when the server runs out of pages', async () => {
    mockMx.search
      .mockResolvedValueOnce(searchPage([textItem], 'page-2'))
      .mockResolvedValueOnce(searchPage([textItem], undefined));

    const { result } = renderHook(() =>
      useMessageSearch({ term: 'hello', hasTypes: ['image'], order: 'recent' })
    );

    const search = await result.current();

    expect(mockMx.search).toHaveBeenCalledTimes(2);
    expect(search.groups).toHaveLength(0);
    expect(search.nextToken).toBeUndefined();
  });

  it('is bounded and does not page indefinitely when every page is filtered out', async () => {
    // Always returns a non-matching page with a live cursor.
    mockMx.search.mockResolvedValue(searchPage([textItem], 'more'));

    const { result } = renderHook(() =>
      useMessageSearch({ term: 'hello', hasTypes: ['image'], order: 'recent' })
    );

    const search = await result.current();

    expect(mockMx.search).toHaveBeenCalledTimes(10);
    expect(search.groups).toHaveLength(0);
    // Cursor preserved so a later explicit fetch can continue.
    expect(search.nextToken).toBe('more');
  });
});
