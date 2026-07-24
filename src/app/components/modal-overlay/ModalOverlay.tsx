import type { ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { stopPropagation } from '$utils/keyboard';

type ModalOverlayProps = {
  requestClose: () => void;
  children: ReactNode;
};

export function ModalOverlay({ requestClose, children }: ModalOverlayProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
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
