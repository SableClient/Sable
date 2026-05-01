import { useAtom } from 'jotai';
import { Overlay, OverlayBackdrop, OverlayCenter, Box, Modal } from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { modalAtom, ModalType } from '$state/modal';
import { MessageReportInternal } from './MessageReport';
import { MessageDeleteInternal } from './MessageDelete';
import { MessageEditHistoryInternal } from './MessageEditHistory';
import { MessageSourceInternal } from './MessageSource';
import { MessageForwardInternal } from './MessageForward';
import { MessageAllReactionInternal } from './MessageReactions';
import { MessageReadReceiptInternal } from './MessageReadRecipts';

export function GlobalModalManager() {
  const [modal, setModal] = useAtom(modalAtom);

  if (!modal) return null;

  const close = () => setModal(null);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <div>
            {modal.type === ModalType.Report && (
              <Box>
                <MessageReportInternal room={modal.room} mEvent={modal.mEvent} onClose={close} />
              </Box>
            )}

            {modal.type === ModalType.Delete && (
              <Box>
                <MessageDeleteInternal room={modal.room} mEvent={modal.mEvent} onClose={close} />
              </Box>
            )}

            {modal.type === ModalType.Forward && (
              <Box>
                <MessageForwardInternal room={modal.room} mEvent={modal.mEvent} onClose={close} />
              </Box>
            )}

            {modal.type === ModalType.Source && (
              <Modal variant="Surface" size="300">
                <MessageSourceInternal room={modal.room} mEvent={modal.mEvent} onClose={close} />
              </Modal>
            )}

            {modal.type === ModalType.Reactions && (
              <Modal variant="Surface" size="300">
                <MessageAllReactionInternal
                  room={modal.room}
                  relations={modal.relations}
                  onClose={close}
                />
              </Modal>
            )}

            {modal.type === ModalType.EditHistory && (
              <Modal variant="Surface" size="300">
                <MessageEditHistoryInternal
                  room={modal.room}
                  mEvent={modal.mEvent}
                  onClose={close}
                />
              </Modal>
            )}

            {modal.type === ModalType.ReadReceipts && (
              <Modal variant="Surface" size="300">
                <MessageReadReceiptInternal
                  room={modal.room}
                  eventId={modal.eventId}
                  onClose={close}
                />
              </Modal>
            )}
          </div>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
