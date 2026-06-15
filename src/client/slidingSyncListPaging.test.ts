import { describe, expect, it } from 'vitest';
import { getNextSlidingSyncListWindowEnd } from './slidingSyncListPaging';

describe('getNextSlidingSyncListWindowEnd', () => {
  it('pages from the loaded server range for warm-cache rows', () => {
    expect(
      getNextSlidingSyncListWindowEnd({
        diagnostics: { key: 'joined', knownCount: 500, rangeEnd: 29 },
        itemCount: 500,
        lastVirtualIndex: 25,
      })
    ).toBe(59);
  });

  it('does not wait for the rendered list tail when the loaded range tail is visible', () => {
    expect(
      getNextSlidingSyncListWindowEnd({
        diagnostics: { key: 'joined', knownCount: 500, rangeEnd: 89 },
        itemCount: 500,
        lastVirtualIndex: 79,
      })
    ).toBe(119);
  });

  it('allows empty-list expansion only when the caller opts in', () => {
    expect(
      getNextSlidingSyncListWindowEnd({
        diagnostics: { key: 'dms', knownCount: 100, rangeEnd: 29 },
        itemCount: 0,
        lastVirtualIndex: -1,
      })
    ).toBeUndefined();

    expect(
      getNextSlidingSyncListWindowEnd({
        diagnostics: { key: 'dms', knownCount: 100, rangeEnd: 29 },
        itemCount: 0,
        lastVirtualIndex: -1,
        allowEmptyExpansion: true,
      })
    ).toBe(59);
  });

  it('does not page past the server-known list count', () => {
    expect(
      getNextSlidingSyncListWindowEnd({
        diagnostics: { key: 'joined', knownCount: 30, rangeEnd: 29 },
        itemCount: 30,
        lastVirtualIndex: 29,
      })
    ).toBeUndefined();
  });
});
