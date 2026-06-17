import { useCallback, useEffect, useMemo } from 'react';
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
  color,
  Button,
  Spinner,
} from 'folds';
import type { MatrixError } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { composerIcon, X } from '$components/icons/phosphor';
import { stopPropagation } from '$utils/keyboard';
import { getJoinedSpaceChildrenSummary, getRecursiveSpaceLeaveOrder } from '$utils/room';
import { rateLimitedActions } from '$utils/matrix';

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
                <Text size="H4">Leave Space</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                {composerIcon(X)}
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                <Text priority="400">Are you sure you want to leave this space?</Text>
                {joinedChildrenCount > 0 && (
                  <Text priority="300" size="T300">
                    {formatJoinedContentsMessage(roomCount, subspaceCount)}
                  </Text>
                )}
                {leaveState.status === AsyncStatus.Error && (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    Failed to leave space! {leaveState.error.message}
                  </Text>
                )}
                {leaveAllState.status === AsyncStatus.Error && (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    Failed to leave space, rooms, and subspaces! {leaveAllState.error.message}
                  </Text>
                )}
              </Box>
              <Box direction="Column" gap="200">
                <Button
                  type="submit"
                  variant="Critical"
                  onClick={() => leaveSpace()}
                  before={
                    leaving ? <Spinner fill="Solid" variant="Critical" size="200" /> : undefined
                  }
                  disabled={isBusy || leaveState.status === AsyncStatus.Success}
                >
                  <Text size="B400">{leaving ? 'Leaving...' : 'Leave Space Only'}</Text>
                </Button>
                {joinedChildrenCount > 0 && (
                  <Button
                    variant="Critical"
                    fill="Soft"
                    onClick={() => leaveAll()}
                    before={
                      leavingAll ? (
                        <Spinner fill="Solid" variant="Critical" size="200" />
                      ) : undefined
                    }
                    disabled={isBusy || leaveAllState.status === AsyncStatus.Success}
                  >
                    <Text size="B400">
                      {formatRecursiveLeaveLabel(leavingAll, roomCount, subspaceCount)}
                    </Text>
                  </Button>
                )}
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
