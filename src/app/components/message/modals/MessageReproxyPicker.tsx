import { useRef } from 'react';
import { useSetAtom } from 'jotai';
import type { MatrixEvent, Room, RoomMessageEventContent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { TemporaryPersonaPicker } from '$features/room/persona-picker/PersonaPicker';
import type { PerMessageProfileMsc4461 } from '$hooks/usePerMessageProfile';
import { buildReplacementPmpContent } from '$features/room/buildReplacementContent';
import { modalAtom, popModalAtom } from '$state/modal';

type MessageReproxyPickerInternalProps = {
  room: Room;
  mEvent: MatrixEvent;
  closeMenu: () => void;
};

export function MessageReproxyPickerInternal({
  room,
  mEvent,
  closeMenu,
}: MessageReproxyPickerInternalProps) {
  const mx = useMatrixClient();
  const setModal = useSetAtom(modalAtom);
  const popModal = useSetAtom(popModalAtom);
  const reproxiedRef = useRef(false);

  const requestClose = () => {
    if (!reproxiedRef.current) {
      popModal();
      return;
    }
    setModal(null);
    closeMenu();
  };

  const reproxyMessage = async (profile: PerMessageProfileMsc4461 | undefined) => {
    reproxiedRef.current = true;
    const content = buildReplacementPmpContent(mEvent.getContent(), mEvent.getId()!, profile);
    await mx.sendMessage(room.roomId, content as RoomMessageEventContent);
    requestClose();
  };

  return (
    <TemporaryPersonaPicker
      open
      mx={mx}
      onPersonaSelect={reproxyMessage}
      requestClose={requestClose}
    />
  );
}
