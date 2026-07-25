import type { ReactNode } from 'react';
import type { RectCords } from 'folds';
import { PopOut } from 'folds';
import FocusTrap from 'focus-trap-react';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { MobileSwipeDownModal } from './MobileSwipeDownModal';

type DragHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
};

/** Given the sheet's drag handle on mobile, and nothing on desktop. */
type MenuRenderer = (dragHandle: ReactNode, dragHandlers: DragHandlers | undefined) => ReactNode;

type ResponsiveMenuProps = {
  anchor: RectCords | undefined;
  requestClose: () => void;
  menu: ReactNode | MenuRenderer;
  /** The element the menu hangs off on desktop. */
  children?: ReactNode;
  id?: string;
  position?: ComponentPosition;
  align?: ComponentAlign;
  offset?: number;
  alignOffset?: number;
};

type ComponentPosition = 'Top' | 'Right' | 'Bottom' | 'Left';
type ComponentAlign = 'Start' | 'Center' | 'End';

/**
 * A menu that hangs off its trigger on desktop and rises as a bottom sheet on
 * mobile, where a popout anchored to a small target is hard to hit and easy to
 * dismiss by accident.
 */
export function ResponsiveMenu({
  anchor,
  requestClose,
  menu,
  children,
  id,
  position = 'Bottom',
  align = 'End',
  offset,
  alignOffset,
}: ResponsiveMenuProps) {
  const isMobile = useScreenSizeContext() === ScreenSize.Mobile;

  if (isMobile) {
    return (
      <>
        {children}
        {anchor && (
          <MobileSwipeDownModal requestClose={requestClose}>
            {(dragHandle, dragHandlers) =>
              typeof menu === 'function' ? menu(dragHandle, dragHandlers) : menu
            }
          </MobileSwipeDownModal>
        )}
      </>
    );
  }

  return (
    <PopOut
      id={id}
      aria-expanded={!!anchor}
      anchor={anchor}
      position={position}
      align={align}
      offset={offset}
      alignOffset={alignOffset}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            returnFocusOnDeactivate: false,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
            escapeDeactivates: stopPropagation,
          }}
        >
          {typeof menu === 'function' ? menu(null, undefined) : menu}
        </FocusTrap>
      }
    >
      {children}
    </PopOut>
  );
}
