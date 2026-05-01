import type { MouseEvent } from 'react';
import type { Room } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { MenuItem, Icon, Icons, Text } from 'folds';
import { modalAtom, ModalType } from '$state/modal';
import { EventReaders } from '$components/event-readers';
import * as css from '$features/room/message/styles.css';

export function MessageReadReceiptItem({ room, eventId }: { room: Room; eventId: string }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.CheckTwice} />}
      radii="300"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setModal({
          type: ModalType.ReadReceipts,
          room,
          eventId,
        });
      }}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Read Receipts
      </Text>
    </MenuItem>
  );
}

type MessageReadReceiptInternalProps = {
  room: Room;
  eventId: string;
  onClose: () => void;
};

export function MessageReadReceiptInternal({
  room,
  eventId,
  onClose,
}: MessageReadReceiptInternalProps) {
  return <EventReaders room={room} eventId={eventId} requestClose={onClose} />;
}
