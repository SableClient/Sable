/**
 * Unit tests for MSC4438 bookmark domain logic.
 * All functions in bookmarkDomain.ts are pure / side-effect-free.
 */
import { describe, it, expect } from 'vitest';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import {
  bookmarkItemEventType,
  buildMatrixURI,
  computeBookmarkId,
  createBookmarkItem,
  emptyIndex,
  extractBodyPreview,
  isValidBookmarkItem,
  isValidIndexContent,
} from './bookmarkDomain';

// ---------------------------------------------------------------------------
// Helpers: minimal Matrix object stubs
// ---------------------------------------------------------------------------

function makeEvent(
  opts: {
    id?: string | null;
    body?: unknown;
    msgtype?: string;
    sender?: string;
    ts?: number;
  } = {}
): MatrixEvent {
  return {
    getId: () => (opts.id === null ? undefined : (opts.id ?? '$event:server.tld')),
    getTs: () => opts.ts ?? 1_000_000,
    getSender: () => opts.sender ?? '@alice:server.tld',
    getContent: () => ({
      body: opts.body,
      msgtype: opts.msgtype ?? 'm.text',
    }),
  } as unknown as MatrixEvent;
}

function makeRoom(opts: { roomId?: string; name?: string } = {}): Room {
  return {
    roomId: opts.roomId ?? '!room:server.tld',
    name: opts.name ?? 'Test Room',
  } as unknown as Room;
}

// ---------------------------------------------------------------------------
// computeBookmarkId
// ---------------------------------------------------------------------------

describe('computeBookmarkId', () => {
  it('returns a string prefixed with "bmk_"', () => {
    expect(computeBookmarkId('!room:s', '$event:s')).toMatch(/^bmk_/);
  });

  it('is exactly 12 characters long ("bmk_" + 8 hex digits)', () => {
    expect(computeBookmarkId('!room:s', '$event:s')).toHaveLength(12);
  });

  it('only contains hex digits after the prefix', () => {
    const id = computeBookmarkId('!room:server.tld', '$event:server.tld');
    expect(id.slice(4)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic — same inputs always yield the same ID', () => {
    const a = computeBookmarkId('!room:server.tld', '$event:server.tld');
    const b = computeBookmarkId('!room:server.tld', '$event:server.tld');
    expect(a).toBe(b);
  });

  it('differs when roomId changes', () => {
    const a = computeBookmarkId('!roomA:s', '$event:s');
    const b = computeBookmarkId('!roomB:s', '$event:s');
    expect(a).not.toBe(b);
  });

  it('differs when eventId changes', () => {
    const a = computeBookmarkId('!room:s', '$eventA:s');
    const b = computeBookmarkId('!room:s', '$eventB:s');
    expect(a).not.toBe(b);
  });

  it('separator prevents (roomId + eventId) collisions', () => {
    // Without "|" separator, ("ab", "c") and ("a", "bc") would hash the same
    const a = computeBookmarkId('ab', 'c');
    const b = computeBookmarkId('a', 'bc');
    expect(a).not.toBe(b);
  });

  // Known vector — computed from the reference djb2-like algorithm:
  //   input = "a|b", each char's code units: 97, 124, 98
  //   hash trace: 0 → 97 → 3131 → 97159 (0x17b87)
  it('produces the known reference vector for ("a", "b")', () => {
    expect(computeBookmarkId('a', 'b')).toBe('bmk_00017b87');
  });
});

// ---------------------------------------------------------------------------
// bookmarkItemEventType
// ---------------------------------------------------------------------------

describe('bookmarkItemEventType', () => {
  it('returns the MSC4438 unstable event type for a given bookmark ID', () => {
    expect(bookmarkItemEventType('bmk_abcd1234')).toBe(
      `${AccountDataEvent.BookmarkItemPrefix}bmk_abcd1234`
    );
  });

  it('uses BookmarkItemPrefix as the base', () => {
    const id = 'bmk_00000001';
    expect(bookmarkItemEventType(id)).toContain(AccountDataEvent.BookmarkItemPrefix);
  });

  it('has BookmarksIndex enum value defined correctly', () => {
    expect(AccountDataEvent.BookmarksIndex).toBe('org.matrix.msc4438.bookmarks.index');
  });
});

// ---------------------------------------------------------------------------
// buildMatrixURI
// ---------------------------------------------------------------------------

describe('buildMatrixURI', () => {
  it.each([
    [
      '!room:server.tld',
      '$event:server.tld',
      // encodeURIComponent does not encode '!' — only ':' and '$' are encoded here
      'matrix:roomid/!room%3Aserver.tld/e/%24event%3Aserver.tld',
    ],
    ['simple', 'id', 'matrix:roomid/simple/e/id'],
    ['a b', 'c d', 'matrix:roomid/a%20b/e/c%20d'],
  ])('buildMatrixURI(%s, %s) → %s', (roomId, eventId, expected) => {
    expect(buildMatrixURI(roomId, eventId)).toBe(expected);
  });

  it('starts with "matrix:roomid/"', () => {
    expect(buildMatrixURI('!r:s', '$e:s')).toMatch(/^matrix:roomid\//);
  });

  it('contains "/e/" separator between roomId and eventId', () => {
    expect(buildMatrixURI('!r:s', '$e:s')).toContain('/e/');
  });
});

// ---------------------------------------------------------------------------
// extractBodyPreview
// ---------------------------------------------------------------------------

describe('extractBodyPreview', () => {
  it('returns the body unchanged when it is within the default limit', () => {
    const event = makeEvent({ body: 'Hello, world!' });
    expect(extractBodyPreview(event)).toBe('Hello, world!');
  });

  it('returns an empty string when body is undefined', () => {
    const event = makeEvent({ body: undefined });
    expect(extractBodyPreview(event)).toBe('');
  });

  it('returns an empty string when body is a non-string type', () => {
    const event = makeEvent({ body: 42 });
    expect(extractBodyPreview(event)).toBe('');
  });

  it('returns an empty string when body is an empty string', () => {
    const event = makeEvent({ body: '' });
    expect(extractBodyPreview(event)).toBe('');
  });

  it('truncates to 120 chars and appends "…" when body exceeds the default limit', () => {
    const long = 'x'.repeat(200);
    const result = extractBodyPreview(makeEvent({ body: long }));
    expect(result).toHaveLength(121); // 120 + ellipsis char
    expect(result.endsWith('\u2026')).toBe(true);
    expect(result.slice(0, 120)).toBe('x'.repeat(120));
  });

  it('does not truncate when body is exactly 120 chars', () => {
    const exact = 'y'.repeat(120);
    expect(extractBodyPreview(makeEvent({ body: exact }))).toBe(exact);
  });

  it('respects a custom maxLength', () => {
    const event = makeEvent({ body: 'abcdefghij' });
    const result = extractBodyPreview(event, 5);
    expect(result).toBe('abcde\u2026');
  });
});

// ---------------------------------------------------------------------------
// isValidIndexContent
// ---------------------------------------------------------------------------

describe('isValidIndexContent', () => {
  const valid = {
    version: 1 as const,
    revision: 0,
    updated_ts: Date.now(),
    bookmark_ids: [],
  };

  it('accepts a well-formed index', () => {
    expect(isValidIndexContent(valid)).toBe(true);
  });

  it('accepts an index with string IDs in bookmark_ids', () => {
    expect(isValidIndexContent({ ...valid, bookmark_ids: ['bmk_aabbccdd'] })).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidIndexContent(null)).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isValidIndexContent('string')).toBe(false);
    expect(isValidIndexContent(42)).toBe(false);
  });

  it('rejects version !== 1', () => {
    expect(isValidIndexContent({ ...valid, version: 2 })).toBe(false);
  });

  it('rejects missing revision', () => {
    const { revision, ...rest } = valid;
    expect(isValidIndexContent(rest)).toBe(false);
  });

  it('rejects missing updated_ts', () => {
    const { updated_ts: updatedTs, ...rest } = valid;
    expect(isValidIndexContent(rest)).toBe(false);
  });

  it('rejects missing bookmark_ids', () => {
    const { bookmark_ids: bookmarkIds, ...rest } = valid;
    expect(isValidIndexContent(rest)).toBe(false);
  });

  it('rejects bookmark_ids containing a non-string', () => {
    expect(isValidIndexContent({ ...valid, bookmark_ids: [1, 2, 3] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidBookmarkItem
// ---------------------------------------------------------------------------

describe('isValidBookmarkItem', () => {
  const valid = {
    version: 1 as const,
    bookmark_id: 'bmk_abcd1234',
    uri: 'matrix:roomid/foo/e/bar',
    room_id: '!room:s',
    event_id: '$event:s',
    event_ts: 1_000_000,
    bookmarked_ts: 2_000_000,
  };

  it('accepts a complete, well-formed item', () => {
    expect(isValidBookmarkItem(valid)).toBe(true);
  });

  it('accepts an item with optional fields set', () => {
    expect(
      isValidBookmarkItem({ ...valid, sender: '@alice:s', room_name: 'Room', deleted: false })
    ).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidBookmarkItem(null)).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isValidBookmarkItem('string')).toBe(false);
  });

  it('rejects version !== 1', () => {
    expect(isValidBookmarkItem({ ...valid, version: 2 })).toBe(false);
  });

  it.each(['bookmark_id', 'uri', 'room_id', 'event_id'] as const)(
    'rejects item missing string field "%s"',
    (field) => {
      const copy = { ...valid } as Record<string, unknown>;
      delete copy[field];
      expect(isValidBookmarkItem(copy)).toBe(false);
    }
  );

  it.each(['event_ts', 'bookmarked_ts'] as const)(
    'rejects item missing numeric field "%s"',
    (field) => {
      const copy = { ...valid } as Record<string, unknown>;
      delete copy[field];
      expect(isValidBookmarkItem(copy)).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// createBookmarkItem
// ---------------------------------------------------------------------------

describe('createBookmarkItem', () => {
  it('returns undefined when the event has no ID', () => {
    const room = makeRoom();
    const event = makeEvent({ id: null });
    expect(createBookmarkItem(room, event)).toBeUndefined();
  });

  it('returns a valid BookmarkItemContent for a normal event', () => {
    const room = makeRoom({ roomId: '!r:s', name: 'My Room' });
    const event = makeEvent({
      id: '$e:s',
      body: 'Hello',
      msgtype: 'm.text',
      sender: '@bob:s',
      ts: 123456,
    });
    const item = createBookmarkItem(room, event);
    expect(item).toBeDefined();
    expect(item!.version).toBe(1);
    expect(item!.room_id).toBe('!r:s');
    expect(item!.event_id).toBe('$e:s');
    expect(item!.bookmark_id).toBe(computeBookmarkId('!r:s', '$e:s'));
    expect(item!.uri).toBe(buildMatrixURI('!r:s', '$e:s'));
    expect(item!.event_ts).toBe(123456);
    expect(item!.sender).toBe('@bob:s');
    expect(item!.room_name).toBe('My Room');
    expect(item!.body_preview).toBe('Hello');
    expect(item!.msgtype).toBe('m.text');
  });

  it('omits body_preview when body is missing', () => {
    const room = makeRoom();
    const event = makeEvent({ body: undefined });
    const item = createBookmarkItem(room, event);
    expect(item!.body_preview).toBe('');
  });

  it('passes isValidBookmarkItem on the returned content', () => {
    const room = makeRoom();
    const event = makeEvent();
    const item = createBookmarkItem(room, event);
    expect(isValidBookmarkItem(item)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emptyIndex
// ---------------------------------------------------------------------------

describe('emptyIndex', () => {
  it('returns a valid index with version 1', () => {
    const idx = emptyIndex();
    expect(isValidIndexContent(idx)).toBe(true);
    expect(idx.version).toBe(1);
  });

  it('starts with revision 0 and empty bookmark_ids', () => {
    const idx = emptyIndex();
    expect(idx.revision).toBe(0);
    expect(idx.bookmark_ids).toEqual([]);
  });

  it('returns a fresh object on each call (no shared reference)', () => {
    const a = emptyIndex();
    const b = emptyIndex();
    a.bookmark_ids.push('bmk_aabbccdd');
    expect(b.bookmark_ids).toHaveLength(0);
  });
});
