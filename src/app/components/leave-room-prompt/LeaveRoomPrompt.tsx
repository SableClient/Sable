import { useCallback, useEffect } from 'react';
import { config, Box, Text, color, Button, Spinner } from 'folds';
import type { MatrixError } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';

import { PromptDialog } from '$components/modal-overlay/PromptDialog';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('LeaveRoomPrompt');

type LeaveRoomPromptProps = {
  roomId: string;
  onDone: () => void;
  onCancel: () => void;
};
export function LeaveRoomPrompt({ roomId, onDone, onCancel }: LeaveRoomPromptProps) {
  const mx = useMatrixClient();

  const [leaveState, leaveRoom] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      debugLog.info('ui', 'Leave room button clicked', { roomId });
      await mx.leave(roomId);
    }, [mx, roomId])
  );

  const handleLeave = () => {
    leaveRoom();
  };

  useEffect(() => {
    if (leaveState.status === AsyncStatus.Success) {
      debugLog.info('ui', 'Successfully left room', { roomId });
      onDone();
    }
  }, [leaveState, onDone, roomId]);

  return (
    <PromptDialog title="Leave Room" requestClose={onCancel}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Box direction="Column" gap="200">
          <Text priority="400">Are you sure you want to leave this room?</Text>
          {leaveState.status === AsyncStatus.Error && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Failed to leave room! {leaveState.error.message}
            </Text>
          )}
        </Box>
        <Button
          type="submit"
          variant="Critical"
          onClick={handleLeave}
          before={
            leaveState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" variant="Critical" size="200" />
            ) : undefined
          }
          aria-disabled={
            leaveState.status === AsyncStatus.Loading || leaveState.status === AsyncStatus.Success
          }
        >
          <Text size="B400">
            {leaveState.status === AsyncStatus.Loading ? 'Leaving...' : 'Leave'}
          </Text>
        </Button>
      </Box>
    </PromptDialog>
  );
}
