export type TimelineAnchorMode = 'bottom' | 'center' | 'free';

export type TimelineAnchor =
  | { kind: 'none' }
  | { kind: 'bottom' }
  | { kind: 'message-center'; eventId: string };

export type RectLike = Pick<DOMRectReadOnly, 'top' | 'height'>;

export type TimelineScrollSnapshot = {
  offset: number;
  previousOffset: number;
  scrollSize: number;
  viewportSize: number;
};

export type TimelinePaginationState = {
  canPaginateBack: boolean;
  backwardIdle: boolean;
  backwardArmed: boolean;
  liveTimelineLinked: boolean;
  forwardIdle: boolean;
  forwardArmed: boolean;
  jumpPending: boolean;
  focusPending: boolean;
};

export type TimelineScrollDecision = {
  anchorMode: TimelineAnchorMode;
  atBottom: boolean;
  paginateBackward: boolean;
  paginateForward: boolean;
  nextBackwardArmed: boolean;
  nextForwardArmed: boolean;
};

export const TIMELINE_BOTTOM_THRESHOLD_PX = 100;
export const TIMELINE_PAGINATION_THRESHOLD_PX = 500;
export const TIMELINE_PAGINATION_REARM_THRESHOLD_PX = 700;
export const TIMELINE_SCROLL_INTENT_DELTA_PX = 8;
export const TIMELINE_BOTTOM_RELEASE_DISTANCE_PX = 200;

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

export const releaseAnchorOnScroll = (
  anchorMode: TimelineAnchorMode,
  snapshot: TimelineScrollSnapshot
): TimelineAnchorMode => {
  const distanceFromBottom = getDistanceFromBottom(
    snapshot.scrollSize,
    snapshot.offset,
    snapshot.viewportSize
  );
  const userScrollingUp =
    snapshot.offset + TIMELINE_SCROLL_INTENT_DELTA_PX < snapshot.previousOffset;
  const userScrollingDown =
    snapshot.offset > snapshot.previousOffset + TIMELINE_SCROLL_INTENT_DELTA_PX;

  if (anchorMode === 'center') {
    if (userScrollingUp) return 'free';
    if (userScrollingDown) return 'free';
    return 'center';
  }

  if (anchorMode === 'bottom') {
    if (isTimelineAtBottom(snapshot.scrollSize, snapshot.offset, snapshot.viewportSize))
      return 'bottom';
    if (userScrollingUp && distanceFromBottom > TIMELINE_BOTTOM_RELEASE_DISTANCE_PX) return 'free';
    return 'bottom';
  }

  if (isTimelineAtBottom(snapshot.scrollSize, snapshot.offset, snapshot.viewportSize))
    return 'bottom';
  if (userScrollingUp) return 'free';
  return anchorMode;
};

export const getTimelineScrollDecision = (
  anchorMode: TimelineAnchorMode,
  snapshot: TimelineScrollSnapshot,
  pagination: TimelinePaginationState
): TimelineScrollDecision => {
  const nextAnchorMode = releaseAnchorOnScroll(anchorMode, snapshot);
  const atBottom = isTimelineAtBottom(snapshot.scrollSize, snapshot.offset, snapshot.viewportSize);
  const userScrollingUp =
    snapshot.offset + TIMELINE_SCROLL_INTENT_DELTA_PX < snapshot.previousOffset;
  const userScrollingDown =
    snapshot.offset > snapshot.previousOffset + TIMELINE_SCROLL_INTENT_DELTA_PX;
  const distanceFromBottom = getDistanceFromBottom(
    snapshot.scrollSize,
    snapshot.offset,
    snapshot.viewportSize
  );
  const nearBackwardEdge = snapshot.offset < TIMELINE_PAGINATION_THRESHOLD_PX;
  const nearForwardEdge = distanceFromBottom < TIMELINE_PAGINATION_THRESHOLD_PX;
  const backwardArmed =
    pagination.backwardArmed || snapshot.offset > TIMELINE_PAGINATION_REARM_THRESHOLD_PX;
  const forwardArmed =
    pagination.forwardArmed || distanceFromBottom > TIMELINE_PAGINATION_REARM_THRESHOLD_PX;
  const paginationBlocked =
    pagination.jumpPending || pagination.focusPending || nextAnchorMode === 'center';
  const paginateBackward =
    !paginationBlocked &&
    backwardArmed &&
    userScrollingUp &&
    nearBackwardEdge &&
    pagination.canPaginateBack &&
    pagination.backwardIdle;
  const paginateForward =
    !paginationBlocked &&
    forwardArmed &&
    userScrollingDown &&
    nearForwardEdge &&
    !pagination.liveTimelineLinked &&
    pagination.forwardIdle;

  return {
    anchorMode: nextAnchorMode,
    atBottom,
    paginateBackward,
    paginateForward,
    nextBackwardArmed: paginateBackward ? false : backwardArmed,
    nextForwardArmed: paginateForward ? false : forwardArmed,
  };
};
