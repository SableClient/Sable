import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  canFitInScrollView,
  getScrollInfo,
  isInScrollView,
  isIntersectingScrollView,
} from '$utils/dom';
import { OnIntersectionCallback, useIntersectionObserver } from './useIntersectionObserver';

const PAGINATOR_ANCHOR_ATTR = 'data-paginator-anchor';

export enum Direction {
  Backward = 'B',
  Forward = 'F',
}

export type ItemRange = {
  start: number;
  end: number;
};

export type ScrollToOptions = {
  offset?: number;
  align?: 'start' | 'center' | 'end';
  behavior?: 'auto' | 'instant' | 'smooth';
  stopInView?: boolean;
};

/**
 * Scrolls the page to a specified element in the DOM.
 *
 * @param {HTMLElement} element - The DOM element to scroll to.
 * @param {ScrollToOptions} [opts] - Optional configuration for the scroll behavior (e.g., smooth scrolling, alignment).
 * @returns {boolean} - Returns `true` if the scroll was successful, otherwise returns `false`.
 */
export type ScrollToElement = (element: HTMLElement, opts?: ScrollToOptions) => boolean;

/**
 * Scrolls the page to an item at the specified index within a scrollable container.
 *
 * @param {number} index - The index of the item to scroll to.
 * @param {ScrollToOptions} [opts] - Optional configuration for the scroll behavior (e.g., smooth scrolling, alignment).
 * @returns {boolean} - Returns `true` if the scroll was successful, otherwise returns `false`.
 */
export type ScrollToItem = (index: number, opts?: ScrollToOptions) => boolean;

type HandleObserveAnchor = (element: HTMLElement | null) => void;

type VirtualPaginatorOptions<TScrollElement extends HTMLElement> = {
  count: number;
  limit: number;
  range: ItemRange;
  onRangeChange: (range: ItemRange) => void;
  getScrollElement: () => TScrollElement | null;
  getItemElement: (index: number) => HTMLElement | undefined;
  onEnd?: (back: boolean) => void;
};

type VirtualPaginator = {
  getItems: () => number[];
  scrollToElement: ScrollToElement;
  scrollToItem: ScrollToItem;
  observeBackAnchor: HandleObserveAnchor;
  observeFrontAnchor: HandleObserveAnchor;
};

const generateItems = (range: ItemRange) => {
  const items: number[] = [];
  for (let i = range.start; i < range.end; i += 1) {
    items.push(i);
  }

  return items;
};

const useObserveAnchorHandle = (
  intersectionObserver: ReturnType<typeof useIntersectionObserver>,
  anchorType: Direction
): HandleObserveAnchor =>
  useMemo<HandleObserveAnchor>(() => {
    let anchor: HTMLElement | null = null;
    return (element) => {
      if (element === anchor) return;
      if (anchor) intersectionObserver?.unobserve(anchor);
      if (!element) return;
      anchor = element;
      element.setAttribute(PAGINATOR_ANCHOR_ATTR, anchorType);
      intersectionObserver?.observe(element);
    };
  }, [intersectionObserver, anchorType]);

export const useVirtualPaginator = <TScrollElement extends HTMLElement>(
  options: VirtualPaginatorOptions<TScrollElement>
): VirtualPaginator => {
  const { count, limit, range, onRangeChange, getScrollElement, getItemElement, onEnd } = options;

  const initialRenderRef = useRef(true);

  const scrollToItemRef = useRef<{
    index: number;
    opts?: ScrollToOptions;
  }>();

  const propRef = useRef({
    range,
    limit,
    count,
  });
  propRef.current = {
    range,
    count,
    limit,
  };

  const getItems = useMemo(() => {
    const items = generateItems(range);
    return () => items;
  }, [range]);

  const scrollToElement = useCallback<ScrollToElement>(
    (element, opts) => {
      const scrollElement = getScrollElement();
      if (!scrollElement) return false;

      if (opts?.stopInView && isInScrollView(scrollElement, element)) {
        return false;
      }
      let scrollTo = element.offsetTop;
      if (opts?.align === 'center' && canFitInScrollView(scrollElement, element)) {
        const scrollInfo = getScrollInfo(scrollElement);
        scrollTo =
          element.offsetTop -
          Math.round(scrollInfo.viewHeight / 2) +
          Math.round(element.clientHeight / 2);
      } else if (opts?.align === 'end' && canFitInScrollView(scrollElement, element)) {
        const scrollInfo = getScrollInfo(scrollElement);
        scrollTo = element.offsetTop - Math.round(scrollInfo.viewHeight) + element.clientHeight;
      }

      scrollElement.scrollTo({
        top: scrollTo - (opts?.offset ?? 0),
        behavior: opts?.behavior,
      });
      return true;
    },
    [getScrollElement]
  );

  const scrollToItem = useCallback<ScrollToItem>(
    (index, opts) => {
      const { range: currentRange, limit: currentLimit, count: currentCount } = propRef.current;

      if (index < 0 || index >= currentCount) return false;
      // index is not in range change range
      // and trigger scrollToItem in layoutEffect hook
      if (index < currentRange.start || index >= currentRange.end) {
        onRangeChange({
          start: Math.max(index - currentLimit, 0),
          end: Math.min(index + currentLimit, currentCount),
        });
        scrollToItemRef.current = {
          index,
          opts,
        };
        return true;
      }

      // find target or it's previous rendered element to scroll to
      const targetItems = generateItems({ start: currentRange.start, end: index + 1 });
      const targetItem = targetItems.reverse().find((i) => getItemElement(i) !== undefined);
      const itemElement = targetItem && getItemElement(targetItem);

      if (!itemElement) {
        const scrollElement = getScrollElement();
        scrollElement?.scrollTo({
          top: opts?.offset ?? 0,
          behavior: opts?.behavior,
        });
        return true;
      }
      return scrollToElement(itemElement, opts);
    },
    [getScrollElement, scrollToElement, getItemElement, onRangeChange]
  );

  const paginate = useCallback(
    (direction: Direction) => {
      const { range: currentRange, limit: currentLimit, count: currentCount } = propRef.current;
      let { start, end } = currentRange;

      if (direction === Direction.Backward) {
        if (start === 0) {
          onEnd?.(true);
          return;
        }
        start = Math.max(start - currentLimit, 0);
        // Drop items from the far (forward) end to cap the window at 3x limit.
        // CSS scroll anchoring (overflow-anchor: auto) handles the scroll
        // position correction when items are prepended or removed below viewport.
        end = Math.min(end, start + currentLimit * 3);
      } else {
        if (end === currentCount) {
          onEnd?.(false);
          return;
        }
        end = Math.min(end + currentLimit, currentCount);
        // Drop items from the far (backward) end to cap the window at 3x limit.
        start = Math.max(start, end - currentLimit * 3);
      }

      onRangeChange({ start, end });
    },
    [onEnd, onRangeChange]
  );

  const handlePaginatorElIntersection: OnIntersectionCallback = useCallback(
    (entries) => {
      const anchorB = entries.find(
        (entry) => entry.target.getAttribute(PAGINATOR_ANCHOR_ATTR) === Direction.Backward
      );
      if (anchorB?.isIntersecting) {
        paginate(Direction.Backward);
      }
      const anchorF = entries.find(
        (entry) => entry.target.getAttribute(PAGINATOR_ANCHOR_ATTR) === Direction.Forward
      );
      if (anchorF?.isIntersecting) {
        paginate(Direction.Forward);
      }
    },
    [paginate]
  );

  const intersectionObserver = useIntersectionObserver(
    handlePaginatorElIntersection,
    useCallback(
      () => ({
        root: getScrollElement(),
      }),
      [getScrollElement]
    )
  );

  const observeBackAnchor = useObserveAnchorHandle(intersectionObserver, Direction.Backward);
  const observeFrontAnchor = useObserveAnchorHandle(intersectionObserver, Direction.Forward);

  // When scrollToItem index was not in range.
  // Scroll to item after range changes.
  useLayoutEffect(() => {
    if (scrollToItemRef.current === undefined) return;
    const { index, opts } = scrollToItemRef.current;
    scrollToItem(index, {
      ...opts,
      behavior: 'instant',
    });
    scrollToItemRef.current = undefined;
  }, [range, scrollToItem]);

  // Continue pagination to fill view height with scroll items
  // check if pagination anchor are in visible view height
  // and trigger pagination
  useEffect(() => {
    if (initialRenderRef.current) {
      // Do not trigger pagination on initial render
      // anchor intersection observable will trigger pagination on mount
      initialRenderRef.current = false;
      return;
    }
    const scrollElement = getScrollElement();
    if (!scrollElement) return;
    const backAnchor = scrollElement.querySelector<HTMLElement>(
      `[${PAGINATOR_ANCHOR_ATTR}="${Direction.Backward}"]`
    );
    const frontAnchor = scrollElement.querySelector<HTMLElement>(
      `[${PAGINATOR_ANCHOR_ATTR}="${Direction.Forward}"]`
    );

    if (backAnchor && isIntersectingScrollView(scrollElement, backAnchor)) {
      paginate(Direction.Backward);
      return;
    }
    if (frontAnchor && isIntersectingScrollView(scrollElement, frontAnchor)) {
      paginate(Direction.Forward);
    }
  }, [range, getScrollElement, paginate]);

  return {
    getItems,
    scrollToItem,
    scrollToElement,
    observeBackAnchor,
    observeFrontAnchor,
  };
};
