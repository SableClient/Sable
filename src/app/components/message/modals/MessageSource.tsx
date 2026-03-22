import { MouseEvent } from 'react';
import { Room, MatrixEvent } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { MenuItem, Text } from 'folds';
import { CodeBlockIcon } from '@phosphor-icons/react/dist/csr/CodeBlock';
import { TextViewer } from '$components/text-viewer';
import { getEventEdits } from '$utils/room';
import { modalAtom, ModalType } from '$state/modal';
import * as css from '$features/room/message/styles.css';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function MessageSourceCodeItem({ room, mEvent }: { room: Room; mEvent: MatrixEvent }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<PhosphorIcon size="100" as={CodeBlockIcon} />}
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

export function MessageSourceInternal({ room, mEvent, onClose }: MessageSourceInternalProps) {
  const getContent = (evt: MatrixEvent) =>
    evt.isEncrypted()
      ? {
          [`<== DECRYPTED_EVENT ==>`]: evt.getEffectiveEvent(),
          [`<== ORIGINAL_EVENT ==>`]: evt.event,
        }
      : evt.event;

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
