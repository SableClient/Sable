import type { MouseEvent } from 'react';
import type { Room, MatrixEvent } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { MenuItem, Icon, Icons, Text } from 'folds';
import { TextViewer } from '$components/text-viewer';
import { getEventEdits } from '$utils/room';
import { modalAtom, ModalType } from '$state/modal';
import * as css from '$features/room/message/styles.css';

export function MessageSourceCodeItem({ room, mEvent }: { room: Room; mEvent: MatrixEvent }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.BlockCode} />}
      radii="300"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setModal({
          type: ModalType.Source,
          room,
          mEvent,
        });
      }}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        View Source
      </Text>
    </MenuItem>
  );
}

type MessageSourceInternalProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
};

const getContent = (evt: MatrixEvent) =>
  evt.isEncrypted()
    ? {
        [`<== DECRYPTED_EVENT ==>`]: evt.getEffectiveEvent(),
        [`<== ORIGINAL_EVENT ==>`]: evt.event,
      }
    : evt.event;

export function MessageSourceInternal({ room, mEvent, onClose }: MessageSourceInternalProps) {
  const getText = (): string => {
    const evtId = mEvent.getId()!;
    const evtTimeline = room.getTimelineForEvent(evtId);
    const edits =
      evtTimeline &&
      getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();

    if (!edits) return JSON.stringify(getContent(mEvent), null, 2);

    const content: Record<string, unknown> = {
      '<== MAIN_EVENT ==>': getContent(mEvent),
    };

    edits.forEach((editEvt, index) => {
      content[`<== REPLACEMENT_EVENT_${index + 1} ==>`] = getContent(editEvt);
    });

    return JSON.stringify(content, null, 2);
  };

  return <TextViewer name="Source Code" langName="json" text={getText()} requestClose={onClose} />;
}
