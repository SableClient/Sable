import { MouseEvent } from 'react';
import { Room } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { MenuItem, Text } from 'folds';
import { ChecksIcon } from '@phosphor-icons/react/dist/csr/Checks';
import { modalAtom, ModalType } from '$state/modal';
import { EventReaders } from '$components/event-readers';
import * as css from '$features/room/message/styles.css';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function MessageReadReceiptItem({ room, eventId }: { room: Room; eventId: string }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<PhosphorIcon size="100" as={ChecksIcon} />}
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
