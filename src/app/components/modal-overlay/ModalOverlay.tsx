import { useRef } from 'react';
import type { ComponentProps, MutableRefObject, ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Box, Modal, OverlayBackdrop, OverlayCenter } from 'folds';
import { Overlay } from '$components/overlay-stack';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { stopPropagation } from '$utils/keyboard';
import { useDismissOnBack } from '$utils/androidBack';
import { MobileSheetFocusTrap, MobileSwipeDownModal } from '$components/MobileSwipeDownModal';
import * as messageCss from '$features/room/message/styles.css';

type FocusTrapOptions = NonNullable<ComponentProps<typeof FocusTrap>['focusTrapOptions']>;
type ModalSize = '300' | '400' | '500';

const safeArea = {
  top: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
  bottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))',
  left: 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
  right: 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
};

type ModalOverlayProps = {
  open?: boolean;
  requestClose: () => void;
  /** Set false for overlays that must be dismissed deliberately, not by a stray click. */
  dismissOnClickOutside?: boolean;
  /** `centred` keeps the desktop-style dialog on phones.
   *  `fullscreen` drops the centred modal and fills the viewport.
   *  `sheet` rises as a bottom sheet with a swipe-down-to-dismiss handle. */
  mobile?: 'centred' | 'fullscreen' | 'sheet';
  /** When set, ModalOverlay owns the `<Modal>` chrome. Callers passing `size`
   *  must not wrap children in `<Modal>` themselves. */
  size?: ModalSize;
  /** The modal element, used as the focus fallback and as the fullscreen wrapper. */
  contentRef?: MutableRefObject<HTMLDivElement | null>;
  /** Set false for flows that Escape must not abort, such as device verification. */
  escapeDeactivates?: FocusTrapOptions['escapeDeactivates'];
  /** Fills the mobile fullscreen wrapper, for content that does not paint its own. */
  background?: string;
  /** Set false for full-bleed viewers that inset their own controls. */
  respectSafeArea?: boolean;
  children: ReactNode;
};

export function ModalOverlay({
  open = true,
  requestClose,
  dismissOnClickOutside = true,
  mobile = 'centred',
  size,
  contentRef,
  escapeDeactivates = stopPropagation,
  background,
  respectSafeArea = true,
  children,
}: ModalOverlayProps) {
  // Null outside a provider, where desktop is the safe assumption.
  const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;
  const ownedModalRef = useRef<HTMLDivElement | null>(null);

  const sheet = isMobile && mobile === 'sheet';

  // Android back closes the overlay instead of navigating away. The sheet registers
  // its own handler, and a child's runs first, so registering here too would skip
  // the sheet's exit animation.
  useDismissOnBack(requestClose, open && !sheet);

  if (open && isMobile && mobile === 'fullscreen') {
    return (
      <Overlay open>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            fallbackFocus: () => contentRef?.current ?? document.body,
            escapeDeactivates,
            onDeactivate: requestClose,
          }}
        >
          <div
            ref={contentRef}
            tabIndex={-1}
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              background,
              paddingTop: respectSafeArea ? safeArea.top : undefined,
              paddingBottom: respectSafeArea ? safeArea.bottom : undefined,
              paddingLeft: respectSafeArea ? safeArea.left : undefined,
              paddingRight: respectSafeArea ? safeArea.right : undefined,
            }}
          >
            {children}
          </div>
        </FocusTrap>
      </Overlay>
    );
  }

  if (open && sheet) {
    const focusTrapOptions: FocusTrapOptions = {
      initialFocus: false,
      fallbackFocus: () => document.body,
      onDeactivate: requestClose,
      clickOutsideDeactivates: dismissOnClickOutside,
      escapeDeactivates,
    };
    return (
      <MobileSwipeDownModal requestClose={requestClose}>
        {() => (
          <MobileSheetFocusTrap focusTrapOptions={focusTrapOptions}>
            <div role="dialog" aria-modal="true" className={messageCss.MessageOptionsSheetMenu}>
              <Box direction="Column">{children}</Box>
            </div>
          </MobileSheetFocusTrap>
        )}
      </MobileSwipeDownModal>
    );
  }

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            fallbackFocus: () =>
              (size ? ownedModalRef.current : contentRef?.current) ?? document.body,
            clickOutsideDeactivates: dismissOnClickOutside,
            onDeactivate: requestClose,
            escapeDeactivates,
          }}
        >
          {size ? (
            <Modal ref={ownedModalRef} tabIndex={-1} size={size} variant="Background">
              {children}
            </Modal>
          ) : (
            children
          )}
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
