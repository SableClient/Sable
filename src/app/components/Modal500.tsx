import type { ReactNode } from 'react';
import { useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter, color } from 'folds';
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
  const modal = (
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
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                maxWidth: '100vw',
                maxHeight: '100vh',
                borderRadius: 0,
                paddingBottom: 'var(--sable-safe-area-bottom, 0px)',
                overflow: 'hidden',
                backgroundColor: color.Background.Container,
              }
            : undefined
        }
      >
        {children}
      </Modal>
    </FocusTrap>
  );

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      {useFullScreen ? modal : <OverlayCenter>{modal}</OverlayCenter>}
    </Overlay>
  );
}
