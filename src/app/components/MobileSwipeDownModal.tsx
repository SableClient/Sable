import type { ComponentProps, CSSProperties, RefObject } from 'react';
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Box } from 'folds';
import { FocusTrap } from 'focus-trap-react';
import { useDrag } from '@use-gesture/react';
import * as css from '$features/room/message/styles.css';
import { useOverlayLayer } from '$components/overlay-stack';
import { useDismissOnBack } from '$utils/androidBack';
import { stopPropagation } from '$utils/keyboard';
import { getMobileSheetTiming, useMobileSheetAnimation } from './mobileSheetAnimation';
import { MOBILE_SHEET_DURATION_MS, MOBILE_SHEET_EASING } from './mobileSheetAnimationConstants';
import * as animationCss from './mobileSheetAnimation.css';

interface MobileSwipeDownModalProps {
  children: () => React.ReactNode;
  requestClose: () => void;
  containerRef?: RefObject<HTMLElement | null>;
  focusTrap?: boolean;
  dialogLabel?: string;
  skipReturnFocusRef?: RefObject<boolean>;
  sheetClassName?: string;
  sheetStyle?: CSSProperties;
  keyboardAware?: boolean;
  overlayDragHandle?: boolean;
}

type FocusTrapOptions = NonNullable<ComponentProps<typeof FocusTrap>['focusTrapOptions']>;

const MobileSheetCloseContext = createContext<(() => void) | null>(null);

/** Long enough to outlast the gap between the visual and layout viewport resizes. */
export const VIEWPORT_SETTLE_MS = 180;

const DISMISS_DISTANCE_PX = 100;
const DISMISS_VELOCITY = 0.5;
/** Keeps a fling that lands at the top of a list from turning into a sheet drag. */
const DRAG_BLOCKED_COOLDOWN_MS = 200;

const HANDLE_ATTRIBUTE = 'data-mobile-sheet-handle';
const NO_DRAG_ATTRIBUTE = 'data-mobile-sheet-no-drag';

function getKeyboardOverlap(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
}

/** Whether any scrollable ancestor is scrolled away from its top edge. */
function hasScrolledAncestor(from: HTMLElement | null, boundary: HTMLElement): boolean {
  let element = from;
  while (element && element !== boundary) {
    const { overflowY } = window.getComputedStyle(element);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      element.scrollHeight > element.clientHeight &&
      element.scrollTop > 0
    ) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

export function useMobileSheetClose() {
  return useContext(MobileSheetCloseContext);
}

export function MobileSheetFocusTrap({
  focusTrapOptions,
  children,
}: {
  focusTrapOptions: FocusTrapOptions;
  children: React.ReactNode;
}) {
  const mobileSheetClose = useMobileSheetClose();

  return (
    <FocusTrap
      focusTrapOptions={{
        ...focusTrapOptions,
        onDeactivate: mobileSheetClose ?? focusTrapOptions.onDeactivate,
      }}
    >
      {children}
    </FocusTrap>
  );
}

export function MobileSwipeDownModal({
  children,
  requestClose,
  containerRef: portalRef,
  focusTrap = false,
  dialogLabel,
  skipReturnFocusRef,
  sheetClassName,
  sheetStyle,
  keyboardAware = true,
  overlayDragHandle = false,
}: MobileSwipeDownModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropTouchRef = useRef(false);
  const touchYDiff = useRef(0);
  const keyboardOffset = useRef(0);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const { shouldReduceMotion } = useMobileSheetAnimation();
  const zIndex = useOverlayLayer();

  // Keyboard and drag offsets share one transform; `bottom` would relayout the subtree.
  const applySheetOffset = useCallback(
    (animate: boolean) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      // The entrance keyframes animate `transform` too, and a CSS animation outranks
      // an inline style, so leaving one running would mask this write until it ends.
      sheet.getAnimations().forEach((animation) => animation.cancel());
      const y = touchYDiff.current - keyboardOffset.current;
      sheet.style.transition =
        animate && !shouldReduceMotion
          ? `transform ${MOBILE_SHEET_DURATION_MS}ms ${MOBILE_SHEET_EASING}`
          : '';
      sheet.style.transform = y === 0 ? '' : `translate3d(0, ${y}px, 0)`;
      // Once lifted above the keyboard the bottom inset is no longer a safe area.
      sheet.style.setProperty(
        '--mobile-sheet-safe-bottom',
        keyboardOffset.current > 0 ? '0px' : ''
      );
    },
    [shouldReduceMotion]
  );

  useLayoutEffect(() => {
    if (!keyboardAware) return undefined;

    // Some platforms shrink the layout viewport for the keyboard too. The tallest
    // one seen has no keyboard in it, so sizing off that keeps the sheet one size.
    let stableViewportHeight = 0;
    const publishViewportHeight = () => {
      const next = Math.max(stableViewportHeight, window.innerHeight);
      if (next === stableViewportHeight) return;
      stableViewportHeight = next;
      sheetRef.current?.style.setProperty('--mobile-sheet-viewport', `${next}px`);
    };

    // The two viewports shrink in separate stages. Mid-way the visual one alone
    // looks like a keyboard to lift over, and acting on it throws the sheet off
    // screen once the layout viewport catches up, so only the settled value counts.
    let settleTimer: number | undefined;
    const applySettled = () => {
      // Cancelling the exit animation would strand the sheet: its `finish` listener
      // is the only thing that unmounts it.
      if (closingRef.current) return;
      publishViewportHeight();
      const visible = window.visualViewport?.height ?? window.innerHeight;
      sheetRef.current?.style.setProperty('--mobile-sheet-visible', `${visible}px`);

      const next = getKeyboardOverlap();
      if (next === keyboardOffset.current) return;
      keyboardOffset.current = next;
      applySheetOffset(true);
    };
    const scheduleSettle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(applySettled, VIEWPORT_SETTLE_MS);
    };
    const handleViewportChange = () => {
      publishViewportHeight();
      scheduleSettle();
    };
    const handleOrientationChange = () => {
      // `innerHeight` still reports the pre-rotation size here, so drop the latch and
      // let the settled pass re-measure rather than re-latching the stale value.
      stableViewportHeight = 0;
      scheduleSettle();
    };
    const viewport = window.visualViewport;

    applySettled();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    viewport?.addEventListener('resize', handleViewportChange);
    viewport?.addEventListener('scroll', handleViewportChange);

    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      viewport?.removeEventListener('resize', handleViewportChange);
      viewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [keyboardAware, applySheetOffset]);

  const closeWithAnimation = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);

    const container = sheetRef.current;
    if (!container) {
      requestClose();
      return;
    }

    container.getAnimations().forEach((animation) => animation.cancel());
    container.style.transition = '';
    const startY = touchYDiff.current - keyboardOffset.current;
    const animation = container.animate(
      [{ transform: `translate3d(0, ${startY}px, 0)` }, { transform: 'translate3d(0, 100%, 0)' }],
      {
        ...getMobileSheetTiming(shouldReduceMotion),
        duration: shouldReduceMotion ? 0 : 140,
      }
    );
    animation.addEventListener('finish', requestClose, { once: true });
  }, [requestClose, shouldReduceMotion]);

  // Android back closes the overlay instead of navigating away.
  useDismissOnBack(closeWithAnimation);

  /**
   * Whether this gesture belongs to the sheet or to a list inside it. Decided once,
   * at the start, so a fling that reaches the top of a list mid-gesture cannot be
   * stolen by the sheet.
   */
  const claimedRef = useRef(false);
  const dragBlockedAtRef = useRef(0);

  const claimGesture = useCallback((target: EventTarget | null) => {
    const sheet = sheetRef.current;
    if (!sheet || closingRef.current) return false;
    const from = target instanceof HTMLElement ? target : null;
    // The handle is not over any content, so it always drags.
    if (from?.closest(`[${HANDLE_ATTRIBUTE}]`)) return true;
    // Mobile menu actions activate on pointer-up in Android WebView, so dismissing
    // from one could also invoke the action.
    if (from?.closest(`[${NO_DRAG_ATTRIBUTE}]`)) return false;
    if (window.getSelection()?.toString()) return false;
    if (Date.now() - dragBlockedAtRef.current < DRAG_BLOCKED_COOLDOWN_MS) return false;

    if (hasScrolledAncestor(from, sheet)) {
      dragBlockedAtRef.current = Date.now();
      return false;
    }
    return true;
  }, []);

  useDrag(
    ({ first, last, movement: [, my], velocity: [, vy], direction: [, dy], event, cancel }) => {
      if (first) {
        claimedRef.current = claimGesture(event.target);
        if (!claimedRef.current) {
          cancel();
          return;
        }
      }
      if (!claimedRef.current) return;

      // Only pull down; an upward move unwinds back to the resting offset.
      touchYDiff.current = Math.max(0, my);
      if (touchYDiff.current > 0) event.preventDefault();

      if (last) {
        claimedRef.current = false;
        const flicked = dy > 0 && vy > DISMISS_VELOCITY && touchYDiff.current > 20;
        if (touchYDiff.current > DISMISS_DISTANCE_PX || flicked) {
          closeWithAnimation();
          return;
        }
        touchYDiff.current = 0;
        applySheetOffset(true);
        return;
      }

      applySheetOffset(false);
    },
    {
      // React cannot attach non-passive listeners, so the gesture binds to the element
      // itself; without that `preventDefault` is a no-op and the list scrolls anyway.
      target: sheetRef,
      eventOptions: { passive: false },
      pointer: { capture: false, touch: true },
      axis: 'y',
      // MobileMenuItem owns tap activation for marked actions; the sheet owns drag arbitration.
      filterTaps: false,
    }
  );

  // A sheet opened by a long press mounts under the finger, and releasing it
  // synthesises a click on the backdrop. Only a touch that started on the
  // backdrop is a dismiss.
  const handleBackdropClick = (e: React.MouseEvent) => {
    const fromTouch =
      e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch';
    if (fromTouch && !backdropTouchRef.current) return;
    closeWithAnimation();
  };

  const dragHandleJSX = (
    <div
      className={css.MessageMobileDragHandle}
      data-gestures="ignore"
      data-testid="mobile-sheet-drag-handle"
      style={overlayDragHandle ? { position: 'absolute', top: 0, right: 0, left: 0 } : undefined}
      {...{ [HANDLE_ATTRIBUTE]: '' }}
    >
      <div className={css.MessageMobileDragIndicator} />
    </div>
  );

  const target = portalRef ? portalRef.current : document.body;
  if (!target) return null;

  const sheetContent = (
    <MobileSheetCloseContext.Provider value={closeWithAnimation}>
      {children()}
    </MobileSheetCloseContext.Provider>
  );

  const focusTrapOptions: FocusTrapOptions = {
    initialFocus: false,
    fallbackFocus: () => sheetRef.current ?? target,
    preventScroll: true,
    returnFocusOnDeactivate: true,
    setReturnFocus: (previousActiveElement: HTMLElement | SVGElement) =>
      skipReturnFocusRef?.current ? false : previousActiveElement,
    allowOutsideClick: true,
    clickOutsideDeactivates: false,
    escapeDeactivates: (event: KeyboardEvent) => {
      if (!stopPropagation(event)) return false;
      closeWithAnimation();
      return false;
    },
  };

  const dialog = focusTrap ? (
    <FocusTrap focusTrapOptions={focusTrapOptions}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        tabIndex={-1}
        className={css.MessageMobileSheetFill}
      >
        {sheetContent}
      </div>
    </FocusTrap>
  ) : (
    sheetContent
  );

  return createPortal(
    <Box
      className={`${css.MessageMobileOptionsWrapped} ${
        portalRef ? css.MessageMobileOptionsWrappedContained : ''
      }`}
      data-gestures="ignore"
      style={{
        zIndex,
        ...(closing ? { opacity: 0, transition: 'opacity 100ms ease-out' } : undefined),
      }}
      onClick={handleBackdropClick}
      // Touch events deliberately propagate: the drag binds them on `document`, and
      // stopping them here would starve it. `data-gestures="ignore"` is what keeps the
      // surrounding swipe layer off these events.
      onTouchStart={(e: React.TouchEvent) => {
        backdropTouchRef.current = e.target === e.currentTarget;
      }}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onPointerMove={(e: React.PointerEvent) => e.stopPropagation()}
      onPointerUp={(e: React.PointerEvent) => e.stopPropagation()}
    >
      <Box
        ref={sheetRef}
        className={`${css.MessageMobileOptionsContainer} ${sheetClassName ?? ''} ${
          portalRef ? css.MessageMobileOptionsContainerContained : ''
        } ${animationCss.SheetEntrance}`}
        style={{
          zIndex,
          ...(overlayDragHandle ? { overflow: 'hidden' } : undefined),
          ...(shouldReduceMotion ? { animation: 'none' } : undefined),
          ...sheetStyle,
        }}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
        onPointerMove={(e: React.PointerEvent) => e.stopPropagation()}
        onPointerUp={(e: React.PointerEvent) => e.stopPropagation()}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {dragHandleJSX}
        <div className={css.MessageMobileSheetFill}>{dialog}</div>
      </Box>
    </Box>,
    target
  );
}
