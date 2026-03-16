// Example: testing a utility file with multiple related exports.
// Uses it.each for table-driven tests — good for exhaustive format coverage.
import { describe, it, expect } from 'vitest';
import {
  binarySearch,
  bytesToSize,
  millisecondsToMinutesAndSeconds,
  nameInitials,
  parseGeoUri,
  secondsToMinutesAndSeconds,
  splitWithSpace,
  suffixRename,
  trimLeadingSlash,
  trimSlash,
  trimTrailingSlash,
} from './common';

describe('bytesToSize', () => {
  it.each([
    [0, '0KB'],
    [1_500, '1.5 KB'],
    [2_500_000, '2.5 MB'],
    [3_200_000_000, '3.2 GB'],
  ])('bytesToSize(%i) → %s', (input, expected) => {
    expect(bytesToSize(input)).toBe(expected);
  });
});

describe('millisecondsToMinutesAndSeconds', () => {
  it.each([
    [0, '0:00'],
    [5_000, '0:05'],
    [60_000, '1:00'],
    [90_000, '1:30'],
    [3_661_000, '61:01'],
  ])('%ims → %s', (ms, expected) => {
    expect(millisecondsToMinutesAndSeconds(ms)).toBe(expected);
  });
});

describe('secondsToMinutesAndSeconds', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [125, '2:05'],
  ])('%is → %s', (s, expected) => {
    expect(secondsToMinutesAndSeconds(s)).toBe(expected);
  });
});

// binarySearch: match fn returns 0=found, 1=go left (item too large), -1=go right (item too small)
describe('binarySearch', () => {
  const nums = [1, 3, 5, 7, 9, 11, 13];
  const matcherFor =
    (target: number) =>
    (n: number): -1 | 0 | 1 => {
      if (n === target) return 0;
      if (n > target) return 1;
      return -1;
    };

  it('finds a value in the middle', () => {
    expect(binarySearch(nums, matcherFor(7))).toBe(7);
  });

  it('finds the first element', () => {
    expect(binarySearch(nums, matcherFor(1))).toBe(1);
  });

  it('finds the last element', () => {
    expect(binarySearch(nums, matcherFor(13))).toBe(13);
  });

  it('returns undefined when value is not present', () => {
    expect(binarySearch(nums, matcherFor(6))).toBeUndefined();
  });

  it('returns undefined for an empty array', () => {
    expect(binarySearch([], matcherFor(1))).toBeUndefined();
  });
});

describe('parseGeoUri', () => {
  it('parses a basic geo URI', () => {
    expect(parseGeoUri('geo:51.5074,-0.1278')).toEqual({
      latitude: '51.5074',
      longitude: '-0.1278',
    });
  });

  it('ignores the uncertainty parameter after the semicolon', () => {
    expect(parseGeoUri('geo:48.8566,2.3522;u=20')).toEqual({
      latitude: '48.8566',
      longitude: '2.3522',
    });
  });

  it('returns undefined for an empty string', () => {
    expect(parseGeoUri('')).toBeUndefined();
  });

  it('returns undefined when there is no colon separator', () => {
    expect(parseGeoUri('no-colon-here')).toBeUndefined();
  });

  it('returns undefined when coordinates are missing', () => {
    expect(parseGeoUri('geo:')).toBeUndefined();
  });
});

describe('nameInitials', () => {
  it.each<[string | null | undefined, number, string]>([
    ['Alice', 1, 'A'],
    ['Bob Smith', 2, 'Bo'],
    ['', 1, ''],
    [null, 1, ''],
    [undefined, 1, ''],
    ['😀Emoji', 1, '😀'],
  ])('nameInitials(%s, %i) → %s', (str, len, expected) => {
    expect(nameInitials(str, len)).toBe(expected);
  });
});

describe('suffixRename', () => {
  it('appends suffix 1 when the name is immediately valid', () => {
    expect(suffixRename('room', () => false)).toBe('room1');
  });

  it('increments the suffix until the validator returns false', () => {
    const taken = new Set(['room1', 'room2', 'room3']);
    expect(suffixRename('room', (n) => taken.has(n))).toBe('room4');
  });
});

describe('splitWithSpace', () => {
  it.each([
    ['hello world', ['hello', 'world']],
    ['  leading', ['leading']],
    ['trailing  ', ['trailing']],
    ['', []],
    ['   ', []],
    ['one', ['one']],
  ])('splitWithSpace(%s)', (input, expected) => {
    expect(splitWithSpace(input)).toEqual(expected);
  });
});

describe('trimLeadingSlash / trimTrailingSlash / trimSlash', () => {
  it.each([
    ['///foo/bar', 'foo/bar'],
    ['foo/bar', 'foo/bar'],
    ['/', ''],
  ])('trimLeadingSlash(%s) → %s', (input, expected) => {
    expect(trimLeadingSlash(input)).toBe(expected);
  });

  it.each([
    ['foo/bar///', 'foo/bar'],
    ['foo/bar', 'foo/bar'],
    ['/', ''],
  ])('trimTrailingSlash(%s) → %s', (input, expected) => {
    expect(trimTrailingSlash(input)).toBe(expected);
  });

  it.each([
    ['///foo/bar///', 'foo/bar'],
    ['/a/', 'a'],
    ['', ''],
    ['/', ''],
  ])('trimSlash(%s) → %s', (input, expected) => {
    expect(trimSlash(input)).toBe(expected);
  });
});
