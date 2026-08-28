// oxlint-disable typescript/no-explicit-any
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';

// ── Mocks ───────────────────────────────────────────────────────────────────

/**
 * Mock FocusTrap that simulates Escape behavior. When escapeDeactivates is
 * truthy, pressing Escape calls onDeactivate. This lets us test the
 * escapeDeactivates prop without dealing with jsdom's incompatible tabbable
 * library (which doesn't find tabbable elements at all in jsdom v29).
 */
vi.mock('focus-trap-react', () => {
  const React = require('react');
  const FocusTrapComponent = ({ children, focusTrapOptions }: any) => {
    const opts = focusTrapOptions ?? {};
    const { escapeDeactivates, onDeactivate } = opts;

    React.useEffect(() => {
      const handleKeyDown = (e: any) => {
        if (e.key === 'Escape') {
          const esc = escapeDeactivates;
          const deactivate = typeof esc === 'function' ? esc(e) : esc === true || esc === undefined;
          if (deactivate) {
            onDeactivate?.();
            e.stopPropagation();
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [escapeDeactivates, onDeactivate]);

    return React.createElement('div', { 'data-testid': 'focus-trap' }, children);
  };

  return { default: FocusTrapComponent, FocusTrap: FocusTrapComponent };
});

vi.mock('folds', () => ({
  Box: ({ children, direction }: any) => (
    <div data-testid="box" data-direction={direction}>
      {children}
    </div>
  ),
  Modal: ({ children, size }: any) => (
    <div data-testid="modal" data-size={size}>
      {children}
    </div>
  ),
  Overlay: ({ open, backdrop, children }: any) => (
    <div data-testid="overlay" data-open={String(!!open)}>
      <div data-testid="overlay-backdrop">{backdrop}</div>
      {children}
    </div>
  ),
  OverlayBackdrop: () => <div data-testid="overlay-backdrop-inner">backdrop</div>,
  OverlayCenter: ({ children }: any) => <div data-testid="overlay-center">{children}</div>,
}));

vi.mock('$components/MobileSwipeDownModal', () => ({
  MobileSwipeDownModal: ({ children }: any) => (
    <div data-testid="mobile-swipe-down">
      <div data-testid="drag-handle">drag-handle</div>
      {children()}
    </div>
  ),
  MobileSheetFocusTrap: ({ children }: any) => <div data-testid="focus-trap">{children}</div>,
}));

vi.mock('$utils/androidBack', () => ({
  useDismissOnBack: vi.fn<() => void>(),
}));

vi.mock('$utils/keyboard', () => ({
  stopPropagation: () => false,
}));

vi.mock('$features/room/message/styles.css', () => ({
  MessageOptionsMenu: 'mock-message-options-menu',
  MessageOptionsSheetMenu: 'mock-message-options-sheet-menu',
  MessageMobileDragHandle: 'mock-mobile-drag-handle',
  MessageMobileDragIndicator: 'mock-mobile-drag-indicator',
  MessageMobileOptionsWrapped: 'mock-mobile-options-wrapped',
  MessageMobileOptionsContainer: 'mock-mobile-options-container',
}));

import { ModalOverlay } from './ModalOverlay';

afterEach(() => {
  cleanup();
});

// ── Render helpers ──────────────────────────────────────────────────────────

function desktop(props: Partial<Parameters<typeof ModalOverlay>[0]> = {}) {
  return render(
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <ModalOverlay requestClose={vi.fn<() => void>()} {...props}>
        <div data-testid="modal-child">Modal Content</div>
      </ModalOverlay>
    </ScreenSizeProvider>
  );
}

function mobile(props: Partial<Parameters<typeof ModalOverlay>[0]> = {}) {
  return render(
    <ScreenSizeProvider value={ScreenSize.Mobile}>
      <ModalOverlay requestClose={vi.fn<() => void>()} {...props}>
        <div data-testid="modal-child">Modal Content</div>
      </ModalOverlay>
    </ScreenSizeProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ModalOverlay', () => {
  describe('escapeDeactivates', () => {
    it('calls requestClose on Escape when escapeDeactivates is true', async () => {
      const requestClose = vi.fn<() => void>();
      const user = userEvent.setup();

      render(
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <ModalOverlay requestClose={requestClose} escapeDeactivates={true}>
            <div data-testid="child">Content</div>
          </ModalOverlay>
        </ScreenSizeProvider>
      );

      await user.keyboard('{Escape}');
      expect(requestClose).toHaveBeenCalledOnce();
    });

    it('does NOT call requestClose on Escape when escapeDeactivates is false', async () => {
      const requestClose = vi.fn<() => void>();
      const user = userEvent.setup();

      render(
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <ModalOverlay requestClose={requestClose} escapeDeactivates={false}>
            <div data-testid="child">Content</div>
          </ModalOverlay>
        </ScreenSizeProvider>
      );

      await user.keyboard('{Escape}');
      expect(requestClose).not.toHaveBeenCalled();
    });

    it('does NOT call requestClose with default escapeDeactivates (stopPropagation)', async () => {
      // stopPropagation returns false, so Escape should NOT trigger close
      const requestClose = vi.fn<() => void>();
      const user = userEvent.setup();

      render(
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <ModalOverlay requestClose={requestClose}>
            <div data-testid="child">Content</div>
          </ModalOverlay>
        </ScreenSizeProvider>
      );

      await user.keyboard('{Escape}');
      expect(requestClose).not.toHaveBeenCalled();
    });
  });

  describe('presentation', () => {
    it('renders centred overlay on desktop (default)', () => {
      desktop();

      expect(screen.getByTestId('overlay')).toBeInTheDocument();
      expect(screen.getByTestId('overlay-center')).toBeInTheDocument();
      expect(screen.getByTestId('overlay-backdrop-inner')).toBeInTheDocument();
      expect(screen.getByTestId('modal-child')).toBeInTheDocument();
      expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
    });

    it('renders overlay with open=false on desktop', () => {
      desktop({ open: false });

      expect(screen.getByTestId('overlay')).toHaveAttribute('data-open', 'false');
    });

    it('renders centred overlay on mobile when mobile="centred"', () => {
      mobile({ mobile: 'centred' });

      expect(screen.getByTestId('overlay')).toBeInTheDocument();
      expect(screen.getByTestId('overlay-center')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-swipe-down')).not.toBeInTheDocument();
    });

    it('renders fullscreen overlay on mobile when mobile="fullscreen"', () => {
      mobile({ mobile: 'fullscreen' });

      expect(screen.getByTestId('overlay')).toBeInTheDocument();
      // Fullscreen does NOT render OverlayCenter or backdrop
      expect(screen.queryByTestId('overlay-center')).not.toBeInTheDocument();
      expect(screen.queryByTestId('overlay-backdrop-inner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mobile-swipe-down')).not.toBeInTheDocument();
      // Focus-trap wraps the fullscreen content
      expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
      expect(screen.getByTestId('modal-child')).toBeInTheDocument();
    });

    it('pads the fullscreen wrapper against device safe areas by default', () => {
      mobile({ mobile: 'fullscreen' });

      const wrapper = screen
        .getByTestId('modal-child')
        .closest('div[style*="padding-top"]') as HTMLElement;
      expect(wrapper.style.paddingTop).toBe(
        'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))'
      );
    });

    it('skips safe-area padding when respectSafeArea is false', () => {
      mobile({ mobile: 'fullscreen', respectSafeArea: false });

      const wrapper = screen.getByTestId('modal-child').parentElement as HTMLElement;
      expect(wrapper.style.paddingTop ?? '').toBe('');
    });

    it('wraps children in a Modal on desktop when size is set', () => {
      desktop({ size: '500' });

      const modal = screen.getByTestId('modal');
      expect(modal).toHaveAttribute('data-size', '500');
      expect(modal).toContainElement(screen.getByTestId('modal-child'));
    });

    it('does NOT wrap children in a Modal on mobile fullscreen when size is set (fills viewport)', () => {
      mobile({ mobile: 'fullscreen', size: '500' });

      // Regression (#1410): the fullscreen path must render children bare.
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('modal-child')).toBeInTheDocument();
      expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
    });

    it('renders sheet via MobileSwipeDownModal on mobile when mobile="sheet"', () => {
      mobile({ mobile: 'sheet' });

      expect(screen.getByTestId('mobile-swipe-down')).toBeInTheDocument();
      expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.queryByTestId('overlay-center')).not.toBeInTheDocument();
    });

    it('defaults to centred on mobile', () => {
      mobile();

      expect(screen.getByTestId('overlay')).toBeInTheDocument();
      expect(screen.getByTestId('overlay-center')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-swipe-down')).not.toBeInTheDocument();
    });
  });
});
