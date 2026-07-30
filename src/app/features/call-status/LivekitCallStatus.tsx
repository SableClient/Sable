import { useCallback } from 'react';
import { Box, Chip, Spinner, Text } from 'folds';
import classNames from 'classnames';
import { useAtom } from 'jotai';
import { RoomContext, useLocalParticipant } from '@livekit/components-react';
import { PhoneDisconnect, sizedIcon } from '$components/icons/phosphor';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { ScreenSize, useScreenSize } from '$hooks/useScreenSize';
import { useAsyncCallback, AsyncStatus } from '$hooks/useAsyncCallback';
import { ContainerColor } from '$styles/ContainerColor.css';
import { livekitJsCallSoundAtom, type LivekitJsCallSession } from '$state/livekitJsCall';
import { LiveChip } from './LiveChip';
import { CallRoomName } from './CallRoomName';
import { MemberGlance } from './MemberGlance';
import { StatusDivider } from './components';
import { MicrophoneButton, ScreenShareButton, SoundButton, VideoButton } from './CallControl';
import * as css from './styles.css';

// LiveKit speaker detection drives the in-call surface; the status bar only
// needs the roster, so it opts out of the highlight.
const noSpeakers = new Set<string>();

function HangupChip({ compact, onHangup }: { compact: boolean; onHangup: () => Promise<void> }) {
  const [hangupState, hangup] = useAsyncCallback(useCallback(() => onHangup(), [onHangup]));
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  return (
    <Chip
      variant="Critical"
      radii="Pill"
      fill="Soft"
      before={
        exiting ? (
          <Spinner variant="Critical" fill="Soft" size="50" />
        ) : (
          sizedIcon(PhoneDisconnect, '50', { filled: true })
        )
      }
      disabled={exiting}
      outlined
      onClick={() => hangup()}
    >
      {!compact && (
        <Text as="span" size="L400">
          End
        </Text>
      )}
    </Chip>
  );
}

function LivekitCallControl({
  compact,
  onHangup,
}: {
  compact: boolean;
  onHangup: () => Promise<void>;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const [sound, setSound] = useAtom(livekitJsCallSoundAtom);

  return (
    <Box shrink="No" alignItems="Center" gap="300">
      <Box alignItems="Inherit" gap="200">
        <MicrophoneButton
          enabled={isMicrophoneEnabled}
          onToggle={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        />
        <SoundButton enabled={sound} onToggle={() => setSound(!sound)} />
        {!compact && <StatusDivider />}
        <VideoButton
          enabled={isCameraEnabled}
          onToggle={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />
        {!compact && (
          <ScreenShareButton
            enabled={isScreenShareEnabled}
            onToggle={() => void localParticipant.setScreenShareEnabled(!isScreenShareEnabled)}
          />
        )}
      </Box>
      <StatusDivider />
      <HangupChip compact={compact} onHangup={onHangup} />
    </Box>
  );
}

function LivekitCallStatusBar({
  session,
  room,
  compact,
}: {
  session: LivekitJsCallSession;
  room: Room;
  compact: boolean;
}) {
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const memberVisible = session.lifecycle === 'active' && callMembers.length > 0;

  return (
    <Box
      className={classNames(css.CallStatus, ContainerColor({ variant: 'Background' }))}
      shrink="No"
      gap="400"
    >
      <Box grow="Yes" alignItems="Center" gap="200">
        {memberVisible ? (
          <Box shrink="No">
            <LiveChip count={callMembers.length} room={room} members={callMembers} />
          </Box>
        ) : (
          <Spinner variant="Secondary" size="200" />
        )}
        <Box grow="Yes" alignItems="Center" gap="Inherit">
          {!compact && <CallRoomName room={room} />}
        </Box>
        {memberVisible && (
          <Box shrink="No">
            <MemberGlance room={room} members={callMembers} speakers={noSpeakers} />
          </Box>
        )}
      </Box>
      {memberVisible && !compact && <StatusDivider />}
      <Box shrink="No" alignItems="Center" gap="Inherit">
        {compact && (
          <Box grow="Yes">
            <CallRoomName room={room} />
          </Box>
        )}
        {session.room ? (
          <RoomContext.Provider value={session.room}>
            <LivekitCallControl compact={compact} onHangup={session.hangup} />
          </RoomContext.Provider>
        ) : (
          <HangupChip compact={compact} onHangup={session.hangup} />
        )}
      </Box>
    </Box>
  );
}

export function LivekitCallStatus({ session }: { session: LivekitJsCallSession }) {
  const mx = useMatrixClient();
  const screenSize = useScreenSize();
  const room = mx.getRoom(session.roomId);

  if (!room) return null;

  return (
    <LivekitCallStatusBar
      session={session}
      room={room}
      compact={screenSize === ScreenSize.Mobile}
    />
  );
}
