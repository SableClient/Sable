import type { FormEventHandler } from 'react';
import { useCallback, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  config,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Input,
  color,
  Button,
  Spinner,
} from 'folds';
import type { MatrixError } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { stopPropagation } from '$utils/keyboard';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('KnockRoomPrompt');

type KnockRoomProps = {
  roomId: string;
  via?: string | string[];
  onDone: () => void;
  onCancel: () => void;
};
export function KnockRoomPrompt({ roomId, via, onDone, onCancel }: KnockRoomProps) {
  const mx = useMatrixClient();

  const [knockState, knockRoom] = useAsyncCallback<undefined, MatrixError, [string?]>(
    useCallback(
      async (reason?: string) => {
        debugLog.info('ui', 'Knock room button clicked', { roomId });
        mx.knockRoom(roomId, { viaServers: via || undefined, reason });
      },
      [mx, roomId, via]
    )
  );

  const handleKnock: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const target = evt.target as HTMLFormElement;
    const reasonInput = (target?.reasonInput as HTMLInputElement) || undefined;
    const reason = reasonInput?.value.trim() || undefined;
    knockRoom(reason);
  };

  useEffect(() => {
    if (knockState.status === AsyncStatus.Success) {
      debugLog.info('ui', 'Successfully knocked on room', { roomId });
      onDone();
    }
  }, [knockState, onDone, roomId]);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
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
                <Text size="H4">Knock On Room</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box
              as="form"
              onSubmit={handleKnock}
              style={{ padding: config.space.S400 }}
              direction="Column"
              gap="400"
            >
              <Box direction="Column" gap="200">
                <Text priority="400">
                  Request to join this room. You can optionally leave a reason for the moderators.
                </Text>
                <Box direction="Column" gap="100">
                  <Text size="L400">
                    Reason{' '}
                    <Text as="span" size="T200">
                      (Optional)
                    </Text>
                  </Text>
                  <Input name="reasonInput" variant="Background" />
                  {knockState.status === AsyncStatus.Error && (
                    <Text style={{ color: color.Critical.Main }} size="T300">
                      Failed to knock! {knockState.error.message}
                    </Text>
                  )}
                </Box>
              </Box>
              <Button
                type="submit"
                variant="Primary"
                before={
                  knockState.status === AsyncStatus.Loading ? (
                    <Spinner fill="Solid" variant="Primary" size="200" />
                  ) : undefined
                }
                aria-disabled={
                  knockState.status === AsyncStatus.Loading ||
                  knockState.status === AsyncStatus.Success
                }
              >
                <Text size="B400">
                  {knockState.status === AsyncStatus.Loading ? 'Knocking...' : 'Knock'}
                </Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
