import { useCallback, useEffect, useMemo } from 'react';
import { config, Box, Text } from 'folds';
import type { MatrixError } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { getJoinedSpaceChildrenSummary, getRecursiveSpaceLeaveOrder } from '$utils/room/hierarchy';
import { rateLimitedActions } from '$utils/matrix';
import { PromptDialog } from '$components/modal-overlay/PromptDialog';
import { AsyncError } from '$components/AsyncError';
import { Button } from '$components/button';

type LeaveSpacePromptProps = {
  roomId: string;
  onDone: () => void;
  onCancel: () => void;
};

const formatJoinedContentsMessage = (roomCount: number, subspaceCount: number): string => {
  const parts: string[] = [];
  if (roomCount > 0) {
    parts.push(`${roomCount} ${roomCount === 1 ? 'room' : 'rooms'}`);
  }
  if (subspaceCount > 0) {
    parts.push(`${subspaceCount} ${subspaceCount === 1 ? 'subspace' : 'subspaces'}`);
  }
  return `You are also joined to ${parts.join(' and ')} in this space. Leaving the space alone will not remove you from them.`;
};

const formatRecursiveLeaveLabel = (
  leaving: boolean,
  roomCount: number,
  subspaceCount: number
): string => {
  if (leaving) {
    return 'Leaving space, rooms, and subspaces...';
  }

  const parts: string[] = [];
  if (roomCount > 0) {
    parts.push('Rooms');
  }
  if (subspaceCount > 0) {
    parts.push('Subspaces');
  }

  return `Leave Space and All ${parts.join(' & ')}`;
};

export function LeaveSpacePrompt({ roomId, onDone, onCancel }: LeaveSpacePromptProps) {
  const mx = useMatrixClient();

  const { leaveOrder, roomCount, subspaceCount } = useMemo(
    () => getJoinedSpaceChildrenSummary(mx, roomId),
    [mx, roomId]
  );
  const joinedChildrenCount = leaveOrder.length;

  const [leaveState, leaveSpace] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      await mx.leave(roomId);
    }, [mx, roomId])
  );

  const [leaveAllState, leaveAll] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      await rateLimitedActions(getRecursiveSpaceLeaveOrder(mx, roomId), (id) => mx.leave(id));
    }, [mx, roomId])
  );

  const leaving = leaveState.status === AsyncStatus.Loading;
  const leavingAll = leaveAllState.status === AsyncStatus.Loading;
  const isBusy = leaving || leavingAll;

  useEffect(() => {
    if (leaveState.status === AsyncStatus.Success || leaveAllState.status === AsyncStatus.Success) {
      onDone();
    }
  }, [leaveState, leaveAllState, onDone]);

  return (
    <PromptDialog title="Leave Space" requestClose={onCancel}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Box direction="Column" gap="200">
          <Text priority="400">Are you sure you want to leave this space?</Text>
          {joinedChildrenCount > 0 && (
            <Text priority="300" size="T300">
              {formatJoinedContentsMessage(roomCount, subspaceCount)}
            </Text>
          )}
          <AsyncError state={leaveState} prefix="Failed to leave space" size="T300" />
          <AsyncError
            state={leaveAllState}
            prefix="Failed to leave space, rooms, and subspaces"
            size="T300"
          />
        </Box>
        <Box direction="Column" gap="200">
          <Button
            type="submit"
            variant="Critical"
            onClick={() => leaveSpace()}
            loading={leaving}
            spinnerVariant="Critical"
            spinnerSize="200"
            aria-disabled={isBusy || leaveState.status === AsyncStatus.Success}
          >
            <Text size="B400">{leaving ? 'Leaving...' : 'Leave Space Only'}</Text>
          </Button>
          {joinedChildrenCount > 0 && (
            <Button
              variant="Critical"
              fill="Soft"
              onClick={() => leaveAll()}
              loading={leavingAll}
              spinnerVariant="Critical"
              spinnerSize="200"
              aria-disabled={isBusy || leaveAllState.status === AsyncStatus.Success}
            >
              <Text size="B400">
                {formatRecursiveLeaveLabel(leavingAll, roomCount, subspaceCount)}
              </Text>
            </Button>
          )}
        </Box>
      </Box>
    </PromptDialog>
  );
}
