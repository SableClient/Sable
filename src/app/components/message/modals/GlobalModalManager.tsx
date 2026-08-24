import { useAtomValue, useSetAtom } from 'jotai';
import { OverlayBackdrop, OverlayCenter, Box, Modal } from 'folds';
import { Overlay } from '$components/overlay-stack';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { useDismissOnBack } from '$utils/androidBack';
import { modalAtom, ModalType, popModalAtom } from '$state/modal';
import { MessageReportInternal } from './MessageReport';
import { MessageDeleteInternal } from './MessageDelete';
import { MessageEditHistoryInternal } from './MessageEditHistory';
import { MessageSourceInternal } from './MessageSource';
import { MessageForwardInternal } from './MessageForward';
import { MessageAllReactionInternal } from './MessageReactions';
import { MessageReadReceiptInternal } from './MessageReadRecipts';
import { MobileOptionsInternal } from './Options';
import { MessageReactionPickerInternal } from './MessageReactionPicker';
import { MessageReproxyPickerInternal } from './MessageReproxyPicker';

const OWNS_BACK_HANDLER: ReadonlySet<ModalType> = new Set([
  ModalType.Forward,
  ModalType.MobileOptions,
  ModalType.ReactionPicker,
  ModalType.ReproxyPicker,
]);

export function GlobalModalManager() {
  const modal = useAtomValue(modalAtom);
  const close = useSetAtom(popModalAtom);

  useDismissOnBack(close, !!modal && !OWNS_BACK_HANDLER.has(modal.type));

  if (!modal) return null;

  if (modal.type === ModalType.ReactionPicker) {
    return (
      <MessageReactionPickerInternal
        mEvent={modal.mEvent}
        imagePackRooms={modal.imagePackRooms}
        onReactionToggle={modal.onReactionToggle}
        closeMenu={modal.closeMenu}
      />
    );
  }
  if (modal.type === ModalType.ReproxyPicker) {
    return (
      <MessageReproxyPickerInternal
        room={modal.room}
        mEvent={modal.mEvent}
        closeMenu={modal.closeMenu}
      />
    );
  }

  if (modal.type === ModalType.Forward) {
    return <MessageForwardInternal room={modal.room} mEvent={modal.mEvent} onClose={close} />;
  }
  if (modal.type === ModalType.MobileOptions) {
    return <MobileOptionsInternal options={modal.options} />;
  }
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            allowOutsideClick: (e: { preventDefault?: () => void }) => {
              if (e.preventDefault) e.preventDefault();
              close();
              return false;
            },
            escapeDeactivates: stopPropagation,
          }}
        >
          <div>
            {' '}
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
