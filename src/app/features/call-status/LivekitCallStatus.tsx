import { Box } from 'folds';
import { useAtom } from 'jotai';
import { RoomContext, useLocalParticipant } from '@livekit/components-react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { ScreenSize, useScreenSize } from '$hooks/useScreenSize';
import { livekitJsCallSoundAtom, type LivekitJsCallSession } from '$state/livekitJsCall';
import { livekitJsCallStatus } from '$features/call/callClient';
import { MicrophoneButton, ScreenShareButton, SoundButton, VideoButton } from './CallControl';
import { CallStatusShell, HangupChip } from './CallStatusShell';
import { StatusDivider } from './components';

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
            onToggle={() =>
              void localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
                audio: true,
                selfBrowserSurface: 'exclude',
              })
            }
          />
        )}
      </Box>
      <StatusDivider />
      <HangupChip compact={compact} onHangup={onHangup} />
    </Box>
  );
}

export function LivekitCallStatus({ session }: { session: LivekitJsCallSession }) {
  const mx = useMatrixClient();
  const screenSize = useScreenSize();
  const room = mx.getRoom(session.roomId);
  const compact = screenSize === ScreenSize.Mobile;

  if (!room) return null;

  return (
    <CallStatusShell
      room={room}
      compact={compact}
      connected={livekitJsCallStatus(session).phase === 'connected'}
      controls={
        session.room ? (
          <RoomContext.Provider value={session.room}>
            <LivekitCallControl compact={compact} onHangup={session.hangup} />
          </RoomContext.Provider>
        ) : (
          <HangupChip compact={compact} onHangup={session.hangup} />
        )
      }
    />
  );
}
