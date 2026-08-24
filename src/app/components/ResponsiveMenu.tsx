import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { RectCords } from 'folds';
import { Box, OverlayBackdrop, OverlayCenter } from 'folds';
import { Overlay, PopOut, useOverlayLayer } from '$components/overlay-stack';
import FocusTrap from 'focus-trap-react';
import { useCompactLayout } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { useDismissOnBack } from '$utils/androidBack';
import { MobileSheetFocusTrap, MobileSwipeDownModal } from './MobileSwipeDownModal';
import * as css from './ResponsiveMenu.css';

type ComponentPosition = 'Top' | 'Right' | 'Bottom' | 'Left';
type ComponentAlign = 'Start' | 'Center' | 'End';
type FocusTrapOptions = NonNullable<ComponentProps<typeof FocusTrap>['focusTrapOptions']>;

type ResponsiveMenuProps = {
  anchor: RectCords | undefined;
  open?: boolean;
  requestClose: () => void;
  menu: ReactNode;
  /** The element the menu hangs off on desktop. */
  children?: ReactNode;
  position?: ComponentPosition;
  align?: ComponentAlign;
  offset?: number;
  alignOffset?: number;
  /** Set true for menus whose trigger should regain focus when they close. */
  returnFocusOnDeactivate?: boolean;
  /** `both` also maps Left/Right, for menus laid out horizontally. */
  arrowNavigation?: 'vertical' | 'both';
  /** How the menu shows on mobile: a bottom sheet, or a centred dialog for
   *  option pickers, which a sheet makes look like an action menu. */
  mobile?: 'sheet' | 'dialog' | 'inline-dialog';
  surfaceColor?: string;
  overlayDragHandle?: boolean;
};

function MenuDialog({
  requestClose,
  focusTrapOptions,
  children,
}: {
  requestClose: () => void;
  focusTrapOptions: FocusTrapOptions;
  children: ReactNode;
}) {
  // Android back closes the dialog instead of navigating away.
  useDismissOnBack(requestClose);

  return (
    // The focus trap allows an outside tap on mobile but never deactivates on
    // it. OverlayCenter, not the backdrop, is what the tap lands on: it fills
    // the overlay and paints over it.
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter role="presentation" onClick={requestClose}>
        <FocusTrap focusTrapOptions={focusTrapOptions}>
          <Box
            direction="Column"
            role="dialog"
            aria-modal="true"
            className={css.DialogContent}
            onClick={(evt) => evt.stopPropagation()}
          >
            {children}
          </Box>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

function InlineMenuDialog({
  anchor,
  requestClose,
  focusTrapOptions,
  children,
}: {
  anchor: RectCords;
  requestClose: () => void;
  focusTrapOptions: FocusTrapOptions;
  children: ReactNode;
}) {
  useDismissOnBack(requestClose);
  const zIndex = useOverlayLayer();

  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxHeight = Math.round(viewport.height * 0.75);

  return (
    <FocusTrap focusTrapOptions={focusTrapOptions}>
      <Box
        style={{ position: 'fixed', inset: 0, zIndex, background: 'transparent' }}
        onClick={requestClose}
      >
        <Box
          direction="Column"
          role="dialog"
          aria-modal="true"
          style={{
            width: 'fit-content',
            maxWidth: `${viewport.width - 16}px`,
            maxHeight: `${maxHeight}px`,
            overflow: 'auto',
            borderRadius: '20px',
            position: 'absolute',
            top: Math.min(
              Math.max(8, anchor.y + anchor.height + 8),
              Math.max(8, viewport.height - maxHeight - 8)
            ),
            right: Math.max(8, viewport.width - anchor.x - anchor.width),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </Box>
      </Box>
    </FocusTrap>
  );
}

/**
 * A menu that hangs off its trigger on desktop and rises as a bottom sheet on
 * mobile, where a popout anchored to a tiny target is hard to hit and easy to
 * dismiss by accident.
 */
export function ResponsiveMenu({
  anchor,
  open,
  requestClose,
  menu,
  children,
  position = 'Bottom',
  align = 'End',
  offset,
  alignOffset,
  returnFocusOnDeactivate = false,
  arrowNavigation = 'vertical',
  mobile = 'sheet',
  surfaceColor,
  overlayDragHandle = false,
}: ResponsiveMenuProps) {
  const isMobile = useCompactLayout();
  const isOpen = open ?? !!anchor;

  const isKeyForward = (evt: KeyboardEvent) =>
    evt.key === 'ArrowDown' || (arrowNavigation === 'both' && evt.key === 'ArrowRight');
  const isKeyBackward = (evt: KeyboardEvent) =>
    evt.key === 'ArrowUp' || (arrowNavigation === 'both' && evt.key === 'ArrowLeft');

  const focusTrapOptions: FocusTrapOptions = {
    initialFocus: false,
    fallbackFocus: () => document.body,
    returnFocusOnDeactivate,
    onDeactivate: requestClose,
    clickOutsideDeactivates: !isMobile,
    allowOutsideClick: isMobile,
    isKeyForward,
    isKeyBackward,
    escapeDeactivates: stopPropagation,
  };

  if (isMobile) {
    if (mobile === 'inline-dialog') {
      return (
        <>
          {children}
          {isOpen && anchor && (
            <InlineMenuDialog
              anchor={anchor}
              requestClose={requestClose}
              focusTrapOptions={focusTrapOptions}
            >
              {menu}
            </InlineMenuDialog>
          )}
        </>
      );
    }

    const sheetStyle: CSSProperties | undefined = surfaceColor
      ? { backgroundColor: surfaceColor }
      : undefined;

    return (
      <>
        {children}
        {isOpen && mobile === 'dialog' && (
          <MenuDialog requestClose={requestClose} focusTrapOptions={focusTrapOptions}>
            {menu}
          </MenuDialog>
        )}
        {isOpen && mobile === 'sheet' && (
          <MobileSwipeDownModal
            requestClose={requestClose}
            sheetStyle={sheetStyle}
            overlayDragHandle={overlayDragHandle}
          >
            {() => (
              <MobileSheetFocusTrap
                focusTrapOptions={{
                  ...focusTrapOptions,
                  // The backdrop owns tap-to-dismiss. Left to focus-trap, the
                  // mousedown synthesised when a long press is released lands on
                  // the backdrop and reads as a click outside.
                  clickOutsideDeactivates: false,
                  allowOutsideClick: true,
                }}
              >
                <Box
                  direction="Column"
                  role="dialog"
                  aria-modal="true"
                  className={css.SheetContent}
                >
                  {menu}
                </Box>
              </MobileSheetFocusTrap>
            )}
          </MobileSwipeDownModal>
        )}
      </>
    );
  }

  return (
    <PopOut
      aria-expanded={!!anchor}
      anchor={anchor}
      position={position}
      align={align}
      offset={offset}
      alignOffset={alignOffset}
      content={
        // Gated so a call site that builds its menu inline does that work on open,
        // not on every render of the trigger.
        anchor ? <FocusTrap focusTrapOptions={focusTrapOptions}>{menu}</FocusTrap> : null
      }
    >
      {children}
    </PopOut>
  );
}
