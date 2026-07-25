import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Modal } from 'folds';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

type Modal500Props = {
  requestClose: () => void;
  children: ReactNode;
};

/** A size-500 modal on desktop that fills the viewport on a phone. */
export function Modal500({ requestClose, children }: Modal500Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  return (
    <ModalOverlay requestClose={requestClose} mobile="fullscreen" contentRef={modalRef}>
      <Modal ref={modalRef} tabIndex={-1} size="500" variant="Background">
        {children}
      </Modal>
    </ModalOverlay>
  );
}
