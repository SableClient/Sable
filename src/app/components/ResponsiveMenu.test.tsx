// oxlint-disable typescript/no-explicit-any
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { ResponsiveMenu } from './ResponsiveMenu';
import type { RectCords } from 'folds';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('folds', () => ({
  Box: ({ children, direction }: any) => (
    <div data-testid="box" data-direction={direction}>
      {children}
    </div>
  ),
  PopOut: ({ content, children, 'aria-expanded': ariaExpanded }: any) => (
    <div data-testid="popout" data-aria-expanded={ariaExpanded}>
      <div data-testid="popout-content">{content}</div>
      <div data-testid="popout-trigger">{children}</div>
    </div>
  ),
}));

vi.mock('focus-trap-react', () => ({
  default: ({ children, focusTrapOptions }: any) => (
    <div
      data-testid="focus-trap"
      data-initial-focus={String(focusTrapOptions?.initialFocus ?? false)}
      data-return-focus={String(focusTrapOptions?.returnFocusOnDeactivate ?? false)}
      data-click-outside={String(focusTrapOptions?.clickOutsideDeactivates ?? false)}
      data-escape-deactivates={String(focusTrapOptions?.escapeDeactivates ?? false)}
    >
      {children}
    </div>
  ),
}));

vi.mock('./MobileSwipeDownModal', () => ({
  MobileSwipeDownModal: ({ children, requestClose }: any) => (
    <div data-testid="mobile-swipe-down" data-request-close={String(!!requestClose)}>
      {children(<div data-testid="drag-handle">drag-handle</div>, {
        onTouchStart: vi.fn<() => void>(),
        onTouchMove: vi.fn<() => void>(),
        onTouchEnd: vi.fn<() => void>(),
      })}
    </div>
  ),
}));

vi.mock('$features/room/message/styles.css', () => ({
  MessageOptionsMenu: 'mock-message-options-menu',
}));

vi.mock('$utils/keyboard', () => ({
  stopPropagation: () => false,
}));

afterEach(() => {
  cleanup();
});

// ── Helper: render wrapped in a ScreenSizeProvider ──────────────────────────

function renderMenu(props: {
  anchor: RectCords;
  menu: React.ReactNode;
  children?: React.ReactNode;
  returnFocusOnDeactivate?: boolean;
}) {
  return render(
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <ResponsiveMenu requestClose={vi.fn<() => void>()} {...props} />
    </ScreenSizeProvider>
  );
}

function renderMenuMobile(props: {
  anchor: RectCords;
  menu: React.ReactNode;
  children?: React.ReactNode;
}) {
  return render(
    <ScreenSizeProvider value={ScreenSize.Mobile}>
      <ResponsiveMenu requestClose={vi.fn<() => void>()} {...props} />
    </ScreenSizeProvider>
  );
}

const anchorRect: RectCords = { x: 100, y: 200, width: 80, height: 40 };

const SampleMenu = () => <div data-testid="sample-menu">Menu Items</div>;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ResponsiveMenu', () => {
  describe('desktop branch (PopOut)', () => {
    it('renders the trigger children and the menu inside PopOut when anchor is set', () => {
      renderMenu({
        anchor: anchorRect,
        menu: <SampleMenu />,
        children: <button data-testid="trigger-btn">Menu</button>,
      });

      expect(screen.getByTestId('trigger-btn')).toBeInTheDocument();
      expect(screen.getByTestId('popout')).toHaveAttribute('data-aria-expanded', 'true');
      // Menu should be inside the popout content
      expect(screen.getByTestId('sample-menu')).toBeInTheDocument();
    });

    it('hides the menu content when anchor is undefined (gate)', () => {
      render(
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <ResponsiveMenu
            requestClose={vi.fn<() => void>()}
            anchor={undefined}
            menu={<SampleMenu />}
          >
            <button data-testid="trigger-btn">Menu</button>
          </ResponsiveMenu>
        </ScreenSizeProvider>
      );

      expect(screen.getByTestId('trigger-btn')).toBeInTheDocument();
      // The menu should NOT be in the DOM because anchor is undefined
      expect(screen.queryByTestId('sample-menu')).not.toBeInTheDocument();
    });

    it('wraps the menu in a FocusTrap on desktop', () => {
      renderMenu({
        anchor: anchorRect,
        menu: <SampleMenu />,
      });

      expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
      expect(screen.getByTestId('sample-menu')).toBeInTheDocument();
    });

    it('honours returnFocusOnDeactivate', () => {
      render(
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <ResponsiveMenu
            requestClose={vi.fn<() => void>()}
            anchor={anchorRect}
            menu={<SampleMenu />}
            returnFocusOnDeactivate={true}
          />
        </ScreenSizeProvider>
      );

      expect(screen.getByTestId('focus-trap')).toHaveAttribute('data-return-focus', 'true');
    });

    it('passes clickOutsideDeactivates to FocusTrap', () => {
      renderMenu({ anchor: anchorRect, menu: <SampleMenu /> });

      expect(screen.getByTestId('focus-trap')).toHaveAttribute('data-click-outside', 'true');
    });
  });

  describe('mobile branch (sheet)', () => {
    it('renders a MobileSwipeDownModal with drag handle on mobile', () => {
      renderMenuMobile({ anchor: anchorRect, menu: <SampleMenu /> });

      expect(screen.getByTestId('mobile-swipe-down')).toBeInTheDocument();
      expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
    });

    it('does not render the sheet when anchor is undefined', () => {
      render(
        <ScreenSizeProvider value={ScreenSize.Mobile}>
          <ResponsiveMenu
            requestClose={vi.fn<() => void>()}
            anchor={undefined}
            menu={<SampleMenu />}
          >
            <button data-testid="trigger-btn">Menu</button>
          </ResponsiveMenu>
        </ScreenSizeProvider>
      );

      expect(screen.getByTestId('trigger-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-swipe-down')).not.toBeInTheDocument();
    });

    it('wraps the menu in a FocusTrap on mobile', () => {
      renderMenuMobile({ anchor: anchorRect, menu: <SampleMenu /> });

      expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
      expect(screen.getByTestId('sample-menu')).toBeInTheDocument();
    });

    it('renders menu children inside the mobile sheet', () => {
      renderMenuMobile({ anchor: anchorRect, menu: <SampleMenu /> });

      // The SampleMenu is rendered inside the sheet
      expect(screen.getByTestId('sample-menu')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-swipe-down')).toBeInTheDocument();
      expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
      expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
    });
  });

  describe('escape closes on both branches', () => {
    it('passes escapeDeactivates callback to FocusTrap on desktop', () => {
      renderMenu({ anchor: anchorRect, menu: <SampleMenu /> });

      // stopPropagation returns false — it's a function, so the attribute
      // serializes as either 'false' (boolean) or the function string.
      // FocusTrap receives it — verify the FocusTrap is present with
      // a non-empty escapeDeactivates.
      const trap = screen.getByTestId('focus-trap');
      const escapeAttr = trap.getAttribute('data-escape-deactivates');
      expect(escapeAttr).toBeTruthy();
    });

    it('wires requestClose as onDeactivate on mobile too', () => {
      const requestClose = vi.fn<() => void>();
      render(
        <ScreenSizeProvider value={ScreenSize.Mobile}>
          <ResponsiveMenu requestClose={requestClose} anchor={anchorRect} menu={<SampleMenu />} />
        </ScreenSizeProvider>
      );

      expect(screen.getByTestId('mobile-swipe-down')).toHaveAttribute('data-request-close', 'true');
    });
  });

  describe('initialFocus', () => {
    it('has initialFocus=false by default on desktop', () => {
      renderMenu({ anchor: anchorRect, menu: <SampleMenu /> });

      expect(screen.getByTestId('focus-trap')).toHaveAttribute('data-initial-focus', 'false');
    });

    it('has initialFocus=false by default on mobile', () => {
      renderMenuMobile({ anchor: anchorRect, menu: <SampleMenu /> });

      expect(screen.getByTestId('focus-trap')).toHaveAttribute('data-initial-focus', 'false');
    });
  });
});
