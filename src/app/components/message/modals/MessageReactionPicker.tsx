import { useRef } from 'react';
import { useSetAtom } from 'jotai';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { EmojiBoard } from '$components/emoji-board';
import { MobileSwipeDownModal } from '$components/MobileSwipeDownModal';
import { modalAtom, popModalAtom } from '$state/modal';
import * as messageCss from '$features/room/message/styles.css';

type MessageReactionPickerInternalProps = {
  mEvent: MatrixEvent;
  imagePackRooms?: Room[];
  onReactionToggle?: (targetEventId: string, key: string, shortcode?: string) => void;
  closeMenu: () => void;
};

export function MessageReactionPickerInternal({
  mEvent,
  imagePackRooms,
  onReactionToggle,
  closeMenu,
}: MessageReactionPickerInternalProps) {
  const setModal = useSetAtom(modalAtom);
  const popModal = useSetAtom(popModalAtom);
  const reactedRef = useRef(false);

  const requestClose = () => {
    if (!reactedRef.current) {
      popModal();
      return;
    }
    setModal(null);
    closeMenu();
  };

  const react = (key: string, shortcode?: string) => {
    reactedRef.current = true;
    onReactionToggle?.(mEvent.getId() ?? '', key, shortcode);
  };

  return (
    <MobileSwipeDownModal
      requestClose={requestClose}
      focusTrap
      dialogLabel="Add reaction"
      sheetClassName={messageCss.MessageMobileOptionsContainerPicker}
    >
      {() => (
        <EmojiBoard
          sheet
          isFullWidth
          allowTextCustomEmoji
          imagePackRooms={imagePackRooms ?? []}
          requestClose={requestClose}
          onEmojiSelect={(key) => react(key)}
          onCustomEmojiSelect={(mxc, shortcode) => react(mxc, shortcode)}
        />
      )}
    </MobileSwipeDownModal>
  );
}
