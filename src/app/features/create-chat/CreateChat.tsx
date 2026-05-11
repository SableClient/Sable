import { Box, Button, color, config, Icon, Icons, Input, Spinner, Switch, Text } from 'folds';
import type { FormEventHandler } from 'react';
import { useCallback, useState } from 'react';
import type { ICreateRoomStateEvent } from '$types/matrix-sdk';
import { MatrixError, Preset, Visibility } from '$types/matrix-sdk';
import { useNavigate } from 'react-router-dom';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { addRoomIdToMDirect, isUserId } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { millisecondsToMinutes } from '$utils/common';
import { createRoomEncryptionState } from '$components/create-room';
import { useAlive } from '$hooks/useAlive';
import { getDirectRoomPath } from '$pages/pathUtils';
import { ErrorCode } from '../../cs-errorcode';

type CreateChatProps = {
  defaultUserId?: string;
};
export function CreateChat({ defaultUserId }: CreateChatProps) {
  const mx = useMatrixClient();
  const alive = useAlive();
  const navigate = useNavigate();

  const [encryption, setEncryption] = useState(true);
  const [invalidUserId, setInvalidUserId] = useState(false);

  const [createState, create] = useAsyncCallback<string, Error | MatrixError, [string, boolean]>(
    useCallback(
      async (userId, encrypted) => {
        const initialState: ICreateRoomStateEvent[] = [];

        if (encrypted) initialState.push(createRoomEncryptionState());

        const result = await mx.createRoom({
          is_direct: true,
          invite: [userId],
          visibility: Visibility.Private,
          preset: Preset.TrustedPrivateChat,
          initial_state: initialState,
          creation_content: {
            additional_creators: [userId],
          },
        });

        addRoomIdToMDirect(mx, result.room_id, userId);

        return result.room_id;
      },
      [mx]
    )
  );
  const loading = createState.status === AsyncStatus.Loading;
  const error = createState.status === AsyncStatus.Error ? createState.error : undefined;
  const disabled = createState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setInvalidUserId(false);

    const target = evt.target as HTMLFormElement | undefined;
    const userIdInput = target?.userIdInput as HTMLInputElement | undefined;
    const userId = userIdInput?.value.trim();

    if (!userIdInput || !userId) return;
    if (!isUserId(userId)) {
      setInvalidUserId(true);
      return;
    }

    create(userId, encryption).then((roomId) => {
      if (alive()) {
        userIdInput.value = '';
        navigate(getDirectRoomPath(roomId));
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} grow="Yes" direction="Column" gap="500">
      <Box direction="Column" gap="100">
        <Text size="L400">User ID</Text>
        <Input
          defaultValue={defaultUserId}
          placeholder="@username:server"
          name="userIdInput"
          variant="SurfaceVariant"
          size="500"
          radii="400"
          required
          autoFocus
          autoComplete="off"
          disabled={disabled}
        />
        {invalidUserId && (
          <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
            <Icon src={Icons.Warning} filled size="50" />
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>Please enter a valid User ID.</b>
            </Text>
          </Box>
        )}
      </Box>
      <Box shrink="No" direction="Column" gap="100">
        <Text size="L400">Options</Text>
        <SequenceCard
          style={{ padding: config.space.S300 }}
          variant="SurfaceVariant"
          direction="Column"
          gap="500"
        >
          <SettingTile
            title="End-to-End Encryption"
            description="Once this feature is enabled, it can't be disabled after the room is created."
            after={
              <Switch
                variant="Primary"
                value={encryption}
                onChange={setEncryption}
                disabled={disabled}
              />
            }
          />
        </SequenceCard>
      </Box>
      {error && (
        <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="200">
          <Icon src={Icons.Warning} filled size="100" />
          <Text size="T300" style={{ color: color.Critical.Main }}>
            <b>
              {error instanceof MatrixError && error.name === (ErrorCode.M_LIMIT_EXCEEDED as string)
                ? `Server rate-limited your request for ${millisecondsToMinutes(
                    (error.data.retry_after_ms as number | undefined) ?? 0
                  )} minutes!`
                : error.message}
            </b>
          </Text>
        </Box>
      )}
      <Box shrink="No" direction="Column" gap="200">
        <Button
          type="submit"
          size="500"
          variant="Primary"
          radii="400"
          disabled={disabled}
          before={loading && <Spinner variant="Primary" fill="Solid" size="200" />}
        >
          <Text size="B500">Create</Text>
        </Button>
      </Box>
    </Box>
  );
}
