import { describe, expect, it } from 'vitest';
import {
  getBottomClampSpacer,
  getCenterAnchorAdjustment,
  getDistanceFromBottom,
  getTimelineScrollDecision,
  isTimelineAtBottom,
  releaseAnchorOnScroll,
} from './timelineViewportModel';

const basePagination = {
  canPaginateBack: true,
  backwardIdle: true,
  backwardArmed: true,
  liveTimelineLinked: true,
  forwardIdle: true,
  forwardArmed: true,
  jumpPending: false,
  focusPending: false,
};

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

  it('pins to bottom when the scroll snapshot is near latest', () => {
    expect(
      releaseAnchorOnScroll('free', {
        offset: 520,
        previousOffset: 300,
        scrollSize: 1200,
        viewportSize: 600,
      })
    ).toBe('bottom');
  });

  it('releases a center anchor after manual downward scroll', () => {
    expect(
      releaseAnchorOnScroll('center', {
        offset: 340,
        previousOffset: 300,
        scrollSize: 2000,
        viewportSize: 600,
      })
    ).toBe('free');
  });

  it('keeps a center anchor pinned even when the detached jump window is bottom-sized', () => {
    expect(
      releaseAnchorOnScroll('center', {
        offset: 400,
        previousOffset: 400,
        scrollSize: 1200,
        viewportSize: 800,
      })
    ).toBe('center');
  });

  it('requests backward pagination at the top edge', () => {
    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 120, previousOffset: 180, scrollSize: 3000, viewportSize: 700 },
        basePagination
      )
    ).toMatchObject({ anchorMode: 'free', paginateBackward: true, paginateForward: false });
  });

  it('disarms backward pagination after firing until the viewport leaves the edge', () => {
    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 120, previousOffset: 180, scrollSize: 3000, viewportSize: 700 },
        basePagination
      )
    ).toMatchObject({ paginateBackward: true, nextBackwardArmed: false });

    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 110, previousOffset: 120, scrollSize: 3000, viewportSize: 700 },
        { ...basePagination, backwardArmed: false }
      )
    ).toMatchObject({ paginateBackward: false, nextBackwardArmed: false });

    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 900, previousOffset: 110, scrollSize: 3000, viewportSize: 700 },
        { ...basePagination, backwardArmed: false }
      )
    ).toMatchObject({ paginateBackward: false, nextBackwardArmed: true });
  });

  it('does not request backward pagination for a stationary top-edge scroll event', () => {
    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 120, previousOffset: 120, scrollSize: 3000, viewportSize: 700 },
        basePagination
      )
    ).toMatchObject({ paginateBackward: false, paginateForward: false });
  });

  it('requests forward pagination at the bottom edge of a historical window', () => {
    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 1750, previousOffset: 1600, scrollSize: 3000, viewportSize: 800 },
        { ...basePagination, liveTimelineLinked: false }
      )
    ).toMatchObject({ paginateBackward: false, paginateForward: true });
  });

  it('disarms forward pagination after firing until the viewport leaves the edge', () => {
    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 1750, previousOffset: 1600, scrollSize: 3000, viewportSize: 800 },
        { ...basePagination, liveTimelineLinked: false }
      )
    ).toMatchObject({ paginateForward: true, nextForwardArmed: false });

    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 1780, previousOffset: 1750, scrollSize: 3000, viewportSize: 800 },
        { ...basePagination, liveTimelineLinked: false, forwardArmed: false }
      )
    ).toMatchObject({ paginateForward: false, nextForwardArmed: false });

    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 900, previousOffset: 1780, scrollSize: 3000, viewportSize: 800 },
        { ...basePagination, liveTimelineLinked: false, forwardArmed: false }
      )
    ).toMatchObject({ paginateForward: false, nextForwardArmed: true });
  });

  it('does not request forward pagination for a stationary bottom-edge scroll event', () => {
    expect(
      getTimelineScrollDecision(
        'free',
        { offset: 1750, previousOffset: 1750, scrollSize: 3000, viewportSize: 800 },
        { ...basePagination, liveTimelineLinked: false }
      )
    ).toMatchObject({ paginateBackward: false, paginateForward: false });
  });

  it('blocks edge pagination while a jump is pending', () => {
    expect(
      getTimelineScrollDecision(
        'center',
        { offset: 100, previousOffset: 100, scrollSize: 3000, viewportSize: 800 },
        { ...basePagination, liveTimelineLinked: false, jumpPending: true }
      )
    ).toMatchObject({ paginateBackward: false, paginateForward: false });
  });
});
