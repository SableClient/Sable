import type { ComponentProps, MutableRefObject, ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { useDismissOnBack } from '$utils/androidBack';
import { MobileSwipeDownModal } from '$components/MobileSwipeDownModal';

type FocusTrapOptions = ComponentProps<typeof FocusTrap>['focusTrapOptions'];

type ModalOverlayProps = {
  open?: boolean;
  requestClose: () => void;
  /** Set false for overlays that must be dismissed deliberately, not by a stray click. */
  dismissOnClickOutside?: boolean;
  initialFocus?: FocusTrapOptions['initialFocus'];
  /**
   * How the overlay presents on phones. `centred` is the interruptive alert, for
   * destructive confirms. `sheet` rises from the bottom, for non-destructive action
   * lists. `fullscreen` fills the viewport, for forms and large surfaces.
   */
  mobile?: 'centred' | 'sheet' | 'fullscreen';
  /** The modal element, used as the focus fallback and as the fullscreen wrapper. */
  contentRef?: MutableRefObject<HTMLDivElement | null>;
  /** Set false for flows that Escape must not abort, such as device verification. */
  escapeDeactivates?: FocusTrapOptions['escapeDeactivates'];
  children: ReactNode;
};

export function ModalOverlay({
  open = true,
  requestClose,
  dismissOnClickOutside = true,
  initialFocus = false,
  mobile = 'centred',
  contentRef,
  escapeDeactivates = stopPropagation,
  children,
}: ModalOverlayProps) {
  // Null outside a provider, where desktop is the safe assumption.
  const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;

  // Android back closes the overlay instead of navigating away.
  useDismissOnBack(requestClose, open);

  if (open && isMobile && mobile === 'sheet') {
    return (
      <MobileSwipeDownModal requestClose={requestClose}>
        {(dragHandle) => (
          <FocusTrap
            focusTrapOptions={{
              initialFocus,
              fallbackFocus: () => contentRef?.current ?? document.body,
              clickOutsideDeactivates: dismissOnClickOutside,
              onDeactivate: requestClose,
              escapeDeactivates,
            }}
          >
            <div role="dialog" aria-modal="true">
              {dragHandle}
              {children}
            </div>
          </FocusTrap>
        )}
      </MobileSwipeDownModal>
    );
  }

  if (open && isMobile && mobile === 'fullscreen') {
    return (
      <Overlay open>
        <FocusTrap
          focusTrapOptions={{
            initialFocus,
            escapeDeactivates,
            onDeactivate: requestClose,
          }}
        >
          <div
            ref={contentRef}
            tabIndex={-1}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
          >
            {children}
          </div>
        </FocusTrap>
      </Overlay>
    );
  }

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus,
            fallbackFocus: () => contentRef?.current ?? document.body,
            clickOutsideDeactivates: dismissOnClickOutside,
            onDeactivate: requestClose,
            escapeDeactivates,
          }}
        >
          {children}
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
