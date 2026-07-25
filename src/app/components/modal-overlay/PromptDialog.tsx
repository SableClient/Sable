import type { ReactNode } from 'react';
import { Box, Dialog, Header, IconButton, Text, config } from 'folds';
import { composerIcon, X } from '$components/icons/phosphor';
import { ModalOverlay } from './ModalOverlay';

type PromptDialogProps = {
  title: string;
  requestClose: () => void;
  children: ReactNode;
};

/** A titled dialog with a close button, over a dimmed backdrop. */
export function PromptDialog({ title, requestClose, children }: PromptDialogProps) {
  return (
    <ModalOverlay requestClose={requestClose}>
      <Dialog variant="Surface">
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">{title}</Text>
          </Box>
          <IconButton size="300" onClick={requestClose} radii="300">
            {composerIcon(X)}
          </IconButton>
        </Header>
        {children}
      </Dialog>
    </ModalOverlay>
  );
}
