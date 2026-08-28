import type { ComponentProps, MouseEventHandler } from 'react';
import { MenuItem } from 'folds';
import { useMobileTapActivation } from '$hooks/useMobileTapActivation';

type MenuItemProps = ComponentProps<typeof MenuItem>;

type MobileMenuItemProps = Omit<MenuItemProps, 'onClick'> & {
  isMobile: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

/**
 * Wraps folds' `MenuItem` with pointer-based tap activation for Android
 * WebView, where click synthesis is suppressed after the long-press gesture
 * that opens the mobile swipe-down modal. On mobile the `onClick` handler
 * fires on `pointerup` instead of relying on the missing click event.
 */
export function MobileMenuItem({ isMobile, onClick, ...props }: MobileMenuItemProps) {
  const activation = useMobileTapActivation<HTMLButtonElement>(isMobile, (evt) => {
    onClick?.(evt);
  });
  return <MenuItem {...activation} {...props} data-mobile-sheet-no-drag="" />;
}
