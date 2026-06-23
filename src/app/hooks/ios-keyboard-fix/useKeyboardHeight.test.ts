import { describe, expect, it } from 'vitest';

import { getImmediateVisibleViewportHeight } from './useKeyboardHeight';

describe('getImmediateVisibleViewportHeight', () => {
  it('uses the saved keyboard height estimate on the first open', () => {
    expect(getImmediateVisibleViewportHeight(900, 640, 280, false)).toBe(620);
  });

  it('falls back to the live viewport height when there is no saved estimate', () => {
    expect(getImmediateVisibleViewportHeight(900, 640, 0, false)).toBe(640);
  });

  it('tracks the live viewport height once the keyboard CSS vars are active', () => {
    expect(getImmediateVisibleViewportHeight(900, 700, 280, true)).toBe(700);
  });
});
