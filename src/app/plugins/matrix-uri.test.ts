import { describe, expect, it } from 'vitest';
import {
  isRedundantMatrixUriAnchorText,
  matrixUriKey,
  parseMatrixUri,
  testMatrixUri,
} from './matrix-uri';

describe('parseMatrixUri', () => {
  it('parses user URIs (u and legacy user)', () => {
    expect(parseMatrixUri('matrix:u/alice:example.org')).toEqual({
      kind: 'user',
      userId: '@alice:example.org',
    });
    expect(parseMatrixUri('matrix:user/alice:example.org')).toEqual({
      kind: 'user',
      userId: '@alice:example.org',
    });
  });

  it('ignores action and other query params for users', () => {
    expect(parseMatrixUri('matrix:u/alice:example.org?action=chat')).toEqual({
      kind: 'user',
      userId: '@alice:example.org',
    });
  });

  it('parses room alias URIs (r and legacy room)', () => {
    expect(parseMatrixUri('matrix:r/somewhere:example.org')).toEqual({
      kind: 'room',
      room: { roomIdOrAlias: '#somewhere:example.org', viaServers: undefined },
    });
    expect(parseMatrixUri('matrix:room/somewhere:example.org')).toEqual({
      kind: 'room',
      room: { roomIdOrAlias: '#somewhere:example.org', viaServers: undefined },
    });
  });

  it('parses room id URIs with via servers', () => {
    expect(parseMatrixUri('matrix:roomid/somewhere:example.org?via=elsewhere.ca')).toEqual({
      kind: 'room',
      room: { roomIdOrAlias: '!somewhere:example.org', viaServers: ['elsewhere.ca'] },
    });
    expect(parseMatrixUri('matrix:roomid/r:example.org?via=a.com&via=b.com')).toEqual({
      kind: 'room',
      room: { roomIdOrAlias: '!r:example.org', viaServers: ['a.com', 'b.com'] },
    });
  });

  it('parses event URIs under room id and alias', () => {
    expect(parseMatrixUri('matrix:roomid/somewhere:example.org/e/event?via=elsewhere.ca')).toEqual({
      kind: 'event',
      event: {
        roomIdOrAlias: '!somewhere:example.org',
        eventId: '$event',
        viaServers: ['elsewhere.ca'],
      },
    });
    expect(parseMatrixUri('matrix:r/somewhere:example.org/e/event')).toEqual({
      kind: 'event',
      event: { roomIdOrAlias: '#somewhere:example.org', eventId: '$event', viaServers: undefined },
    });
  });

  it('accepts the legacy event type qualifier', () => {
    expect(parseMatrixUri('matrix:roomid/r:example.org/event/abc')).toEqual({
      kind: 'event',
      event: { roomIdOrAlias: '!r:example.org', eventId: '$abc', viaServers: undefined },
    });
  });

  it('handles an optional authority component', () => {
    expect(parseMatrixUri('matrix://elsewhere.ca/r/somewhere:example.org')).toEqual({
      kind: 'room',
      room: { roomIdOrAlias: '#somewhere:example.org', viaServers: undefined },
    });
  });

  it('decodes percent-encoded segments', () => {
    expect(parseMatrixUri('matrix:r/some%2Froom:example.org')).toEqual({
      kind: 'room',
      room: { roomIdOrAlias: '#some/room:example.org', viaServers: undefined },
    });
  });

  it('returns undefined for malformed or non-matrix URIs', () => {
    expect(parseMatrixUri('https://matrix.to/#/@alice:example.org')).toBeUndefined();
    expect(parseMatrixUri('matrix:nonsense')).toBeUndefined();
    expect(parseMatrixUri('matrix:u/')).toBeUndefined();
    expect(parseMatrixUri('matrix:u/alice:example.org/extra')).toBeUndefined();
    expect(parseMatrixUri('matrix:roomid/r:example.org/x/abc')).toBeUndefined();
    expect(parseMatrixUri('not a uri')).toBeUndefined();
  });
});

describe('testMatrixUri', () => {
  it('returns true only for well-formed matrix URIs', () => {
    expect(testMatrixUri('matrix:u/alice:example.org')).toBe(true);
    expect(testMatrixUri('matrix:roomid/r:example.org/e/abc')).toBe(true);
    expect(testMatrixUri('matrix:bogus')).toBe(false);
    expect(testMatrixUri('https://example.com')).toBe(false);
  });
});

describe('matrixUriKey / isRedundantMatrixUriAnchorText', () => {
  it('treats identical matrix URIs as redundant anchor text', () => {
    const href = 'matrix:r/room:example.org';
    expect(matrixUriKey(href)).toBe('r:#room:example.org');
    expect(isRedundantMatrixUriAnchorText(href, 'matrix:r/room:example.org')).toBe(true);
    expect(isRedundantMatrixUriAnchorText(href, '')).toBe(true);
    expect(isRedundantMatrixUriAnchorText(href, 'a custom label')).toBe(false);
  });
});
