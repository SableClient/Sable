import { describe, it, expect } from 'vitest';
import { scrubMatrixIds, scrubDataObject, scrubMatrixUrl } from './sentryScrubbers';

// ─── scrubMatrixIds ───────────────────────────────────────────────────────────

describe('scrubMatrixIds – credential tokens', () => {
  it('redacts access_token in query-string form', () => {
    expect(scrubMatrixIds('GET /?access_token=abc123xyz')).toBe('GET /?access_token=[REDACTED]');
  });

  it('redacts password in key=value form', () => {
    expect(scrubMatrixIds('password=hunter2')).toBe('password=[REDACTED]');
  });

  it('redacts refresh_token', () => {
    expect(scrubMatrixIds('refresh_token=tok_refresh_xyz')).toBe('refresh_token=[REDACTED]');
  });

  it('redacts sync_token and next_batch', () => {
    expect(scrubMatrixIds('sync_token=s1234_5678')).toBe('sync_token=[REDACTED]');
    expect(scrubMatrixIds('next_batch=s1234_5678')).toBe('next_batch=[REDACTED]');
  });

  it('is case-insensitive for token names', () => {
    expect(scrubMatrixIds('Access_Token=abc')).toBe('Access_Token=[REDACTED]');
  });

  it('leaves unrelated query params untouched', () => {
    expect(scrubMatrixIds('format=json&limit=50')).toBe('format=json&limit=50');
  });
});

describe('scrubMatrixIds – Matrix entity IDs', () => {
  it('replaces user IDs', () => {
    expect(scrubMatrixIds('@alice:example.com')).toBe('@[USER_ID]');
    expect(scrubMatrixIds('@bob:matrix.org')).toBe('@[USER_ID]');
  });

  it('replaces room IDs', () => {
    expect(scrubMatrixIds('!roomid:example.com')).toBe('![ROOM_ID]');
  });

  it('replaces room aliases', () => {
    expect(scrubMatrixIds('#general:example.com')).toBe('#[ROOM_ALIAS]');
  });

  it('replaces event IDs (10+ base64 chars)', () => {
    expect(scrubMatrixIds('$abcdefghij')).toBe('$[EVENT_ID]');
    expect(scrubMatrixIds('$1234567890abcdef')).toBe('$[EVENT_ID]');
  });

  it('leaves short dollar strings untouched (< 10 chars)', () => {
    expect(scrubMatrixIds('$short')).toBe('$short');
  });

  it('scrubs multiple IDs in one string', () => {
    const input = 'User @alice:example.com joined !abc:example.com';
    const result = scrubMatrixIds(input);
    expect(result).toContain('@[USER_ID]');
    expect(result).toContain('![ROOM_ID]');
    expect(result).not.toContain('@alice');
    expect(result).not.toContain('!abc');
  });

  it('passes through plain strings with no sensitive content', () => {
    const safe = 'Something went wrong loading the timeline';
    expect(scrubMatrixIds(safe)).toBe(safe);
  });
});

// ─── scrubDataObject ──────────────────────────────────────────────────────────

describe('scrubDataObject', () => {
  it('scrubs a top-level string', () => {
    expect(scrubDataObject('@alice:example.com')).toBe('@[USER_ID]');
  });

  it('scrubs string values inside a plain object', () => {
    const result = scrubDataObject({ userId: '@alice:example.com', count: 3 }) as Record<
      string,
      unknown
    >;
    expect(result.userId).toBe('@[USER_ID]');
    expect(result.count).toBe(3); // non-strings are preserved
  });

  it('scrubs string values inside a nested object', () => {
    const result = scrubDataObject({
      context: { roomId: '!room:example.com' },
    }) as { context: Record<string, unknown> };
    expect(result.context.roomId).toBe('![ROOM_ID]');
  });

  it('scrubs string values inside an array', () => {
    const result = scrubDataObject(['@alice:example.com', '!room:example.com', 42]) as unknown[];
    expect(result[0]).toBe('@[USER_ID]');
    expect(result[1]).toBe('![ROOM_ID]');
    expect(result[2]).toBe(42);
  });

  it('passes through null unchanged', () => {
    expect(scrubDataObject(null)).toBeNull();
  });

  it('passes through numbers and booleans unchanged', () => {
    expect(scrubDataObject(42)).toBe(42);
    expect(scrubDataObject(true)).toBe(true);
  });

  it('handles an empty object', () => {
    expect(scrubDataObject({})).toEqual({});
  });
});

// ─── scrubMatrixUrl ───────────────────────────────────────────────────────────

describe('scrubMatrixUrl – Matrix C-S API paths', () => {
  it('scrubs room ID in /rooms/ path', () => {
    expect(scrubMatrixUrl('/_matrix/client/v3/rooms/!abc:example.com/messages')).toBe(
      '/_matrix/client/v3/rooms/![ROOM_ID]/messages'
    );
  });

  it('scrubs event ID in /event/ path', () => {
    expect(scrubMatrixUrl('/rooms/!abc:example.com/event/$eventIdHere')).toContain(
      '/event/$[EVENT_ID]'
    );
  });

  it('scrubs event ID in /relations/ path', () => {
    expect(scrubMatrixUrl('/rooms/!abc:example.com/relations/$eventIdHere')).toContain(
      '/relations/$[EVENT_ID]'
    );
  });

  it('scrubs user ID in /profile/ path', () => {
    expect(scrubMatrixUrl('/_matrix/client/v3/profile/@alice:example.com')).toBe(
      '/_matrix/client/v3/profile/[USER_ID]'
    );
  });

  it('scrubs percent-encoded user ID in /profile/ path', () => {
    expect(scrubMatrixUrl('/profile/%40alice%3Aexample.com')).toBe('/profile/[USER_ID]');
  });

  it('scrubs user ID in /user/ path', () => {
    expect(scrubMatrixUrl('/_matrix/client/v3/user/@alice:example.com/filter')).toBe(
      '/_matrix/client/v3/user/[USER_ID]/filter'
    );
  });

  it('scrubs user ID in /presence/ path', () => {
    expect(scrubMatrixUrl('/_matrix/client/v3/presence/@alice:example.com/status')).toBe(
      '/_matrix/client/v3/presence/[USER_ID]/status'
    );
  });

  it('scrubs the version segment in /room_keys/keys/ paths', () => {
    // The regex scrubs up to the first '/' — the version segment is redacted.
    // Sub-paths (roomId, sessionId) are handled by subsequent URL patterns.
    expect(scrubMatrixUrl('/_matrix/client/v3/room_keys/keys/latest')).toBe(
      '/_matrix/client/v3/room_keys/keys/[REDACTED]'
    );
  });

  it('scrubs /sendToDevice/ transaction IDs', () => {
    expect(scrubMatrixUrl('/sendToDevice/m.room.encrypted/txnId123')).toBe(
      '/sendToDevice/m.room.encrypted/[TXN_ID]'
    );
  });

  it('scrubs MSC3916 media download path', () => {
    expect(scrubMatrixUrl('/_matrix/client/v1/media/download/matrix.org/someMediaId')).toBe(
      '/_matrix/client/v1/media/download/[SERVER]/[MEDIA_ID]'
    );
  });

  it('scrubs legacy /media/v3/ download path', () => {
    expect(scrubMatrixUrl('/_matrix/media/v3/download/matrix.org/someMediaId')).toBe(
      '/_matrix/media/v3/download/[SERVER]/[MEDIA_ID]'
    );
  });
});

describe('scrubMatrixUrl – app route path segments', () => {
  it('scrubs bare room ID in app route', () => {
    expect(scrubMatrixUrl('/home/!roomid:example.com/timeline')).toBe('/home/![ROOM_ID]/timeline');
  });

  it('scrubs hybrid room ID (decoded sigil, encoded colon)', () => {
    expect(scrubMatrixUrl('/home/!roomid%3Aexample.com/timeline')).toBe(
      '/home/![ROOM_ID]/timeline'
    );
  });

  it('scrubs bare user ID in app route', () => {
    expect(scrubMatrixUrl('/dm/@alice:example.com')).toBe('/dm/@[USER_ID]');
  });

  it('scrubs bare room alias in app route', () => {
    expect(scrubMatrixUrl('/home/#general:example.com')).toBe('/home/[ROOM_ALIAS]');
  });
});

describe('scrubMatrixUrl – deep-link (percent-encoded) forms', () => {
  it('scrubs %40-encoded user ID', () => {
    expect(scrubMatrixUrl('/open/%40alice%3Aexample.com')).toBe('/open/[USER_ID]');
  });

  it('scrubs %21-encoded room ID', () => {
    expect(scrubMatrixUrl('/open/%21room%3Aexample.com')).toBe('/open/![ROOM_ID]');
  });

  it('scrubs %23-encoded room alias', () => {
    expect(scrubMatrixUrl('/open/%23general%3Aexample.com')).toBe('/open/[ROOM_ALIAS]');
  });

  it('scrubs %24-encoded event ID', () => {
    expect(scrubMatrixUrl('/open/%24eventIdLongEnough')).toBe('/open/[EVENT_ID]');
  });
});

describe('scrubMatrixUrl – preview_url', () => {
  it('strips query string from preview_url endpoint', () => {
    expect(scrubMatrixUrl('/_matrix/media/v3/preview_url?url=https://example.com&ts=1234')).toBe(
      '/_matrix/media/v3/preview_url'
    );
  });

  it('leaves the path intact and only removes query string', () => {
    const result = scrubMatrixUrl('/preview_url?url=https://evil.example.com');
    expect(result).toBe('/preview_url');
  });
});

describe('scrubMatrixUrl – safe inputs', () => {
  it('passes through a plain path with no Matrix IDs', () => {
    const safe = '/home/timeline';
    expect(scrubMatrixUrl(safe)).toBe(safe);
  });

  it('passes through an empty string', () => {
    expect(scrubMatrixUrl('')).toBe('');
  });
});
