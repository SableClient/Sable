import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeableOverlayWrapper } from './SwipeableOverlayWrapper';

vi.mock('$utils/platform', () => ({
  isMobileOrTablet: () => true,
}));

const touchList = (target: HTMLElement, clientX: number, clientY: number) => {
  const point = { identifier: 0, target, clientX, clientY, pageX: clientX, pageY: clientY };
  return { touches: [point], targetTouches: [point], changedTouches: [point] };
};

function renderWrapper(direction: 'left' | 'right' | 'both', onClose: () => void) {
  render(
    <SwipeableOverlayWrapper direction={direction} onClose={onClose}>
      <div data-testid="content" />
    </SwipeableOverlayWrapper>
  );
  return screen.getByTestId('content');
}

describe('SwipeableOverlayWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('closes after a single horizontal move past the distance threshold', async () => {
    const onClose = vi.fn<() => void>();
    const content = renderWrapper('both', onClose);

    fireEvent.touchStart(content, touchList(content, 260, 100));
    fireEvent.touchMove(content, touchList(content, 100, 100));
    fireEvent.touchEnd(content, {
      ...touchList(content, 100, 100),
      touches: [],
      targetTouches: [],
    });

    const panel = content.parentElement as HTMLElement;
    expect(panel.style.transform).toBe('translate3d(-320px, 0, 0)');
    act(() => vi.advanceTimersByTime(220));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves a vertical member-list scroll alone', () => {
    const onClose = vi.fn<() => void>();
    const content = renderWrapper('both', onClose);

    fireEvent.touchStart(content, touchList(content, 160, 100));
    fireEvent.touchMove(content, touchList(content, 165, 260));
    fireEvent.touchEnd(content, {
      ...touchList(content, 165, 260),
      touches: [],
      targetTouches: [],
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close a cancelled horizontal gesture', () => {
    const onClose = vi.fn<() => void>();
    const content = renderWrapper('both', onClose);

    fireEvent.touchStart(content, touchList(content, 260, 100));
    fireEvent.touchMove(content, touchList(content, 100, 100));
    fireEvent.touchCancel(content, { touches: [], targetTouches: [] });

    expect(onClose).not.toHaveBeenCalled();
    const panel = content.parentElement as HTMLElement;
    expect(panel.style.transform).toBe('translate3d(0px, 0, 0)');
  });

  it('does not close on a disallowed swipe direction', () => {
    const onClose = vi.fn<() => void>();
    const content = renderWrapper('right', onClose);

    fireEvent.touchStart(content, touchList(content, 260, 100));
    fireEvent.touchMove(content, touchList(content, 100, 100));
    fireEvent.touchEnd(content, {
      ...touchList(content, 100, 100),
      touches: [],
      targetTouches: [],
    });

    act(() => vi.advanceTimersByTime(220));
    expect(onClose).not.toHaveBeenCalled();
  });
});
