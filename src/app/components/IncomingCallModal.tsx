import {
  Avatar,
  Box,
  Button,
  color,
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
  toRem,
} from 'folds';
import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useLivekitSupport } from '$hooks/useLivekitSupport';
import { useRoomName } from '$hooks/useRoomMeta';
import { useCallEmbed } from '$hooks/useCallEmbed';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { getMxIdLocalPart } from '$utils/matrix';
import { getMemberDisplayName, getRoomAvatarUrl } from '$utils/room';
import { webRTCSupported } from '$utils/rtc';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import FocusTrap from 'focus-trap-react';
import * as Sentry from '@sentry/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  autoJoinCallIntentAtom,
  callSoundBlockedAtom,
  incomingCallAtom,
  mutedCallRoomIdAtom,
  type IncomingCall,
} from '$state/callEmbed';
import { createDebugLogger } from '$utils/debugLogger';
import { dismissSystemCallNotifications } from '$features/call/callNotificationBridge';
import { RoomAvatar } from './room-avatar';
import { UserAvatar } from './user-avatar';

const debugLog = createDebugLogger('IncomingCall');

type IncomingCallInternalProps = {
  room: Room;
  incomingCall: IncomingCall;
  onClose: () => void;
};

type CapabilityIssue = {
  id: string;
  message: string;
  shortReason: string;
};

export function IncomingCallInternal({ room, incomingCall, onClose }: IncomingCallInternalProps) {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;
  const roomName = useRoomName(room);
  const livekitSupported = useLivekitSupport();
  const callEmbed = useCallEmbed();
  const { navigateRoom } = useRoomNavigate();
  const roomAvatarUrl = getRoomAvatarUrl(mx, room, 96);
  const setAutoJoinIntent = useSetAtom(autoJoinCallIntentAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);
  const setCallSoundBlocked = useSetAtom(callSoundBlockedAtom);
  const callSoundBlocked = useAtomValue(callSoundBlockedAtom);
  const callerDisplayName =
    getMemberDisplayName(room, incomingCall.senderId) ??
    getMxIdLocalPart(incomingCall.senderId) ??
    incomingCall.senderId;
  const callerAvatarMxc = room.getMember(incomingCall.senderId)?.getMxcAvatarUrl();
  const callerAvatarUrl = callerAvatarMxc
    ? (mx.mxcUrlToHttp(callerAvatarMxc, 96, 96, 'crop') ?? undefined)
    : undefined;

  const isRingNotification = incomingCall.notificationType === 'ring';
  const isDirectRing = incomingCall.isDirect && incomingCall.notificationType === 'ring';
  const isVideoIntent = incomingCall.intentKind === 'video';
  const inAnotherCall = Boolean(callEmbed && callEmbed.roomId !== room.roomId);
  const canUseWebRTC = webRTCSupported();
  const myUserId = mx.getSafeUserId();
  const hasCallMemberPermission =
    room.currentState?.maySendStateEvent('org.matrix.msc3401.call.member', myUserId) ?? false;

  const capabilityIssues = useMemo<CapabilityIssue[]>(() => {
    const issues: CapabilityIssue[] = [];

    if (!canUseWebRTC) {
      issues.push({
        id: 'webrtc',
        message: 'Your browser does not support WebRTC calling.',
        shortReason: 'WebRTC is unavailable in this browser.',
      });
    }
    if (!livekitSupported) {
      issues.push({
        id: 'livekit',
        message: 'Your homeserver does not expose a LiveKit call focus.',
        shortReason: 'Homeserver call focus is unavailable.',
      });
    }
    if (!hasCallMemberPermission) {
      issues.push({
        id: 'permission',
        message: "You don't have permission to join this room's call.",
        shortReason: 'Missing permission to join this call.',
      });
    }
    if (inAnotherCall) {
      issues.push({
        id: 'another_call',
        message: 'You are already in another call.',
        shortReason: 'Finish your current call first.',
      });
    }

    return issues;
  }, [canUseWebRTC, livekitSupported, hasCallMemberPermission, inAnotherCall]);

  const canAnswer = capabilityIssues.length === 0;
  const primaryBlockedReason = capabilityIssues[0]?.shortReason;

  const incomingLabel = isRingNotification
    ? isVideoIntent
      ? 'Incoming video call'
      : 'Incoming voice call'
    : 'Incoming room call notification';
  const dismissLabel = isDirectRing ? 'Decline' : 'Ignore';
  const closeLabel = isDirectRing ? 'Close and decline call' : 'Close and ignore notification';
  const showCallerAvatar = incomingCall.isDirect;
  const title = showCallerAvatar ? callerDisplayName : roomName;
  const subtitle = showCallerAvatar ? roomName : callerDisplayName;

  const handleAnswer = () => {
    if (!canAnswer) return;
    setCallSoundBlocked(false);

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
    void dismissSystemCallNotifications(room.roomId);
    onClose();
    navigateRoom(room.roomId);
  };

  const handleDeclineOrIgnore = () => {
    setCallSoundBlocked(false);
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

    setMutedRoomId(room.roomId);
    void dismissSystemCallNotifications(room.roomId);
    onClose();

    if (isDirectRing) {
      void mx.sendRtcDecline(room.roomId, incomingCall.notificationEventId).catch((error) => {
        debugLog.warn('call', 'Failed to send RTC decline event', {
          roomId: room.roomId,
          notificationEventId: incomingCall.notificationEventId,
          error: error instanceof Error ? error.message : String(error),
        });
        Sentry.metrics.count('sable.call.decline.error', 1);
      });
    }
  };

  const handleModalKeyDown = (evt: ReactKeyboardEvent<HTMLDivElement>) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      evt.stopPropagation();
      handleDeclineOrIgnore();
      return;
    }
    if (evt.key === 'Enter' && canAnswer) {
      evt.preventDefault();
      evt.stopPropagation();
      handleAnswer();
    }
  };

  return (
    <Dialog
      variant="Surface"
      onKeyDown={handleModalKeyDown}
      aria-label={`${incomingLabel} in ${roomName}`}
      style={{ width: 'min(340px, calc(100vw - 2rem))', maxWidth: toRem(340) }}
    >
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
        <IconButton
          size="300"
          onClick={handleDeclineOrIgnore}
          radii="300"
          aria-label={closeLabel}
          title={closeLabel}
        >
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>

      <Box
        style={{
          padding: compact ? config.space.S400 : config.space.S600,
          paddingBottom: `max(${compact ? config.space.S500 : config.space.S600}, env(safe-area-inset-bottom))`,
        }}
        direction="Column"
        alignItems="Center"
        gap={compact ? '400' : '500'}
      >
        <Avatar size="500">
          {showCallerAvatar ? (
            <UserAvatar
              userId={incomingCall.senderId}
              src={callerAvatarUrl}
              alt={callerDisplayName}
              renderFallback={() => <Icon size="200" src={Icons.User} filled />}
            />
          ) : (
            <RoomAvatar
              roomId={room.roomId}
              src={roomAvatarUrl ?? undefined}
              alt={roomName}
              renderFallback={() => <Icon size="200" src={Icons.Hash} filled />}
            />
          )}
        </Avatar>

        <Box direction="Column" alignItems="Center" gap="100">
          <Text size="L400" align="Center" truncate>
            {title}
          </Text>
          <Text priority="400" size="T300" align="Center">
            {incomingLabel}
          </Text>
          <Text priority="300" size="T200" align="Center">
            {showCallerAvatar ? `Room: ${subtitle}` : `Caller: ${subtitle}`}
          </Text>
        </Box>

        {capabilityIssues.length > 0 && (
          <Box
            direction="Column"
            gap="100"
            style={{
              width: '100%',
              border: `1px solid ${color.Surface.ContainerLine}`,
              borderRadius: toRem(8),
              padding: config.space.S300,
            }}
          >
            {capabilityIssues.map((issue) => (
              <Text key={issue.id} size="T200" style={{ color: color.Critical.Main }}>
                {issue.message}
              </Text>
            ))}
          </Box>
        )}

        <Box gap="300" style={{ width: '100%' }} justifyContent="Center">
          <Button
            variant="Critical"
            fill="Soft"
            style={{ minWidth: '110px' }}
            onClick={handleDeclineOrIgnore}
            aria-label={dismissLabel === 'Decline' ? 'Decline call' : 'Ignore call notification'}
            autoFocus={!canAnswer}
          >
            <Text size="B400">{dismissLabel}</Text>
          </Button>
          <Button
            fill="Solid"
            variant="Primary"
            style={{ minWidth: '110px' }}
            onClick={handleAnswer}
            disabled={!canAnswer}
            before={<Icon size="100" src={isVideoIntent ? Icons.VideoCamera : Icons.Phone} />}
            aria-label={isVideoIntent ? 'Answer video call' : 'Answer voice call'}
            autoFocus={canAnswer}
          >
            <Text size="B400">Answer</Text>
          </Button>
        </Box>
        {!canAnswer && primaryBlockedReason && (
          <Text size="T200" priority="300" align="Center">
            {primaryBlockedReason}
          </Text>
        )}
        {callSoundBlocked && (
          <Text size="T200" style={{ color: color.Warning.Main }} align="Center">
            Call sound was blocked by your browser. Click any call action to re-enable sound.
          </Text>
        )}
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
            escapeDeactivates: false,
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
