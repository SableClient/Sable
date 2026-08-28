import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { LogoutDialog } from '$components/LogoutDialog';

type LogoutDialogOverlayProps = {
  requestClose: () => void;
};

export function LogoutDialogOverlay({ requestClose }: LogoutDialogOverlayProps) {
  return (
    <ModalOverlay requestClose={requestClose}>
      <LogoutDialog handleClose={requestClose} />
    </ModalOverlay>
  );
}
