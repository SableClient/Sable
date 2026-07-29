import { useState } from 'react';
import {
  Microphone,
  MicrophoneSlash,
  ScreenShare,
  VideoCamera,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import { Box, Button, color, IconButton, Text } from 'folds';
import {
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { Track, type Room } from 'livekit-client';
import type { LivekitJsCallSession } from '$state/livekitJsCall';
import type { LivekitJsMediaFacade, LivekitJsMediaFailure } from './livekitJsController';

export const canRenderLivekitJsMediaTest = (
  enabled: boolean,
  session: LivekitJsCallSession | undefined
): session is LivekitJsCallSession & { room: Room; media: LivekitJsMediaFacade } =>
  enabled &&
  session?.lifecycle === 'active' &&
  session.room !== undefined &&
  session.media !== undefined;

const mediaFailureMessages: Record<LivekitJsMediaFailure, string> = {
  'media-test-disabled': 'Manual media test is disabled.',
  'e2ee-unsupported': 'Encrypted media is unavailable.',
  'e2ee-key-not-ready': 'Waiting for encrypted media keys.',
  'e2ee-key-failed': 'Encrypted media setup failed.',
  'room-not-active': 'The LiveKit room is not active.',
  'media-operation-failed': 'The media operation failed.',
};

const getMediaFailureMessage = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code in mediaFailureMessages
  ) {
    return mediaFailureMessages[error.code as LivekitJsMediaFailure];
  }
  return 'The media operation failed.';
};

function VideoTiles({ localIdentity }: { localIdentity: string }) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });

  if (tracks.length === 0) {
    return <Text size="T300">No camera or screen-share tracks are active.</Text>;
  }

  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '8px',
        width: '100%',
      }}
    >
      {tracks.map((track) => (
        <ParticipantTile
          key={`${track.participant.identity}-${track.source}`}
          trackRef={track}
          style={{
            minHeight: '120px',
            overflow: 'hidden',
            borderRadius: '12px',
            background: 'var(--sable-surface-container-low)',
          }}
        >
          <VideoTrack trackRef={track} />
          <Text
            size="T200"
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              padding: '2px 6px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            {track.participant.identity === localIdentity ? 'You' : track.participant.identity}
          </Text>
        </ParticipantTile>
      ))}
    </Box>
  );
}

function MediaControl({
  label,
  enabled,
  pending,
  icon,
  onClick,
}: {
  label: string;
  enabled: boolean;
  pending: boolean;
  icon: typeof Microphone;
  onClick: () => void;
}) {
  return (
    <IconButton
      aria-label={label}
      variant={enabled ? 'Success' : 'Surface'}
      fill="Soft"
      radii="300"
      size="300"
      outlined
      disabled={pending}
      onClick={onClick}
    >
      {sizedIcon(icon, '100', { filled: enabled })}
    </IconButton>
  );
}

export function LivekitJsMediaTestSurface({
  room,
  media,
  onHangup,
}: {
  room: Room;
  media: LivekitJsMediaFacade;
  onHangup: () => void;
}) {
  return (
    <RoomContext.Provider value={room}>
      <LivekitJsMediaTestContent media={media} onHangup={onHangup} />
    </RoomContext.Provider>
  );
}

function LivekitJsMediaTestContent({
  media,
  onHangup,
}: {
  media: LivekitJsMediaFacade;
  onHangup: () => void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const [pending, setPending] = useState<'microphone' | 'camera' | 'screen' | undefined>();
  const [error, setError] = useState<string>();

  const runMediaAction = async (
    kind: 'microphone' | 'camera' | 'screen',
    action: () => Promise<void>
  ): Promise<void> => {
    if (pending) return;
    setPending(kind);
    setError(undefined);
    try {
      await action();
    } catch (actionError) {
      setError(getMediaFailureMessage(actionError));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <Box alignItems="Center" justifyContent="Center" direction="Column" gap="200" grow="Yes">
      <RoomAudioRenderer />
      <Text size="L400">LiveKit JS manual media test</Text>
      <Text size="T300" align="Center">
        Manual local media test only · encrypted media is required · not release-ready
      </Text>
      <VideoTiles localIdentity={localParticipant.identity} />
      <Box alignItems="Center" gap="200">
        <MediaControl
          label={isMicrophoneEnabled ? 'Turn off microphone' : 'Turn on microphone'}
          enabled={isMicrophoneEnabled}
          pending={pending !== undefined}
          icon={isMicrophoneEnabled ? Microphone : MicrophoneSlash}
          onClick={() =>
            void runMediaAction('microphone', () =>
              media.setMicrophoneEnabled(!isMicrophoneEnabled)
            )
          }
        />
        <MediaControl
          label={isCameraEnabled ? 'Stop camera' : 'Start camera'}
          enabled={isCameraEnabled}
          pending={pending !== undefined}
          icon={isCameraEnabled ? VideoCamera : VideoCameraSlash}
          onClick={() =>
            void runMediaAction('camera', () => media.setCameraEnabled(!isCameraEnabled))
          }
        />
        <MediaControl
          label={isScreenShareEnabled ? 'Stop screen sharing' : 'Start screen sharing'}
          enabled={isScreenShareEnabled}
          pending={pending !== undefined}
          icon={ScreenShare}
          onClick={() =>
            void runMediaAction('screen', () => media.setScreenShareEnabled(!isScreenShareEnabled))
          }
        />
      </Box>
      {error && (
        <Text size="T300" style={{ color: color.Critical.Main }}>
          {error}
        </Text>
      )}
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          End
        </Text>
      </Button>
    </Box>
  );
}
