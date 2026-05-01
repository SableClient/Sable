
import { useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import { MenuItem, Icon, Icons, Text, OverlayCenter, Overlay, OverlayBackdrop, Modal } from 'folds';
import { EventReaders } from '$components/event-readers';
import * as css from '$features/room/message/styles.css';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';

export function MessageReadReceiptItem({
  room,
  eventId,
  onClose,
}: {
  room: Room;
  eventId: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: handleClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal variant="Surface" size="300">
              <EventReaders room={room} eventId={eventId} requestClose={handleClose} />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <MenuItem
        size="300"
        after={<Icon size="100" src={Icons.CheckTwice} />}
        radii="300"
        onClick={() => setOpen(true)}
        aria-pressed={open}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          Read Receipts
        </Text>
      </MenuItem>
    </>
  );
}
