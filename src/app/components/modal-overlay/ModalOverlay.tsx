import type { ComponentProps, MutableRefObject, ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { useDismissOnBack } from '$utils/androidBack';

type FocusTrapOptions = ComponentProps<typeof FocusTrap>['focusTrapOptions'];

type ModalOverlayProps = {
  open?: boolean;
  requestClose: () => void;
  /** Set false for overlays that must be dismissed deliberately, not by a stray click. */
  dismissOnClickOutside?: boolean;
  initialFocus?: FocusTrapOptions['initialFocus'];
  /** `fullscreen` drops the centred modal on phones and fills the viewport instead. */
  mobile?: 'centred' | 'fullscreen';
  /** The modal element, used as the focus fallback and as the fullscreen wrapper. */
  contentRef?: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function ModalOverlay({
  open = true,
  requestClose,
  dismissOnClickOutside = true,
  initialFocus = false,
  mobile = 'centred',
  contentRef,
  children,
}: ModalOverlayProps) {
  const isMobile = useScreenSizeContext() === ScreenSize.Mobile;

  // Android back closes the overlay instead of navigating away.
  useDismissOnBack(requestClose, open);

  if (open && isMobile && mobile === 'fullscreen') {
    return (
      <Overlay open>
        <FocusTrap
          focusTrapOptions={{
            initialFocus,
            escapeDeactivates: stopPropagation,
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
            escapeDeactivates: stopPropagation,
          }}
        >
          {children}
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
