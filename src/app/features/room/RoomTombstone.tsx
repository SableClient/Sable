import { useCallback } from 'react';
import { Box, Text } from 'folds';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { AsyncError } from '$components/AsyncError';

import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { getViaServers } from '$plugins/via-servers';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import * as css from './RoomTombstone.css';
import { KnownMembership } from '$types/matrix-sdk';
import { Button } from '$components/button';

type RoomTombstoneProps = { roomId: string; body?: string; replacementRoomId: string };
export function RoomTombstone({ roomId, body, replacementRoomId }: RoomTombstoneProps) {
  const mx = useMatrixClient();
  const { navigateRoom } = useRoomNavigate();

  const [joinState, handleJoin] = useAsyncCallback(
    useCallback(() => {
      const currentRoom = mx.getRoom(roomId);
      const via = currentRoom ? getViaServers(currentRoom) : [];
      return mx.joinRoom(replacementRoomId, {
        viaServers: via,
      });
    }, [mx, roomId, replacementRoomId])
  );
  const replacementRoom = mx.getRoom(replacementRoomId);

  const handleOpen = () => {
    if (replacementRoom) navigateRoom(replacementRoom.roomId);
    if (joinState.status === AsyncStatus.Success) navigateRoom(joinState.data.roomId);
  };

  return (
    <RoomInputPlaceholder alignItems="Center" gap="600" className={css.RoomTombstone}>
      <Box direction="Column" grow="Yes">
        <Text size="T400">{body || 'This room has been replaced and is no longer active.'}</Text>
        <AsyncError state={joinState} />
      </Box>
      <Box shrink="No">
        {replacementRoom?.getMyMembership() === KnownMembership.Join ||
        joinState.status === AsyncStatus.Success ? (
          <Button onClick={handleOpen} size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">Open New Room</Text>
          </Button>
        ) : (
          <Button
            loading={joinState.status === AsyncStatus.Loading}
            spinnerSize="100"
            spinnerVariant="Primary"
            spinnerFill="Solid"
            size="300"
            variant="Primary"
            fill="Solid"
            radii="300"
            onClick={handleJoin}
          >
            <Text size="B300">Join New Room</Text>
          </Button>
        )}
      </Box>
    </RoomInputPlaceholder>
  );
}
