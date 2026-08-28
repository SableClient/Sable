import { Box } from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { ScreenSize, useScreenSize } from '$hooks/useScreenSize';
import type { NativeCallSession } from '$state/nativeCall';
import { nativeCallStatus } from '$features/call/callClient';
import { MicrophoneButton, VideoButton } from './CallControl';
import { CallStatusShell, HangupChip } from './CallStatusShell';
import { StatusDivider } from './components';

function NativeCallControl({ session, compact }: { session: NativeCallSession; compact: boolean }) {
  // Media commands are rejected until the native room has connected.
  const disabled = nativeCallStatus(session).phase !== 'connected';

  return (
    <Box shrink="No" alignItems="Center" gap="300">
      <Box alignItems="Inherit" gap="200">
        <MicrophoneButton
          enabled={session.microphoneEnabled}
          onToggle={() => session.setMicrophoneEnabled(!session.microphoneEnabled)}
          disabled={disabled}
        />
        {!compact && <StatusDivider />}
        {(session.capabilities?.camera ?? true) && (
          <VideoButton
            enabled={session.cameraEnabled}
            onToggle={() => session.setCameraEnabled(!session.cameraEnabled)}
            disabled={disabled}
          />
        )}
      </Box>
      <StatusDivider />
      <HangupChip compact={compact} onHangup={session.hangup} />
    </Box>
  );
}

export function NativeCallStatus({ session }: { session: NativeCallSession }) {
  const mx = useMatrixClient();
  const screenSize = useScreenSize();
  const room = mx.getRoom(session.roomId);
  const compact = screenSize === ScreenSize.Mobile;

  if (!room) return null;

  return (
    <CallStatusShell
      room={room}
      compact={compact}
      connected={nativeCallStatus(session).phase === 'connected'}
      controls={<NativeCallControl session={session} compact={compact} />}
    />
  );
}
