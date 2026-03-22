import {
  Box,
  Dialog,
  Header,
  IconButton,
  Text,
  Button,
  Avatar,
  config,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
} from 'folds';
import { PhoneIcon } from '@phosphor-icons/react/dist/csr/Phone';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomName } from '$hooks/useRoomMeta';
import { getRoomAvatarUrl } from '$utils/room';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import * as Sentry from '@sentry/react';
import { useAtom, useSetAtom } from 'jotai';
import {
  autoJoinCallIntentAtom,
  incomingCallRoomIdAtom,
  mutedCallRoomIdAtom,
} from '$state/callEmbed';
import { createDebugLogger } from '$utils/debugLogger';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { RoomAvatar } from './room-avatar';

const debugLog = createDebugLogger('IncomingCall');

type IncomingCallInternalProps = {
  room: any;
  onClose: () => void;
};

export function IncomingCallInternal({ room, onClose }: IncomingCallInternalProps) {
  const mx = useMatrixClient();
  const roomName = useRoomName(room);
  const { navigateRoom } = useRoomNavigate();
  const avatarUrl = getRoomAvatarUrl(mx, room, 96);
  const setAutoJoinIntent = useSetAtom(autoJoinCallIntentAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

  const handleAnswer = () => {
    debugLog.info('call', 'Incoming call answered', { roomId: room.roomId });
    Sentry.addBreadcrumb({
      category: 'call.signal',
      message: 'Incoming call answered',
      data: { roomId: room.roomId },
    });
    Sentry.metrics.count('sable.call.answered', 1);
    setMutedRoomId(room.roomId);
    setAutoJoinIntent(room.roomId);
    onClose();
    navigateRoom(room.roomId);
  };

  const handleDecline = async () => {
    debugLog.info('call', 'Incoming call declined', { roomId: room.roomId });
    Sentry.addBreadcrumb({
      category: 'call.signal',
      message: 'Incoming call declined',
      data: { roomId: room.roomId },
    });
    Sentry.metrics.count('sable.call.declined', 1);
    setMutedRoomId(room.roomId);
    onClose();
  };

  return (
    <Dialog variant="Surface" style={{ width: '340px' }}>
      <Header
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
          borderBottomWidth: config.borderWidth.B300,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes">
          <Text size="H4">Incoming Call</Text>
        </Box>
        <IconButton size="300" onClick={onClose} radii="300">
          <PhosphorIcon as={XIcon} />
        </IconButton>
      </Header>

      <Box style={{ padding: config.space.S600 }} direction="Column" alignItems="Center" gap="500">
        <Avatar size="500">
          <RoomAvatar
            roomId={room.roomId}
            src={avatarUrl ?? undefined}
            alt={roomName}
            renderFallback={() => <PhosphorIcon size="200" as={UserIcon} weight="fill" />}
          />
        </Avatar>

        <Box direction="Column" alignItems="Center" gap="100">
          <Text size="L400" align="Center" truncate>
            {roomName}
          </Text>
          <Text priority="400" size="T300" align="Center">
            Incoming voice chat request
          </Text>
        </Box>

        <Box gap="300" style={{ width: '100%' }} justifyContent="Center">
          <Button
            variant="Critical"
            fill="Soft"
            style={{ minWidth: '110px' }}
            onClick={handleDecline}
          >
            <Text size="B400">Decline</Text>
          </Button>
          <Button
            fill="Solid"
            variant="Primary"
            style={{ minWidth: '110px' }}
            onClick={handleAnswer}
            before={<PhosphorIcon size="100" as={PhoneIcon} />}
          >
            <Text size="B400">Answer</Text>
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

export function IncomingCallModal() {
  const [ringingRoomId, setRingingRoomId] = useAtom(incomingCallRoomIdAtom);
  const mx = useMatrixClient();
  const room = ringingRoomId ? mx.getRoom(ringingRoomId) : null;

  if (!ringingRoomId || !room) return null;

  const close = () => setRingingRoomId(null);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <div>
            <IncomingCallInternal room={room} onClose={close} />
          </div>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
