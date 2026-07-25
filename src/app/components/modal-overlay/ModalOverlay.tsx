import type { ComponentProps, MutableRefObject, ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { useDismissOnBack } from '$utils/androidBack';

type FocusTrapOptions = ComponentProps<typeof FocusTrap>['focusTrapOptions'];

type ModalOverlayProps = {
  open?: boolean;
  requestClose: () => void;
  /** Set false for overlays that must be dismissed deliberately, not by a stray click. */
  dismissOnClickOutside?: boolean;
  /** `fullscreen` drops the centred modal on phones and fills the viewport instead. */
  mobile?: 'centred' | 'fullscreen';
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
  mobile = 'centred',
  contentRef,
  escapeDeactivates = stopPropagation,
  children,
}: ModalOverlayProps) {
  // Null outside a provider, where desktop is the safe assumption.
  const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;

  // Android back closes the overlay instead of navigating away.
  useDismissOnBack(requestClose, open);

  if (open && isMobile && mobile === 'fullscreen') {
    return (
      <Overlay open>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
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
            initialFocus: false,
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
