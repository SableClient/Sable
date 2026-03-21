import { useCallback, useEffect, useState } from 'react';
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
  color,
  Button,
  Spinner,
} from 'folds';
import { MatrixError } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { stopPropagation } from '$utils/keyboard';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('KockRoomPrompt');

type KnockRoomProps = {
  roomId: string;
  via?: string;
  onDone: () => void;
  onCancel: () => void;
};
export function KnockRoomPrompt({ roomId, via, onDone, onCancel }: KnockRoomProps) {
  const mx = useMatrixClient();
  const [reason, setReason] = useState('');

  const [knockState, knockRoom] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      debugLog.info('ui', 'Knock room button clicked', { roomId });
      mx.knockRoom(roomId, { viaServers: via || undefined, reason: reason.trim() || undefined });
    }, [mx, roomId, reason, via])
  );

  const handleKnock = () => {
    knockRoom();
  };

  useEffect(() => {
    if (knockState.status === AsyncStatus.Success) {
      debugLog.info('ui', 'Successfully left room', { roomId });
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
                <Text size="H4">Knock on Room</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                <Text priority="400">
                  Request to join this room. You can optionally leave a reason for the moderators.
                </Text>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason"
                  rows={3}
                  style={{ resize: 'vertical', width: '100%' }}
                />
                {knockState.status === AsyncStatus.Error && (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    Failed to knock! {knockState.error.message}
                  </Text>
                )}
              </Box>
              <Button
                type="submit"
                variant="Primary"
                onClick={handleKnock}
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
