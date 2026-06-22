import { describe, expect, it } from 'vitest';
import { getJumpToLatestFocusItem } from './useTimelineSync';

describe('getJumpToLatestFocusItem', () => {
  it('returns undefined for an empty timeline chain', () => {
    expect(getJumpToLatestFocusItem([])).toBeUndefined();
  });

  it('targets the conceptual bottom for non-empty timelines', () => {
    const focusItem = getJumpToLatestFocusItem([
      { getEvents: () => [{}] } as never,
    ]);

    expect(focusItem).toEqual({
      index: 0,
      scrollTo: true,
      highlight: false,
      align: 'end',
      tail: 'live',
    });
  });
});
