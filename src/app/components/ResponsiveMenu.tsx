import type { ReactNode } from 'react';
import type { RectCords } from 'folds';
import { Box, PopOut } from 'folds';
import FocusTrap from 'focus-trap-react';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { MobileSwipeDownModal } from './MobileSwipeDownModal';
import * as css from './ResponsiveMenu.css';

type ComponentPosition = 'Top' | 'Right' | 'Bottom' | 'Left';
type ComponentAlign = 'Start' | 'Center' | 'End';

type ResponsiveMenuProps = {
  anchor: RectCords | undefined;
  requestClose: () => void;
  menu: ReactNode;
  /** The element the menu hangs off on desktop. */
  children?: ReactNode;
  position?: ComponentPosition;
  align?: ComponentAlign;
  offset?: number;
  /** Set true for menus whose trigger should regain focus when they close. */
  returnFocusOnDeactivate?: boolean;
  /** `both` also maps Left/Right, for menus laid out horizontally. */
  arrowNavigation?: 'vertical' | 'both';
};

/**
 * A menu that hangs off its trigger on desktop and rises as a bottom sheet on
 * mobile, where a popout anchored to a tiny target is hard to hit and easy to
 * dismiss by accident.
 */
export function ResponsiveMenu({
  anchor,
  requestClose,
  menu,
  children,
  position = 'Bottom',
  align = 'End',
  offset,
  returnFocusOnDeactivate = false,
  arrowNavigation = 'vertical',
}: ResponsiveMenuProps) {
  // Null outside a provider, where desktop is the safe assumption.
  const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;

  const isKeyForward = (evt: KeyboardEvent) =>
    evt.key === 'ArrowDown' || (arrowNavigation === 'both' && evt.key === 'ArrowRight');
  const isKeyBackward = (evt: KeyboardEvent) =>
    evt.key === 'ArrowUp' || (arrowNavigation === 'both' && evt.key === 'ArrowLeft');

  const focusTrapOptions = {
    initialFocus: false,
    fallbackFocus: () => document.body,
    returnFocusOnDeactivate,
    onDeactivate: requestClose,
    clickOutsideDeactivates: true,
    isKeyForward,
    isKeyBackward,
    escapeDeactivates: stopPropagation,
  };

  if (isMobile) {
    return (
      <>
        {children}
        {anchor && (
          <MobileSwipeDownModal requestClose={requestClose}>
            {(dragHandle, dragHandlers) => (
              <FocusTrap focusTrapOptions={focusTrapOptions}>
                <Box
                  direction="Column"
                  role="dialog"
                  aria-modal="true"
                  className={css.SheetContent}
                  // Swiping anywhere on the sheet dismisses it, not just the handle.
                  {...dragHandlers}
                >
                  {dragHandle}
                  {menu}
                </Box>
              </FocusTrap>
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
