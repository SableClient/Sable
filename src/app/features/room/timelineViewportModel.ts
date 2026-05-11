export type TimelineAnchor =
  | { kind: 'none' }
  | { kind: 'bottom' }
  | { kind: 'message-center'; eventId: string };

export type TimelineScrollDirection = 'backward' | 'forward';

export type RectLike = Pick<DOMRectReadOnly, 'top' | 'height'>;

export type TimelineViewportGeometry = {
  scrollOffset: number;
  scrollSize: number;
  viewportSize: number;
  findItemIndex: (offset: number) => number;
  getItemOffset: (index: number) => number;
};

export type TimelineVisibleRange = {
  firstIndex: number;
  lastIndex: number;
  atStart: boolean;
  atEnd: boolean;
  atScrollEnd: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const getTimelineVisibleRange = (
  viewport: TimelineViewportGeometry,
  itemCount: number,
  offset = viewport.scrollOffset
): TimelineVisibleRange => {
  if (itemCount <= 0) {
    return {
      firstIndex: -1,
      lastIndex: -1,
      atStart: true,
      atEnd: true,
      atScrollEnd: true,
    };
  }

  const maxIndex = itemCount - 1;
  const scrollEnd = offset + viewport.viewportSize;
  const maxScrollOffset = Math.max(0, viewport.scrollSize - viewport.viewportSize);
  const firstIndex = clamp(viewport.findItemIndex(offset), 0, maxIndex);
  let lastIndex = clamp(
    viewport.findItemIndex(Math.min(scrollEnd, viewport.scrollSize)),
    firstIndex,
    maxIndex
  );
  while (lastIndex > firstIndex && viewport.getItemOffset(lastIndex) >= scrollEnd) {
    lastIndex -= 1;
  }

  return {
    firstIndex,
    lastIndex,
    atStart: firstIndex === 0,
    atEnd: lastIndex === maxIndex,
    atScrollEnd: offset >= maxScrollOffset,
  };
};

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
