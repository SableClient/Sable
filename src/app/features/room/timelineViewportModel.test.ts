import { describe, expect, it } from 'vitest';
import {
  getBottomClampSpacer,
  getCenterAnchorAdjustment,
  getTimelineVisibleRange,
  type TimelineViewportGeometry,
} from './timelineViewportModel';

const createGeometry = (
  offset: number,
  viewportSize: number,
  itemSize: number,
  itemCount: number
): TimelineViewportGeometry => ({
  scrollOffset: offset,
  scrollSize: itemSize * itemCount,
  viewportSize,
  findItemIndex: (itemOffset) =>
    Math.max(0, Math.min(itemCount - 1, Math.floor(itemOffset / itemSize))),
  getItemOffset: (index) => index * itemSize,
});

describe('timelineViewportModel', () => {
  it('derives visible virtual-list edges from item geometry', () => {
    expect(getTimelineVisibleRange(createGeometry(0, 200, 100, 5), 5)).toEqual({
      firstIndex: 0,
      lastIndex: 1,
      atStart: true,
      atEnd: false,
      atScrollEnd: false,
    });

    expect(getTimelineVisibleRange(createGeometry(300, 200, 100, 5), 5)).toEqual({
      firstIndex: 3,
      lastIndex: 4,
      atStart: false,
      atEnd: true,
      atScrollEnd: true,
    });
  });

  it('treats an empty list as both edges without inventing scroll distance', () => {
    expect(getTimelineVisibleRange(createGeometry(0, 800, 100, 0), 0)).toEqual({
      firstIndex: -1,
      lastIndex: -1,
      atStart: true,
      atEnd: true,
      atScrollEnd: true,
    });
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
