import type { FormEventHandler } from 'react';
import { useCallback, useEffect } from 'react';
import { config, Box, Text, Input } from 'folds';
import type { MatrixError } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { createDebugLogger } from '$utils/debugLogger';
import { PromptDialog } from '$components/modal-overlay/PromptDialog';
import { AsyncError } from '$components/AsyncError';
import { Button } from '$components/button';

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
    <PromptDialog title="Knock On Room" requestClose={onCancel}>
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
            <AsyncError state={knockState} prefix="Failed to knock" size="T300" />
          </Box>
        </Box>
        <Button
          type="submit"
          variant="Primary"
          loading={knockState.status === AsyncStatus.Loading}
          spinnerVariant="Primary"
          spinnerSize="200"
          aria-disabled={
            knockState.status === AsyncStatus.Loading || knockState.status === AsyncStatus.Success
          }
        >
          <Text size="B400">
            {knockState.status === AsyncStatus.Loading ? 'Knocking...' : 'Knock'}
          </Text>
        </Button>
      </Box>
    </PromptDialog>
  );
}
