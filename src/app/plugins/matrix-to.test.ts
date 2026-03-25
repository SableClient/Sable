import { afterEach, describe, expect, it } from 'vitest';
import {
  getMatrixToRoom,
  getMatrixToRoomEvent,
  getMatrixToUser,
  parseMatrixToRoom,
  parseMatrixToRoomEvent,
  parseMatrixToUser,
  setMatrixToBase,
  testMatrixTo,
} from './matrix-to';

// Reset to default after each test so state doesn't leak between tests.
afterEach(() => {
  setMatrixToBase(undefined);
});

// ---------------------------------------------------------------------------
// Link generation
// ---------------------------------------------------------------------------

describe('getMatrixToUser', () => {
  it('generates a standard matrix.to user link', () => {
    expect(getMatrixToUser('@alice:example.com')).toBe('https://matrix.to/#/@alice:example.com');
  });

  it('uses custom base when configured', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(getMatrixToUser('@alice:example.com')).toBe(
      'https://matrix.example.org/#/@alice:example.com'
    );
  });

  it('strips trailing slash from custom base', () => {
    setMatrixToBase('https://matrix.example.org/');
    expect(getMatrixToUser('@alice:example.com')).toBe(
      'https://matrix.example.org/#/@alice:example.com'
    );
  });
});

describe('getMatrixToRoom', () => {
  it('generates a standard matrix.to room link', () => {
    expect(getMatrixToRoom('!room:example.com')).toBe('https://matrix.to/#/!room:example.com');
  });

  it('appends via servers', () => {
    expect(getMatrixToRoom('!room:example.com', ['s1.org', 's2.org'])).toBe(
      'https://matrix.to/#/!room:example.com?via=s1.org&via=s2.org'
    );
  });

  it('uses custom base when configured', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(getMatrixToRoom('#general:example.com')).toBe(
      'https://matrix.example.org/#/#general:example.com'
    );
  });
});

describe('getMatrixToRoomEvent', () => {
  it('generates a standard matrix.to event link', () => {
    expect(getMatrixToRoomEvent('!room:example.com', '$event123')).toBe(
      'https://matrix.to/#/!room:example.com/$event123'
    );
  });

  it('appends via servers', () => {
    expect(getMatrixToRoomEvent('!room:example.com', '$event123', ['s1.org'])).toBe(
      'https://matrix.to/#/!room:example.com/$event123?via=s1.org'
    );
  });

  it('uses custom base when configured', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(getMatrixToRoomEvent('!room:example.com', '$event123')).toBe(
      'https://matrix.example.org/#/!room:example.com/$event123'
    );
  });
});

// ---------------------------------------------------------------------------
// testMatrixTo
// ---------------------------------------------------------------------------

describe('testMatrixTo', () => {
  it('matches standard matrix.to URLs', () => {
    expect(testMatrixTo('https://matrix.to/#/@alice:example.com')).toBe(true);
    expect(testMatrixTo('https://matrix.to/#/!room:example.com')).toBe(true);
    expect(testMatrixTo('https://matrix.to/#/!room:example.com/$event')).toBe(true);
    expect(testMatrixTo('http://matrix.to/#/@alice:example.com')).toBe(true);
  });

  it('rejects non-matrix.to URLs', () => {
    expect(testMatrixTo('https://example.com')).toBe(false);
    expect(testMatrixTo('https://notmatrix.to/#/@alice:example.com')).toBe(false);
  });

  it('matches custom base URLs after setMatrixToBase', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(testMatrixTo('https://matrix.example.org/#/@alice:example.com')).toBe(true);
  });

  it('still matches standard matrix.to after setMatrixToBase (cross-client compat)', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(testMatrixTo('https://matrix.to/#/@alice:example.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseMatrixToUser
// ---------------------------------------------------------------------------

describe('parseMatrixToUser', () => {
  it('parses a standard matrix.to user link', () => {
    expect(parseMatrixToUser('https://matrix.to/#/@alice:example.com')).toBe('@alice:example.com');
  });

  it('returns undefined for non-user links', () => {
    expect(parseMatrixToUser('https://matrix.to/#/!room:example.com')).toBeUndefined();
  });

  it('parses user links from custom base', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(parseMatrixToUser('https://matrix.example.org/#/@alice:example.com')).toBe(
      '@alice:example.com'
    );
  });

  it('parses standard matrix.to user links even after custom base is set', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(parseMatrixToUser('https://matrix.to/#/@alice:example.com')).toBe('@alice:example.com');
  });
});

// ---------------------------------------------------------------------------
// parseMatrixToRoom
// ---------------------------------------------------------------------------

describe('parseMatrixToRoom', () => {
  it('parses a room ID link', () => {
    expect(parseMatrixToRoom('https://matrix.to/#/!room:example.com')).toEqual({
      roomIdOrAlias: '!room:example.com',
      viaServers: undefined,
    });
  });

  it('parses a room alias link', () => {
    expect(parseMatrixToRoom('https://matrix.to/#/#general:example.com')).toEqual({
      roomIdOrAlias: '#general:example.com',
      viaServers: undefined,
    });
  });

  it('parses via servers', () => {
    expect(
      parseMatrixToRoom('https://matrix.to/#/!room:example.com?via=s1.org&via=s2.org')
    ).toEqual({
      roomIdOrAlias: '!room:example.com',
      viaServers: ['s1.org', 's2.org'],
    });
  });

  it('returns undefined for event links (too many segments)', () => {
    expect(parseMatrixToRoom('https://matrix.to/#/!room:example.com/$event123')).toBeUndefined();
  });

  it('parses room links from custom base', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(parseMatrixToRoom('https://matrix.example.org/#/!room:example.com')).toEqual({
      roomIdOrAlias: '!room:example.com',
      viaServers: undefined,
    });
  });

  it('still parses standard matrix.to room links after custom base is set', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(parseMatrixToRoom('https://matrix.to/#/!room:example.com')).toEqual({
      roomIdOrAlias: '!room:example.com',
      viaServers: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// parseMatrixToRoomEvent
// ---------------------------------------------------------------------------

describe('parseMatrixToRoomEvent', () => {
  it('parses a room event link', () => {
    expect(parseMatrixToRoomEvent('https://matrix.to/#/!room:example.com/$event123')).toEqual({
      roomIdOrAlias: '!room:example.com',
      eventId: '$event123',
      viaServers: undefined,
    });
  });

  it('parses via servers', () => {
    expect(
      parseMatrixToRoomEvent('https://matrix.to/#/!room:example.com/$event123?via=s1.org')
    ).toEqual({
      roomIdOrAlias: '!room:example.com',
      eventId: '$event123',
      viaServers: ['s1.org'],
    });
  });

  it('returns undefined for room-only links', () => {
    expect(parseMatrixToRoomEvent('https://matrix.to/#/!room:example.com')).toBeUndefined();
  });

  it('parses event links from custom base', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(
      parseMatrixToRoomEvent('https://matrix.example.org/#/!room:example.com/$event123')
    ).toEqual({
      roomIdOrAlias: '!room:example.com',
      eventId: '$event123',
      viaServers: undefined,
    });
  });

  it('still parses standard matrix.to event links after custom base is set', () => {
    setMatrixToBase('https://matrix.example.org');
    expect(parseMatrixToRoomEvent('https://matrix.to/#/!room:example.com/$event123')).toEqual({
      roomIdOrAlias: '!room:example.com',
      eventId: '$event123',
      viaServers: undefined,
    });
  });
});
