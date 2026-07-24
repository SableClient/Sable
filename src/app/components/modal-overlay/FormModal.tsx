import type { ReactNode } from 'react';
import { Box, config, Header, IconButton, Modal, Scroll, Text } from 'folds';
import { composerIcon, X } from '$components/icons/phosphor';
import { ModalOverlay } from './ModalOverlay';

type FormModalProps = {
  title: string;
  requestClose: () => void;
  children: ReactNode;
};

export function FormModal({ title, requestClose, children }: FormModalProps) {
  return (
    <ModalOverlay requestClose={requestClose}>
      <Modal size="300" flexHeight>
        <Box direction="Column">
          <Header
            size="500"
            style={{
              padding: config.space.S200,
              paddingLeft: config.space.S400,
              borderBottomWidth: config.borderWidth.B300,
            }}
          >
            <Box grow="Yes">
              <Text size="H4">{title}</Text>
            </Box>
            <Box shrink="No">
              <IconButton size="300" radii="300" onClick={requestClose}>
                {composerIcon(X)}
              </IconButton>
            </Box>
          </Header>
          <Scroll size="300" hideTrack>
            <Box
              style={{ padding: config.space.S400, paddingRight: config.space.S200 }}
              direction="Column"
              gap="500"
            >
              {children}
            </Box>
          </Scroll>
        </Box>
      </Modal>
    </ModalOverlay>
  );
}
