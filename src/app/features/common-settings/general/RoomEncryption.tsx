import { Badge, Text } from 'folds';
import { useCallback } from 'react';
import type { StateEvents } from '$types/matrix-sdk';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';

import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useRoom } from '$hooks/useRoom';
import { useStateEvent } from '$hooks/useStateEvent';
import type { RoomPermissionsAPI } from '$hooks/useRoomPermissions';
import { EventType } from '$types/matrix-sdk';
import { confirm } from '$components/confirm/confirm';
import { AsyncError } from '$components/AsyncError';
import { Button } from '$components/button';

const ROOM_ENC_ALGO = 'm.megolm.v1.aes-sha2';

type RoomEncryptionProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomEncryption({ permissions }: RoomEncryptionProps) {
  const mx = useMatrixClient();
  const room = useRoom();

  const canEnable = permissions.stateEvent(EventType.RoomEncryption, mx.getSafeUserId());
  const content = useStateEvent(room, EventType.RoomEncryption)?.getContent<{
    algorithm: string;
  }>();
  const enabled = content?.algorithm === ROOM_ENC_ALGO;

  const [enableState, enable] = useAsyncCallback(
    useCallback(async () => {
      await mx.sendStateEvent(room.roomId, EventType.RoomEncryption as keyof StateEvents, {
        algorithm: ROOM_ENC_ALGO,
      });
    }, [mx, room.roomId])
  );

  const enabling = enableState.status === AsyncStatus.Loading;

  const handleEnable = async () => {
    const ok = await confirm({
      title: 'Enable Encryption',
      description: 'Are you sure? Once enabled, encryption cannot be disabled!',
      action: 'Enable E2E Encryption',
      variant: 'Primary',
    });
    if (ok) {
      enable();
    }
  };

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Room Encryption"
        description={
          enabled
            ? 'Messages in this room are protected by end-to-end encryption.'
            : 'Once enabled, encryption cannot be disabled!'
        }
        after={
          enabled ? (
            <Badge size="500" variant="Success" fill="Solid" radii="300">
              <Text size="L400">Enabled</Text>
            </Badge>
          ) : (
            <Button
              size="300"
              variant="Primary"
              fill="Solid"
              radii="300"
              disabled={!canEnable}
              onClick={handleEnable}
              loading={enabling}
              spinnerVariant="Primary"
              spinnerSize="100"
            >
              <Text size="B300">Enable</Text>
            </Button>
          )
        }
      >
        <AsyncError state={enableState} />
      </SettingTile>
    </SequenceCard>
  );
}
