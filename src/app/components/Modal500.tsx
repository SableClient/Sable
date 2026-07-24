import type { ReactNode } from 'react';
import { useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';

type Modal500Props = {
  requestClose: () => void;
  children: ReactNode;
};
export function Modal500({ requestClose, children }: Modal500Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const screenSize = useScreenSizeContext();

  if (screenSize === ScreenSize.Mobile) {
    return (
      <Overlay open>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            escapeDeactivates: stopPropagation,
            onDeactivate: requestClose,
          }}
        >
          <div
            ref={modalRef}
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
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            fallbackFocus: () => modalRef.current ?? document.body,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal ref={modalRef} tabIndex={-1} size="500" variant="Background">
            {children}
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
