import { MouseEvent } from 'react';
import { Room, MatrixEvent } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import { MenuItem, Icon, Icons, Text } from 'folds';
import { getEventEdits } from '$utils/room';
import { modalAtom, ModalType } from '$state/modal';
import * as css from '$features/room/message/styles.css';
import { EventHistory } from '$components/event-history';

export function MessageEditHistoryItem({
  room,
  mEvent,
  closeMenu,
}: {
  room: Room;
  mEvent: MatrixEvent;
  closeMenu: () => void;
}) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Clock} />}
      radii="300"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        setModal({
          type: ModalType.EditHistory,
          room,
          mEvent,
        });
      }}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Version History
      </Text>
    </MenuItem>
  );
}

type MessageEditHistoryInternalProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
};

export function MessageEditHistoryInternal({
  room,
  mEvent,
  onClose,
}: MessageEditHistoryInternalProps) {
  const getEvents = (): MatrixEvent[] => {
    const evtId = mEvent.getId()!;
    const evtTimeline = room.getTimelineForEvent(evtId);
    const edits =
      evtTimeline &&
      getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();
    if (!edits) return [mEvent];
    edits.sort((a, b) => a.getTs() - b.getTs());
    return [mEvent, ...edits];
  };

  return <EventHistory room={room} mEvents={getEvents()} requestClose={onClose} />;
}
