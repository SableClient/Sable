import { MouseEvent } from 'react';
import { Room, Relations } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { Text, MenuItem } from 'folds';
import { SmileyIcon } from '@phosphor-icons/react/dist/csr/Smiley';
import { modalAtom, ModalType } from '$state/modal';
import * as css from '$features/room/message/styles.css';
import { ReactionViewer } from '$features/room/reaction-viewer';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function MessageAllReactionItem({ room, relations }: { room: Room; relations: Relations }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<PhosphorIcon size="100" as={SmileyIcon} />}
      radii="300"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setModal({
          type: ModalType.Reactions,
          room,
          relations,
        });
      }}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        View Reactions
      </Text>
    </MenuItem>
  );
}

type MessageAllReactionInternalProps = {
  room: Room;
  relations: Relations;
  onClose: () => void;
};

export function MessageAllReactionInternal({
  room,
  relations,
  onClose,
}: MessageAllReactionInternalProps) {
  return <ReactionViewer room={room} relations={relations} requestClose={onClose} />;
}
