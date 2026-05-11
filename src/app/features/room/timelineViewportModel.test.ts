import { describe, expect, it } from 'vitest';
import {
  getBottomClampSpacer,
  getCenterAnchorAdjustment,
  getDistanceFromBottom,
  isTimelineAtBottom,
} from './timelineViewportModel';

describe('timelineViewportModel', () => {
  it('calculates bottom distance and bottom threshold', () => {
    expect(getDistanceFromBottom(1200, 500, 600)).toBe(100);
    expect(getDistanceFromBottom(600, 0, 800)).toBe(0);
    expect(isTimelineAtBottom(1200, 520, 600, 100)).toBe(true);
    expect(isTimelineAtBottom(1200, 499, 600, 100)).toBe(false);
  });

  it('bottom-clamps short content while excluding the existing spacer', () => {
    expect(getBottomClampSpacer(800, 400, 0)).toBe(400);
    expect(getBottomClampSpacer(800, 700, 300)).toBe(400);
    expect(getBottomClampSpacer(800, 1000, 0)).toBe(0);
  });

  it('returns the scroll delta needed to keep a target centered', () => {
    expect(getCenterAnchorAdjustment({ top: 450, height: 100 }, { top: 100, height: 800 })).toBe(0);
    expect(getCenterAnchorAdjustment({ top: 550, height: 100 }, { top: 100, height: 800 })).toBe(
      100
    );
    expect(getCenterAnchorAdjustment({ top: 350, height: 100 }, { top: 100, height: 800 })).toBe(
      -100
    );
  });
});
