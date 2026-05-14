import type { MouseEvent } from 'react';
import type { Room, Relations } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { Icon, Icons, Text, MenuItem } from 'folds';
import { modalAtom, ModalType } from '$state/modal';
import * as css from '$features/room/message/styles.css';
import { ReactionViewer } from '$features/room/reaction-viewer';

export function MessageAllReactionItem({ room, relations }: { room: Room; relations: Relations }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Smile} />}
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
