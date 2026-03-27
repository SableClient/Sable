import { describe, expect, it } from 'vitest';

import { buildAbbreviationsMap, splitByAbbreviations } from './abbreviations';

describe('buildAbbreviationsMap', () => {
  it('returns an empty map for empty entries', () => {
    expect(buildAbbreviationsMap([])).toEqual(new Map());
  });

  it('stores the key as lowercase regardless of input casing', () => {
    const map = buildAbbreviationsMap([
      { term: 'FOSS', definition: 'Free and Open Source Software' },
    ]);
    expect(map.get('foss')).toBe('Free and Open Source Software');
    expect(map.get('FOSS')).toBeUndefined();
  });

  it('trims surrounding whitespace from terms', () => {
    const map = buildAbbreviationsMap([
      { term: '  FOSS  ', definition: 'Free and Open Source Software' },
    ]);
    expect(map.get('foss')).toBe('Free and Open Source Software');
    expect(map.size).toBe(1);
  });

  it('skips empty and whitespace-only terms', () => {
    const map = buildAbbreviationsMap([
      { term: '', definition: 'ignored' },
      { term: '   ', definition: 'also ignored' },
    ]);
    expect(map.size).toBe(0);
  });

  it('deduplicates different-cased variants of the same term (last entry wins)', () => {
    const map = buildAbbreviationsMap([
      { term: 'OSS', definition: 'Open Source Software' },
      { term: 'oss', definition: 'open source software' },
    ]);
    expect(map.size).toBe(1);
    expect(map.get('oss')).toBe('open source software');
  });

  it('stores multiple distinct entries', () => {
    const map = buildAbbreviationsMap([
      { term: 'FOSS', definition: 'Free and Open Source Software' },
      { term: 'RTFM', definition: 'Read The Fine Manual' },
    ]);
    expect(map.size).toBe(2);
    expect(map.get('foss')).toBe('Free and Open Source Software');
    expect(map.get('rtfm')).toBe('Read The Fine Manual');
  });
});

describe('splitByAbbreviations', () => {
  const map = buildAbbreviationsMap([
    { term: 'FOSS', definition: 'Free and Open Source Software' },
    { term: 'RTFM', definition: 'Read The Fine Manual' },
    { term: 'OSS', definition: 'Open Source Software' },
  ]);

  it('returns a single plain segment when the map is empty', () => {
    expect(splitByAbbreviations('hello FOSS world', new Map())).toEqual([
      { id: 'txt-0', text: 'hello FOSS world' },
    ]);
  });

  it('returns a single plain segment when there are no matches', () => {
    expect(splitByAbbreviations('hello world', map)).toEqual([
      { id: 'txt-0', text: 'hello world' },
    ]);
  });

  it('returns a single plain segment for an empty string', () => {
    expect(splitByAbbreviations('', map)).toEqual([{ id: 'txt-0', text: '' }]);
  });

  it('splits a term match in the middle of a string', () => {
    expect(splitByAbbreviations('Use FOSS software', map)).toEqual([
      { id: 'txt-0', text: 'Use ' },
      { id: 'txt-1', text: 'FOSS', termKey: 'foss' },
      { id: 'txt-2', text: ' software' },
    ]);
  });

  it('splits a term match at the start of a string', () => {
    expect(splitByAbbreviations('FOSS is great', map)).toEqual([
      { id: 'txt-0', text: 'FOSS', termKey: 'foss' },
      { id: 'txt-1', text: ' is great' },
    ]);
  });

  it('splits a term match at the end of a string', () => {
    expect(splitByAbbreviations('I love FOSS', map)).toEqual([
      { id: 'txt-0', text: 'I love ' },
      { id: 'txt-1', text: 'FOSS', termKey: 'foss' },
    ]);
  });

  it('handles multiple terms in the same string', () => {
    expect(splitByAbbreviations('FOSS and RTFM', map)).toEqual([
      { id: 'txt-0', text: 'FOSS', termKey: 'foss' },
      { id: 'txt-1', text: ' and ' },
      { id: 'txt-2', text: 'RTFM', termKey: 'rtfm' },
    ]);
  });

  it('matches case-insensitively (termKey is always lowercase)', () => {
    expect(splitByAbbreviations('I like foss and Foss', map)).toEqual([
      { id: 'txt-0', text: 'I like ' },
      { id: 'txt-1', text: 'foss', termKey: 'foss' },
      { id: 'txt-2', text: ' and ' },
      { id: 'txt-3', text: 'Foss', termKey: 'foss' },
    ]);
  });

  it('does not match a term that is a prefix of a longer word (word boundary)', () => {
    // OSS is in the map, but should not match inside FOSS because the F provides no boundary
    const ossOnlyMap = buildAbbreviationsMap([{ term: 'OSS', definition: 'Open Source Software' }]);
    expect(splitByAbbreviations('FOSS rocks', ossOnlyMap)).toEqual([
      { id: 'txt-0', text: 'FOSS rocks' },
    ]);
  });

  it('does not match a term embedded inside a longer word', () => {
    // OSS should not match inside CROSS or GLOSS
    const ossOnlyMap = buildAbbreviationsMap([{ term: 'OSS', definition: 'Open Source Software' }]);
    expect(splitByAbbreviations('CROSS the GLOSS', ossOnlyMap)).toEqual([
      { id: 'txt-0', text: 'CROSS the GLOSS' },
    ]);
  });

  it('matches a shorter term standalone when the longer overlapping term is also defined', () => {
    // OSS is a suffix of FOSS; when standalone it should still match
    expect(splitByAbbreviations('OSS is related to FOSS', map)).toEqual([
      { id: 'txt-0', text: 'OSS', termKey: 'oss' },
      { id: 'txt-1', text: ' is related to ' },
      { id: 'txt-2', text: 'FOSS', termKey: 'foss' },
    ]);
  });

  it('prefers the longer term when a shorter one is a suffix of it', () => {
    // FOSS contains OSS; FOSS should win and OSS should not be matched separately
    expect(splitByAbbreviations('Use FOSS today', map)).toEqual([
      { id: 'txt-0', text: 'Use ' },
      { id: 'txt-1', text: 'FOSS', termKey: 'foss' },
      { id: 'txt-2', text: ' today' },
    ]);
  });

  it('preserves plain text between two consecutive matches', () => {
    expect(splitByAbbreviations('FOSS, RTFM, OSS', map)).toEqual([
      { id: 'txt-0', text: 'FOSS', termKey: 'foss' },
      { id: 'txt-1', text: ', ' },
      { id: 'txt-2', text: 'RTFM', termKey: 'rtfm' },
      { id: 'txt-3', text: ', ' },
      { id: 'txt-4', text: 'OSS', termKey: 'oss' },
    ]);
  });
});
