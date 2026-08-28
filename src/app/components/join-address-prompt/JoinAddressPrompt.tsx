import type { FormEventHandler } from 'react';
import { useState } from 'react';
import { config, Box, Text, Button, Input, color } from 'folds';
import { isRoomAlias, isRoomId } from '$utils/matrix';
import { parseMatrixToRoom, parseMatrixToRoomEvent, testMatrixTo } from '$plugins/matrix-to';
import { PromptDialog } from '$components/modal-overlay/PromptDialog';

type JoinAddressProps = {
  onOpen: (roomIdOrAlias: string, via?: string[], eventId?: string) => void;
  onCancel: () => void;
};
export function JoinAddressPrompt({ onOpen, onCancel }: JoinAddressProps) {
  const [invalid, setInvalid] = useState(false);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setInvalid(false);

    const target = evt.target as HTMLFormElement | undefined;
    const addressInput = target?.addressInput as HTMLInputElement | undefined;
    const address = addressInput?.value.trim();
    if (!address) return;

    if (isRoomId(address) || isRoomAlias(address)) {
      onOpen(address);
      return;
    }

    if (testMatrixTo(address)) {
      const encodedAddress = address;
      const decodedAddress = encodedAddress && decodeURIComponent(encodedAddress);
      const toRoom = parseMatrixToRoom(decodedAddress);
      if (toRoom) {
        onOpen(toRoom.roomIdOrAlias, toRoom.viaServers);
        return;
      }

      const toEvent = parseMatrixToRoomEvent(decodedAddress);
      if (toEvent) {
        onOpen(toEvent.roomIdOrAlias, toEvent.viaServers, toEvent.eventId);
        return;
      }
    }

    setInvalid(true);
  };

  return (
    <PromptDialog title="Join with Address" requestClose={onCancel}>
      <Box
        as="form"
        onSubmit={handleSubmit}
        style={{ padding: config.space.S400, paddingTop: 0 }}
        direction="Column"
        gap="400"
      >
        <Box direction="Column" gap="200">
          <Text priority="400" size="T300">
            Enter public address to join the community. Addresses looks like:
          </Text>
          <Text as="ul" size="T200" priority="300" style={{ paddingLeft: config.space.S400 }}>
            <li>#community:server</li>
            <li>https://matrix.to/#/#community:server</li>
            <li>https://matrix.to/#/!xYzAj?via=server</li>
          </Text>
        </Box>
        <Box direction="Column" gap="100">
          <Text size="L400">Address</Text>
          <Input
            size="500"
            autoFocus
            name="addressInput"
            variant="Background"
            placeholder="#community:server"
            required
          />
          {invalid && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>Invalid Address</b>
            </Text>
          )}
        </Box>
        <Button type="submit" variant="Primary">
          <Text size="B400">Open</Text>
        </Button>
      </Box>
    </PromptDialog>
  );
}
