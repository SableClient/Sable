import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Dialog, Header, IconButton, Text, config } from 'folds';
import { composerIcon, X } from '$components/icons/phosphor';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import type { ConfirmRequest } from './confirm';
import { confirmEmitter } from './confirm';

type ConfirmHostProps = {
  container: HTMLElement | null;
};

/**
 * Mount once near the app root (inherits all context: ScreenSizeProvider, jotai, etc.).
 * Subscribes to the confirm emitter and renders the dialog via createPortal.
 */
export function ConfirmHost({ container }: ConfirmHostProps) {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const pendingRef = useRef<ConfirmRequest | null>(null);

  useEffect(() => {
    const off = confirmEmitter.on((req: ConfirmRequest) => {
      // Race defense: if a previous request hasn't been resolved yet
      // (programmatic double-call), resolve it false before overwriting.
      if (pendingRef.current) {
        pendingRef.current.resolve(false);
      }
      pendingRef.current = req;
      setPending(req);
    });
    return off;
  }, []);

  const handleDismiss = useCallback(() => {
    if (pending) {
      pending.resolve(false);
      pendingRef.current = null;
      setPending(null);
    }
  }, [pending]);

  const handleConfirm = useCallback(() => {
    if (pending) {
      pending.resolve(true);
      pendingRef.current = null;
      setPending(null);
    }
  }, [pending]);

  if (!pending || !container) return null;

  return createPortal(
    <ModalOverlay requestClose={handleDismiss}>
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
            <Text size="H4">{pending.title}</Text>
          </Box>
          <IconButton size="300" onClick={handleDismiss} radii="300" aria-label="Close">
            {composerIcon(X)}
          </IconButton>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          <Text priority="400">{pending.description}</Text>
          <Button variant={pending.variant} onClick={handleConfirm} type="submit">
            <Text size="B400">{pending.action}</Text>
          </Button>
        </Box>
      </Dialog>
    </ModalOverlay>,
    container
  );
}
