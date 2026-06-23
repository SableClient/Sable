import type { ReactNode } from 'react';
import { useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { isPhoneLayoutDevice } from '$utils/user-agent';
import { stopPropagation } from '$utils/keyboard';

type Modal500Props = {
  fullScreenOnMobile?: boolean;
  requestClose: () => void;
  children: ReactNode;
};
export function Modal500({ requestClose, children, fullScreenOnMobile = false }: Modal500Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile || isPhoneLayoutDevice();
  const useFullScreen = fullScreenOnMobile && isMobile;

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
          <Modal
            ref={modalRef}
            tabIndex={-1}
            size="500"
            variant="Background"
            style={
              useFullScreen
                ? {
                    width: '100%',
                    height: '100%',
                    maxWidth: '100%',
                    borderRadius: 0,
                    paddingBottom: 'var(--sable-safe-area-bottom, 0px)',
                    overflow: 'hidden',
                  }
                : undefined
            }
          >
            {children}
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
