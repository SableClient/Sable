import {
  Avatar,
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
} from 'folds';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomName } from '$hooks/useRoomMeta';
import { getRoomAvatarUrl } from '$utils/room';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import * as Sentry from '@sentry/react';
import { useAtom, useSetAtom } from 'jotai';
import { autoJoinCallIntentAtom, incomingCallAtom, mutedCallRoomIdAtom, type IncomingCall } from '$state/callEmbed';
import { createDebugLogger } from '$utils/debugLogger';
import { RoomAvatar } from './room-avatar';

const debugLog = createDebugLogger('IncomingCall');

type IncomingCallInternalProps = {
  room: Room;
  incomingCall: IncomingCall;
  onClose: () => void;
};

export function IncomingCallInternal({ room, incomingCall, onClose }: IncomingCallInternalProps) {
  const mx = useMatrixClient();
  const roomName = useRoomName(room);
  const { navigateRoom } = useRoomNavigate();
  const avatarUrl = getRoomAvatarUrl(mx, room, 96);
  const setAutoJoinIntent = useSetAtom(autoJoinCallIntentAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

  const isDirectRing = incomingCall.isDirect && incomingCall.notificationType === 'ring';
  const isVideoIntent = incomingCall.intentKind === 'video';

  const handleAnswer = () => {
    debugLog.info('call', 'Incoming call answered', {
      roomId: room.roomId,
      notificationEventId: incomingCall.notificationEventId,
      notificationType: incomingCall.notificationType,
      intent: incomingCall.intentRaw,
    });
    Sentry.addBreadcrumb({
      category: 'call.signal',
      message: 'Incoming call answered',
      data: {
        roomId: room.roomId,
        notificationEventId: incomingCall.notificationEventId,
      },
    });
    Sentry.metrics.count('sable.call.answered', 1, {
      attributes: {
        type: incomingCall.notificationType,
        dm: String(incomingCall.isDirect),
        intent: incomingCall.intentKind,
      },
    });

    setMutedRoomId(room.roomId);
    setAutoJoinIntent({ roomId: room.roomId, video: isVideoIntent });
    onClose();
    navigateRoom(room.roomId);
  };

  const handleDeclineOrIgnore = async () => {
    const action = isDirectRing ? 'decline' : 'ignore';
    debugLog.info('call', 'Incoming call dismissed', {
      roomId: room.roomId,
      action,
      notificationEventId: incomingCall.notificationEventId,
      notificationType: incomingCall.notificationType,
    });
    Sentry.addBreadcrumb({
      category: 'call.signal',
      message: `Incoming call ${action}`,
      data: {
        roomId: room.roomId,
        notificationEventId: incomingCall.notificationEventId,
      },
    });
    Sentry.metrics.count(`sable.call.${action}d`, 1, {
      attributes: {
        type: incomingCall.notificationType,
        dm: String(incomingCall.isDirect),
      },
    });

    if (isDirectRing) {
      try {
        await mx.sendRtcDecline(room.roomId, incomingCall.notificationEventId);
      } catch (error) {
        debugLog.warn('call', 'Failed to send RTC decline event', {
          roomId: room.roomId,
          notificationEventId: incomingCall.notificationEventId,
          error: error instanceof Error ? error.message : String(error),
        });
        Sentry.metrics.count('sable.call.decline.error', 1);
      }
    }

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
        <IconButton size="300" onClick={handleDeclineOrIgnore} radii="300">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>

      <Box style={{ padding: config.space.S600 }} direction="Column" alignItems="Center" gap="500">
        <Avatar size="500">
          <RoomAvatar
            roomId={room.roomId}
            src={avatarUrl ?? undefined}
            alt={roomName}
            renderFallback={() => <Icon size="200" src={Icons.User} filled />}
          />
        </Avatar>

        <Box direction="Column" alignItems="Center" gap="100">
          <Text size="L400" align="Center" truncate>
            {roomName}
          </Text>
          <Text priority="400" size="T300" align="Center">
            {isVideoIntent ? 'Incoming video chat request' : 'Incoming voice chat request'}
          </Text>
        </Box>

        <Box gap="300" style={{ width: '100%' }} justifyContent="Center">
          <Button
            variant="Critical"
            fill="Soft"
            style={{ minWidth: '110px' }}
            onClick={handleDeclineOrIgnore}
          >
            <Text size="B400">{isDirectRing ? 'Decline' : 'Ignore'}</Text>
          </Button>
          <Button
            fill="Solid"
            variant="Primary"
            style={{ minWidth: '110px' }}
            onClick={handleAnswer}
            before={<Icon size="100" src={isVideoIntent ? Icons.VideoCamera : Icons.Phone} />}
          >
            <Text size="B400">Answer</Text>
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

export function IncomingCallModal() {
  const [incomingCall, setIncomingCall] = useAtom(incomingCallAtom);
  const mx = useMatrixClient();
  const room = incomingCall ? mx.getRoom(incomingCall.roomId) : null;

  if (!incomingCall || !room) return null;

  const close = () => setIncomingCall(null);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            escapeDeactivates: stopPropagation,
          }}
        >
          <div>
            <IncomingCallInternal room={room} incomingCall={incomingCall} onClose={close} />
          </div>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
