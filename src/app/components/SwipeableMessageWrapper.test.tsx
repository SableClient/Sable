import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeableMessageWrapper } from './SwipeableMessageWrapper';

vi.mock('$utils/platform', () => ({
  isMobileOrTablet: () => true,
}));

vi.mock('$utils/haptics', () => ({
  haptic: vi.fn<(kind?: 'light' | 'medium' | 'heavy' | 'selection') => void>(),
}));

const touchList = (target: HTMLElement, clientX: number, clientY: number) => {
  const point = { identifier: 0, target, clientX, clientY, pageX: clientX, pageY: clientY };
  return { touches: [point], targetTouches: [point], changedTouches: [point] };
};

// Rendered without MobileNavDrawerContext, which is the tablet and iPadOS-fullscreen
// case: no nav drawer coordinates the touch, so the message tracks it itself.
function renderWrapper(onReply: () => void) {
  render(
    <SwipeableMessageWrapper onReply={onReply}>
      <div data-testid="content" />
    </SwipeableMessageWrapper>
  );
  return screen.getByTestId('content').closest('[data-message-swipe]') as HTMLElement;
}

describe('SwipeableMessageWrapper without a nav drawer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('replies after a leftward swipe past the threshold', () => {
    const onReply = vi.fn<() => void>();
    const container = renderWrapper(onReply);

    fireEvent.touchStart(container, touchList(container, 200, 100));
    fireEvent.touchMove(container, touchList(container, 100, 100));
    fireEvent.touchEnd(container, {
      ...touchList(container, 100, 100),
      touches: [],
      targetTouches: [],
    });

    expect(onReply).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(220));
  });

  it('leaves a vertical scroll alone', () => {
    const onReply = vi.fn<() => void>();
    const container = renderWrapper(onReply);

    fireEvent.touchStart(container, touchList(container, 200, 100));
    fireEvent.touchMove(container, touchList(container, 205, 260));
    fireEvent.touchEnd(container, {
      ...touchList(container, 205, 260),
      touches: [],
      targetTouches: [],
    });

    expect(onReply).not.toHaveBeenCalled();
  });

  it('does not reply on a rightward swipe', () => {
    const onReply = vi.fn<() => void>();
    const container = renderWrapper(onReply);

    fireEvent.touchStart(container, touchList(container, 100, 100));
    fireEvent.touchMove(container, touchList(container, 220, 100));
    fireEvent.touchEnd(container, {
      ...touchList(container, 220, 100),
      touches: [],
      targetTouches: [],
    });

    expect(onReply).not.toHaveBeenCalled();
  });

  it('does not reply on a cancelled gesture', () => {
    const onReply = vi.fn<() => void>();
    const container = renderWrapper(onReply);

    fireEvent.touchStart(container, touchList(container, 200, 100));
    fireEvent.touchMove(container, touchList(container, 100, 100));
    fireEvent.touchCancel(container, { touches: [], targetTouches: [] });

    expect(onReply).not.toHaveBeenCalled();
  });

  it('does not reply when a second finger joins mid-gesture', () => {
    const onReply = vi.fn<() => void>();
    const container = renderWrapper(onReply);

    fireEvent.touchStart(container, touchList(container, 200, 100));
    fireEvent.touchMove(container, touchList(container, 100, 100));

    const first = { identifier: 0, target: container, clientX: 100, clientY: 100 };
    const second = { identifier: 1, target: container, clientX: 140, clientY: 140 };
    fireEvent.touchStart(container, { touches: [first, second], targetTouches: [first, second] });
    fireEvent.touchEnd(container, { touches: [], targetTouches: [] });

    expect(onReply).not.toHaveBeenCalled();
  });
});
