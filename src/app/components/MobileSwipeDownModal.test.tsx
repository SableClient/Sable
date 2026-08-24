import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PointerEventHandler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as css from '$features/room/message/styles.css';
import { MobileMenuItem } from './MobileMenuItem';
import {
  MobileSwipeDownModal,
  useMobileSheetClose,
  VIEWPORT_SETTLE_MS,
} from './MobileSwipeDownModal';

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [false, vi.fn<() => void>()],
}));

const setInnerHeight = (value: number) => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value });
};

/** use-gesture reads identifiers and page coords, so partial touches crash it. */
const touchList = (target: HTMLElement, clientY: number) => {
  const point = { identifier: 0, target, clientX: 0, clientY, pageX: 0, pageY: clientY };
  return { touches: [point], targetTouches: [point], changedTouches: [point] };
};

const dragDown = (target: HTMLElement, from: number, to: number) => {
  fireEvent.touchStart(target, touchList(target, from));
  fireEvent.touchMove(target, touchList(target, to));
  const released = touchList(target, to);
  fireEvent.touchEnd(target, { ...released, touches: [], targetTouches: [] });
};

const renderWithScroller = (requestClose: () => void) => {
  render(
    <MobileSwipeDownModal requestClose={requestClose}>
      {() => (
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
          <div data-testid="row" />
        </div>
      )}
    </MobileSwipeDownModal>
  );
  return { scroller: screen.getByTestId('scroller'), row: screen.getByTestId('row') };
};

function ContentCloseButton() {
  const close = useMobileSheetClose();
  return <button onClick={() => close?.()}>Close</button>;
}

/** jsdom reports zero for both, so a scroll container has to be declared. */
const makeScrollable = (element: HTMLElement, scrollTop: number) => {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 200 });
  element.scrollTop = scrollTop;
};

/** Completes the exit animation immediately, so a dismissal reaches `requestClose`. */
const finishingAnimate = (() => ({
  addEventListener: (_event: string, callback: () => void) => callback(),
})) as unknown as HTMLElement['animate'];

/** jsdom implements neither of these, and the sheet drives both. */
function stubElementAnimations(animate: HTMLElement['animate'] = finishingAnimate) {
  const descriptors = (['getAnimations', 'animate'] as const).map(
    (key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const
  );
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });

  return () => {
    descriptors.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>)[key];
    });
  };
}

/**
 * Drives the visual viewport the way a soft keyboard does. The sheet only acts on a
 * settled measurement, so `emitResize` (notify only) and `resizeTo` (notify, then let
 * the settle elapse) are deliberately separate.
 */
function mockVisualViewport(height: number) {
  const originalViewport = window.visualViewport;
  const originalInnerHeight = window.innerHeight;
  const restoreAnimations = stubElementAnimations();
  const listeners = new Set<() => void>();
  const viewport = {
    height,
    offsetTop: 0,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };

  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  vi.useFakeTimers();

  const emitResize = (next: number, offsetTop = viewport.offsetTop) => {
    viewport.height = next;
    viewport.offsetTop = offsetTop;
    act(() => listeners.forEach((listener) => listener()));
  };

  return {
    emitResize,
    /** Advances exactly the settle window, so a longer one would fail the test. */
    resizeTo(next: number, offsetTop?: number) {
      emitResize(next, offsetTop);
      act(() => vi.advanceTimersByTime(VIEWPORT_SETTLE_MS));
    },
    rotate(nextInnerHeight: number) {
      // `innerHeight` still reports the pre-rotation size when this event fires;
      // the new size only lands with the resize that follows.
      act(() => window.dispatchEvent(new Event('orientationchange')));
      setInnerHeight(nextInnerHeight);
      emitResize(nextInnerHeight);
      act(() => vi.advanceTimersByTime(VIEWPORT_SETTLE_MS));
    },
    restore() {
      vi.useRealTimers();
      restoreAnimations();
      setInnerHeight(originalInnerHeight);
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: originalViewport,
      });
    },
  };
}

describe('MobileSwipeDownModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders immediately without a mount delay', () => {
    render(
      <MobileSwipeDownModal requestClose={vi.fn<() => void>()}>
        {() => <div data-testid="immediate-content" />}
      </MobileSwipeDownModal>
    );

    expect(screen.getByTestId('immediate-content')).toBeInTheDocument();
  });

  it('applies sheetStyle to the panel', () => {
    render(
      <MobileSwipeDownModal
        requestClose={vi.fn<() => void>()}
        sheetClassName="styled-sheet"
        sheetStyle={{ backgroundColor: '#663399' }}
      >
        {() => <div data-testid="styled-content" />}
      </MobileSwipeDownModal>
    );

    const panel = screen.getByTestId('styled-content').closest('.styled-sheet');
    expect(panel).toHaveStyle({ backgroundColor: '#663399' });
  });

  it('can overlay the drag handle without reserving a header row', () => {
    render(
      <MobileSwipeDownModal requestClose={vi.fn<() => void>()} overlayDragHandle>
        {() => <div data-testid="under-handle-content" />}
      </MobileSwipeDownModal>
    );

    expect(screen.getByTestId('mobile-sheet-drag-handle')).toHaveStyle({
      position: 'absolute',
      top: '0px',
    });
    expect(screen.getByTestId('under-handle-content').parentElement?.parentElement).toHaveStyle({
      overflow: 'hidden',
    });
  });

  it('lifts the sheet clear of the keyboard with a transition, without resizing it', () => {
    const viewport = mockVisualViewport(800);
    let contentRenderCount = 0;

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware
          sheetClassName="picker-sheet"
        >
          {() => {
            contentRenderCount += 1;
            return <div data-testid="stable-content" />;
          }}
        </MobileSwipeDownModal>
      );

      const panel = screen.getByTestId('stable-content').closest('.picker-sheet') as HTMLElement;

      viewport.resizeTo(500);

      // The height itself is CSS-owned (see pickerHeight); what the component must
      // get right is the variables feeding it, and lifting rather than resizing.
      expect(panel.style.transform).toBe('translate3d(0, -300px, 0)');
      expect(panel.style.transition).toContain('transform');
      expect(panel.style.getPropertyValue('--mobile-sheet-viewport')).toBe('800px');
      expect(panel.style.getPropertyValue('--mobile-sheet-visible')).toBe('500px');
      expect(panel.style.getPropertyValue('--mobile-sheet-safe-bottom')).toBe('0px');
      expect(contentRenderCount).toBe(1);
    } finally {
      viewport.restore();
    }
  });

  it('lifts clear of the keyboard without being asked to', () => {
    const viewport = mockVisualViewport(800);

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal requestClose={vi.fn<() => void>()} sheetClassName="default-sheet">
          {() => <div data-testid="default-content" />}
        </MobileSwipeDownModal>
      );

      const panel = screen.getByTestId('default-content').closest('.default-sheet') as HTMLElement;

      viewport.resizeTo(500);

      expect(panel.style.transform).toBe('translate3d(0, -300px, 0)');
    } finally {
      viewport.restore();
    }
  });

  it('stays put for a sheet that opts out', () => {
    const viewport = mockVisualViewport(800);

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware={false}
          sheetClassName="opted-out-sheet"
        >
          {() => <div data-testid="opted-out-content" />}
        </MobileSwipeDownModal>
      );

      const panel = screen
        .getByTestId('opted-out-content')
        .closest('.opted-out-sheet') as HTMLElement;

      viewport.resizeTo(500);

      expect(panel.style.transform).toBe('');
    } finally {
      viewport.restore();
    }
  });

  it('ignores the transient where only the visual viewport has shrunk', () => {
    const viewport = mockVisualViewport(807);

    try {
      setInnerHeight(807);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware
          sheetClassName="transient-sheet"
        >
          {() => <div data-testid="transient-content" />}
        </MobileSwipeDownModal>
      );

      const panel = screen
        .getByTestId('transient-content')
        .closest('.transient-sheet') as HTMLElement;

      // Stage one: the visual viewport shrinks alone and momentarily looks like a
      // keyboard worth lifting over. Stage two lands before the settle elapses.
      viewport.emitResize(517);
      // Bounds hardcoded on purpose: a longer settle would stop tracking the
      // keyboard, a shorter one would act on the half-shrunk viewport.
      act(() => vi.advanceTimersByTime(VIEWPORT_SETTLE_MS - 1));
      expect(panel.style.transform).toBe('');
      act(() => vi.advanceTimersByTime(1));
      expect(VIEWPORT_SETTLE_MS).toBeLessThanOrEqual(250);
      expect(VIEWPORT_SETTLE_MS).toBeGreaterThanOrEqual(120);

      setInnerHeight(516);
      viewport.resizeTo(517);

      // The layout viewport shrank too, so `bottom: 0` already sits the sheet right.
      expect(panel.style.transform).toBe('');
      expect(panel.style.getPropertyValue('--mobile-sheet-viewport')).toBe('807px');
    } finally {
      viewport.restore();
    }
  });

  it('keeps its size when the platform shrinks the layout viewport for the keyboard', () => {
    const viewport = mockVisualViewport(800);

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware
          sheetClassName="resized-sheet"
        >
          {() => <div data-testid="resized-content" />}
        </MobileSwipeDownModal>
      );

      const panel = screen.getByTestId('resized-content').closest('.resized-sheet') as HTMLElement;
      expect(panel.style.getPropertyValue('--mobile-sheet-viewport')).toBe('800px');

      setInnerHeight(480);
      viewport.resizeTo(480);

      // Nothing to lift over, and the sheet must not follow the shrink.
      expect(panel.style.transform).toBe('');
      expect(panel.style.getPropertyValue('--mobile-sheet-viewport')).toBe('800px');
    } finally {
      viewport.restore();
    }
  });

  it('ignores drags once closing, so the exit animation still unmounts the sheet', async () => {
    const requestClose = vi.fn<() => void>();
    const running: { cancel: ReturnType<typeof vi.fn> }[] = [];
    let finish: (() => void) | undefined;
    const originalGetAnimations = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getAnimations'
    );
    const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value: () => running,
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => {
        const animation = {
          cancel: vi.fn<() => void>(),
          addEventListener: (_event: string, callback: () => void) => {
            finish = callback;
          },
        };
        running.push(animation);
        return animation;
      },
    });

    try {
      render(
        <MobileSwipeDownModal requestClose={requestClose}>
          {() => <div data-testid="closing-content" />}
        </MobileSwipeDownModal>
      );
      await act(async () => {});

      const handle = screen.getByTestId('mobile-sheet-drag-handle');
      const panel = handle.parentElement as HTMLElement;
      const scrim = panel.parentElement as HTMLElement;

      fireEvent.click(scrim);
      const closeAnimation = running.at(-1)!;

      // Cancelling the exit animation would strip its `finish` listener, which is
      // the only thing that unmounts the sheet, leaving an invisible scrim.
      dragDown(handle, 100, 300);

      expect(closeAnimation.cancel).not.toHaveBeenCalled();
      expect(panel.style.transform).toBe('');

      finish?.();
      expect(requestClose).toHaveBeenCalledTimes(1);
    } finally {
      if (originalGetAnimations) {
        Object.defineProperty(HTMLElement.prototype, 'getAnimations', originalGetAnimations);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
      }
      if (originalAnimate) {
        Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
      }
    }
  });

  it('animates a close requested by sheet content', async () => {
    const requestClose = vi.fn<() => void>();
    let finish: (() => void) | undefined;
    const restore = stubElementAnimations((() => ({
      addEventListener: (_event: string, callback: () => void) => {
        finish = callback;
      },
    })) as unknown as HTMLElement['animate']);

    try {
      render(
        <MobileSwipeDownModal requestClose={requestClose}>
          {() => <ContentCloseButton />}
        </MobileSwipeDownModal>
      );
      await act(async () => {});

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(requestClose).not.toHaveBeenCalled();
      finish?.();
      expect(requestClose).toHaveBeenCalledOnce();
    } finally {
      restore();
    }
  });

  describe('dragging the body', () => {
    it('activates a marked menu item exactly once with small jitter', async () => {
      const requestClose = vi.fn<() => void>();
      const activate = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        render(
          <MobileSwipeDownModal requestClose={requestClose}>
            {() => (
              <MobileMenuItem isMobile onClick={activate} data-testid="marked-menu-item">
                Leave Room
              </MobileMenuItem>
            )}
          </MobileSwipeDownModal>
        );
        await act(async () => {});

        const button = screen.getByTestId('marked-menu-item');
        const panel = button.parentElement?.parentElement as HTMLElement;
        const pointer = {
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: 0,
          clientY: 100,
          timeStamp: 100,
        };

        fireEvent.pointerDown(button, pointer);
        fireEvent.pointerMove(button, { ...pointer, clientY: 102, timeStamp: 105 });
        fireEvent.pointerUp(button, { ...pointer, clientY: 102, timeStamp: 110 });
        fireEvent.click(button, { pointerType: 'touch' });

        expect(activate).toHaveBeenCalledTimes(1);
        expect(requestClose).not.toHaveBeenCalled();
        expect(panel.style.transform).toBe('');
      } finally {
        restore();
      }
    });

    it('does not translate or dismiss when dragging a marked menu item', async () => {
      const requestClose = vi.fn<() => void>();
      const activate = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        render(
          <MobileSwipeDownModal requestClose={requestClose}>
            {() => (
              <MobileMenuItem isMobile onClick={activate} data-testid="marked-menu-item">
                Leave Room
              </MobileMenuItem>
            )}
          </MobileSwipeDownModal>
        );
        await act(async () => {});

        const button = screen.getByTestId('marked-menu-item');
        const panel = button.parentElement?.parentElement as HTMLElement;
        dragDown(button, 100, 240);

        expect(activate).not.toHaveBeenCalled();
        expect(requestClose).not.toHaveBeenCalled();
        expect(panel.style.transform).toBe('');
      } finally {
        restore();
      }
    });

    it('dismisses when the list inside is already at the top', async () => {
      const requestClose = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        const { scroller, row } = renderWithScroller(requestClose);
        await act(async () => {});
        makeScrollable(scroller, 0);

        dragDown(row, 100, 240);

        expect(requestClose).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    });

    it('leaves the gesture to a list that is scrolled away from the top', async () => {
      const requestClose = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        const { scroller, row } = renderWithScroller(requestClose);
        await act(async () => {});
        const panel = scroller.parentElement?.parentElement as HTMLElement;
        makeScrollable(scroller, 120);

        dragDown(row, 100, 240);

        expect(requestClose).not.toHaveBeenCalled();
        expect(panel.style.transform).toBe('');
      } finally {
        restore();
      }
    });

    it('leaves the gesture to an outer list scrolled away from the top', async () => {
      const requestClose = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        render(
          <MobileSwipeDownModal requestClose={requestClose}>
            {() => (
              <div data-testid="outer-scroller" style={{ overflowY: 'auto' }}>
                <div data-testid="inner-scroller" style={{ overflowY: 'auto' }}>
                  <div data-testid="scroll-row" />
                </div>
              </div>
            )}
          </MobileSwipeDownModal>
        );
        await act(async () => {});
        makeScrollable(screen.getByTestId('outer-scroller'), 120);
        makeScrollable(screen.getByTestId('inner-scroller'), 0);

        dragDown(screen.getByTestId('scroll-row'), 100, 240);

        expect(requestClose).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('keeps refusing right after a list handed back the gesture', async () => {
      const requestClose = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        const { scroller, row } = renderWithScroller(requestClose);
        await act(async () => {});
        makeScrollable(scroller, 120);

        // First gesture is refused because the list is scrolled.
        dragDown(row, 100, 240);
        // The fling lands at the top; a drag started immediately after must still be
        // the list's, or the sheet snatches the tail of a scroll.
        scroller.scrollTop = 0;
        dragDown(row, 100, 240);

        expect(requestClose).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('leaves the gesture alone while text is selected', async () => {
      const requestClose = vi.fn<() => void>();
      const restore = stubElementAnimations();
      const selection = { toString: () => 'selected text' } as Selection;
      vi.spyOn(window, 'getSelection').mockReturnValue(selection);

      try {
        const { scroller, row } = renderWithScroller(requestClose);
        await act(async () => {});
        makeScrollable(scroller, 0);

        // Dragging out a selection must not also drag the sheet away.
        dragDown(row, 100, 240);

        expect(requestClose).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it('still drags from the handle while the list is scrolled', async () => {
      const requestClose = vi.fn<() => void>();
      const restore = stubElementAnimations();

      try {
        const { scroller, row } = renderWithScroller(requestClose);
        await act(async () => {});
        makeScrollable(scroller, 500);

        // Refused first, which arms the cooldown. The handle must be exempt from it,
        // or grabbing the handle right after a scroll would do nothing.
        dragDown(row, 100, 240);
        expect(requestClose).not.toHaveBeenCalled();

        dragDown(screen.getByTestId('mobile-sheet-drag-handle'), 100, 240);

        expect(requestClose).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    });
  });

  it('accounts for a visual viewport scrolled under the keyboard', () => {
    const viewport = mockVisualViewport(800);

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware
          sheetClassName="offset-sheet"
        >
          {() => <div data-testid="offset-content" />}
        </MobileSwipeDownModal>
      );

      const panel = screen.getByTestId('offset-content').closest('.offset-sheet') as HTMLElement;

      // iOS scrolls the visual viewport rather than only shrinking it, so the
      // covered strip is innerHeight - offsetTop - height, not innerHeight - height.
      viewport.resizeTo(500, 60);

      expect(panel.style.transform).toBe('translate3d(0, -240px, 0)');
    } finally {
      viewport.restore();
    }
  });

  it('re-measures after rotation instead of keeping the latched height', () => {
    const viewport = mockVisualViewport(800);

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware
          sheetClassName="rotated-sheet"
        >
          {() => <div data-testid="rotated-content" />}
        </MobileSwipeDownModal>
      );

      const panel = screen.getByTestId('rotated-content').closest('.rotated-sheet') as HTMLElement;
      expect(panel.style.getPropertyValue('--mobile-sheet-viewport')).toBe('800px');

      // The latch is monotonic, so without a reset landscape would keep the taller
      // portrait height forever.
      viewport.rotate(400);

      expect(panel.style.getPropertyValue('--mobile-sheet-viewport')).toBe('400px');
    } finally {
      viewport.restore();
    }
  });

  it('composes the drag offset with the keyboard offset in one transform', () => {
    const viewport = mockVisualViewport(800);

    try {
      setInnerHeight(800);
      render(
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          keyboardAware
          sheetClassName="composed-sheet"
        >
          {() => <div data-testid="composed-content" />}
        </MobileSwipeDownModal>
      );
      viewport.resizeTo(500);

      const panel = screen
        .getByTestId('composed-content')
        .closest('.composed-sheet') as HTMLElement;
      const handle = screen.getByTestId('mobile-sheet-drag-handle');
      expect(panel.style.transform).toBe('translate3d(0, -300px, 0)');

      // Dragging down while lifted must subtract from the keyboard offset rather
      // than clobber it. Both live on the same transform.
      fireEvent.touchStart(handle, touchList(handle, 100));
      fireEvent.touchMove(handle, touchList(handle, 115));
      expect(panel.style.transform).toBe('translate3d(0, -286px, 0)');
      expect(panel.style.transition).toBe('');

      // Released under the dismiss thresholds: springs back to the lifted position.
      const released = touchList(handle, 115);
      fireEvent.touchEnd(handle, { ...released, touches: [], targetTouches: [] });
      expect(panel.style.transform).toBe('translate3d(0, -300px, 0)');
      expect(panel.style.transition).toContain('transform');
    } finally {
      viewport.restore();
    }
  });

  it('uses the supplied portal target instead of document.body', async () => {
    const portalTarget = document.createElement('div');
    portalTarget.dataset.testid = 'portal-target';
    document.body.append(portalTarget);
    render(
      <MobileSwipeDownModal
        requestClose={vi.fn<() => void>()}
        containerRef={{ current: portalTarget }}
      >
        {() => <div data-testid="portal-content" />}
      </MobileSwipeDownModal>
    );
    await act(async () => {});

    const target = screen.getByTestId('portal-target');
    expect(target).toContainElement(screen.getByTestId('portal-content'));
  });

  it('contains a custom-target sheet within the active pane', async () => {
    const portalTarget = document.createElement('div');
    portalTarget.dataset.testid = 'contained-pane';
    document.body.append(portalTarget);

    render(
      <MobileSwipeDownModal
        requestClose={vi.fn<() => void>()}
        containerRef={{ current: portalTarget }}
      >
        {() => <div data-testid="contained-content" />}
      </MobileSwipeDownModal>
    );
    await act(async () => {});

    const content = screen.getByTestId('contained-content');
    const panel = content.parentElement?.parentElement as HTMLElement;
    const scrim = portalTarget.firstElementChild as HTMLElement;

    expect(scrim.parentElement).toBe(portalTarget);
    expect(scrim.classList).toContain(css.MessageMobileOptionsWrappedContained);
    expect(panel.classList).toContain(css.MessageMobileOptionsContainerContained);
  });

  it('shields panel pointer events from the portal host', async () => {
    const onPointerDown = vi.fn<PointerEventHandler<HTMLDivElement>>();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);
    render(
      <div onPointerDown={onPointerDown}>
        <MobileSwipeDownModal
          requestClose={vi.fn<() => void>()}
          containerRef={{ current: portalTarget }}
        >
          {() => <div data-testid="shielded-content" />}
        </MobileSwipeDownModal>
      </div>
    );
    await act(async () => {});
    fireEvent.pointerDown(screen.getByTestId('shielded-content'));

    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it('dismisses from the drag handle', async () => {
    const requestClose = vi.fn<() => void>();
    const animations: Keyframe[][] = [];
    const restoreAnimations = stubElementAnimations(((keyframes: Keyframe[]) => {
      animations.push(keyframes);
      return { addEventListener: (_event: string, callback: () => void) => callback() };
    }) as unknown as HTMLElement['animate']);

    try {
      render(
        <MobileSwipeDownModal requestClose={requestClose}>
          {() => <div data-testid="swipe-content" />}
        </MobileSwipeDownModal>
      );
      await act(async () => {});

      const handle = screen.getByTestId('mobile-sheet-drag-handle');
      dragDown(handle, 100, 240);

      expect(requestClose).toHaveBeenCalledTimes(1);
      expect(animations.at(-1)).toEqual([
        { transform: 'translate3d(0, 139px, 0)' },
        { transform: 'translate3d(0, 100%, 0)' },
      ]);
    } finally {
      restoreAnimations();
    }
  });
});
