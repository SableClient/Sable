export type TimelineAnchor =
  | { kind: 'none' }
  | { kind: 'bottom' }
  | { kind: 'message-center'; eventId: string };

export type TimelineScrollDirection = 'backward' | 'forward';

export type RectLike = Pick<DOMRectReadOnly, 'top' | 'height'>;

export const TIMELINE_BOTTOM_THRESHOLD_PX = 100;

export const getDistanceFromBottom = (
  scrollSize: number,
  scrollOffset: number,
  viewportSize: number
): number => Math.max(0, scrollSize - scrollOffset - viewportSize);

export const isTimelineAtBottom = (
  scrollSize: number,
  scrollOffset: number,
  viewportSize: number,
  threshold = TIMELINE_BOTTOM_THRESHOLD_PX
): boolean => getDistanceFromBottom(scrollSize, scrollOffset, viewportSize) < threshold;

export const getBottomClampSpacer = (
  viewportSize: number,
  scrollSize: number,
  currentSpacer: number
): number => {
  const contentHeight = Math.max(0, scrollSize - currentSpacer);
  return Math.max(0, viewportSize - contentHeight);
};

export const getCenterAnchorAdjustment = (targetRect: RectLike, viewportRect: RectLike): number => {
  const targetCenter = targetRect.top + targetRect.height / 2;
  const viewportCenter = viewportRect.top + viewportRect.height / 2;
  return targetCenter - viewportCenter;
};
