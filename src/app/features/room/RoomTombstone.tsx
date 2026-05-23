import { useCallback } from 'react';
import { Box, Button, Spinner, Text, color } from 'folds';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';

import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { getViaServers } from '$plugins/via-servers';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import * as css from './RoomTombstone.css';
import { KnownMembership } from '$types/matrix-sdk';
import { t } from 'i18next';

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
        <Text size="T400">{body || t('RoomView.this_room_has_been_replaced_and_is_no_longer_active')}</Text>
        {joinState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(joinState.error as Error)?.message ?? t('RoomView.failed_to_join_replacement_room')}
          </Text>
        )}
      </Box>
      <Box shrink="No">
        {replacementRoom?.getMyMembership() === KnownMembership.Join ||
        joinState.status === AsyncStatus.Success ? (
          <Button onClick={handleOpen} size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">{t('RoomView.open_new_room')}</Text>
          </Button>
        ) : (
          <Button
            onClick={handleJoin}
            size="300"
            variant="Primary"
            fill="Solid"
            radii="300"
            before={
              joinState.status === AsyncStatus.Loading && (
                <Spinner size="100" variant="Primary" fill="Solid" />
              )
            }
            disabled={joinState.status === AsyncStatus.Loading}
          >
            <Text size="B300">{t('RoomView.join_new_room')}</Text>
          </Button>
        )}
      </Box>
    </RoomInputPlaceholder>
  );
}
