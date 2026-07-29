import { useState } from 'react';
import {
  Microphone,
  MicrophoneSlash,
  ScreenShare,
  VideoCamera,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import {
  Box,
  Button,
  color,
  config,
  IconButton,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
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
import { SequenceCard } from '$components/sequence-card';
import { useScreenSizeOptionally, ScreenSize } from '$hooks/useScreenSize';
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
  'platform-lifecycle-failed': 'Mobile call media is unavailable on this device.',
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
    return (
      <SequenceCard
        variant="SurfaceVariant"
        radii="500"
        alignItems="Center"
        justifyContent="Center"
        direction="Column"
        gap="100"
        style={{
          minHeight: toRem(180),
          width: '100%',
          boxSizing: 'border-box',
          border: `1px dashed ${color.Surface.ContainerLine}`,
          textAlign: 'center',
        }}
      >
        <Text size="T300">Your camera and screen share will appear here.</Text>
        <Text size="T200" style={{ color: color.Surface.OnContainer }}>
          Choose a control below to begin the test.
        </Text>
      </SequenceCard>
    );
  }

  return (
    <SequenceCard
      variant="SurfaceVariant"
      radii="500"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${toRem(180)}, 1fr))`,
        gap: config.space.S200,
        width: '100%',
        padding: config.space.S200,
        boxSizing: 'border-box',
      }}
    >
      {tracks.map((track) => (
        <ParticipantTile
          key={`${track.participant.identity}-${track.source}`}
          trackRef={track}
          style={{
            minHeight: toRem(180),
            overflow: 'hidden',
            borderRadius: config.radii.R400,
            background: color.Surface.Container,
          }}
        >
          <VideoTrack trackRef={track} />
          <Text
            size="T200"
            style={{
              position: 'absolute',
              bottom: config.space.S100,
              left: config.space.S100,
              padding: `${config.space.S0} ${config.space.S100}`,
              borderRadius: config.radii.R300,
              background: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            {track.participant.identity === localIdentity ? 'You' : track.participant.identity}
          </Text>
        </ParticipantTile>
      ))}
    </SequenceCard>
  );
}

function MediaControl({
  label,
  enabled,
  pending,
  icon,
  compact,
  onClick,
}: {
  label: string;
  enabled: boolean;
  pending: boolean;
  icon: typeof Microphone;
  compact: boolean;
  onClick: () => void;
}) {
  const labelText = label.replace(/^(Turn on|Turn off|Start|Stop) /, '');

  return (
    <Box alignItems="Center" direction="Column" gap="100">
      <TooltipProvider
        position="Top"
        delay={500}
        tooltip={
          <Tooltip>
            <Text size="T200">{label}</Text>
          </Tooltip>
        }
      >
        {(anchorRef) => (
          <IconButton
            ref={anchorRef}
            aria-label={label}
            variant={enabled ? 'Success' : 'Surface'}
            fill="Soft"
            radii="400"
            size="400"
            outlined
            disabled={pending}
            onClick={onClick}
          >
            {sizedIcon(icon, '300', { filled: enabled })}
          </IconButton>
        )}
      </TooltipProvider>
      {!compact && (
        <Text size="T200" align="Center">
          {labelText}
        </Text>
      )}
    </Box>
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
  const compact = useScreenSizeOptionally() === ScreenSize.Mobile;
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
    <Box
      alignItems="Center"
      direction="Column"
      gap="300"
      grow="Yes"
      style={{
        width: '100%',
        maxWidth: toRem(920),
        margin: '0 auto',
        padding: `${config.space.S400} ${config.space.S300}`,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <RoomAudioRenderer />
      <Box direction="Column" gap="100" style={{ width: '100%' }}>
        <Box alignItems="Center" justifyContent="SpaceBetween" gap="200" style={{ width: '100%' }}>
          <Text size="L400">Browser media test</Text>
          <Text size="T200" style={{ color: color.Secondary.Main }}>
            Experimental
          </Text>
        </Box>
        <Text size="T300">Manual local media test only · browser testing only</Text>
      </Box>
      <Box direction={compact ? 'Column' : 'Row'} gap="100" style={{ width: '100%' }}>
        <SequenceCard variant="Success" radii="500" style={{ flex: 1 }}>
          <Text size="T200">Connected</Text>
        </SequenceCard>
        <SequenceCard variant="Warning" radii="500" style={{ flex: 1 }}>
          <Text size="T200">Encrypted media is required</Text>
        </SequenceCard>
      </Box>
      <VideoTiles localIdentity={localParticipant.identity} />
      <Box
        alignItems="Center"
        justifyContent="Center"
        gap="300"
        style={{ width: '100%', flexWrap: 'wrap' }}
      >
        <MediaControl
          label={isMicrophoneEnabled ? 'Turn off microphone' : 'Turn on microphone'}
          enabled={isMicrophoneEnabled}
          pending={pending !== undefined}
          icon={isMicrophoneEnabled ? Microphone : MicrophoneSlash}
          compact={compact}
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
          compact={compact}
          onClick={() =>
            void runMediaAction('camera', () => media.setCameraEnabled(!isCameraEnabled))
          }
        />
        <MediaControl
          label={isScreenShareEnabled ? 'Stop screen sharing' : 'Start screen sharing'}
          enabled={isScreenShareEnabled}
          pending={pending !== undefined}
          icon={ScreenShare}
          compact={compact}
          onClick={() =>
            void runMediaAction('screen', () => media.setScreenShareEnabled(!isScreenShareEnabled))
          }
        />
      </Box>
      {error && (
        <SequenceCard
          variant="Critical"
          radii="500"
          role="alert"
          alignItems="Center"
          style={{
            width: '100%',
            padding: config.space.S200,
            boxSizing: 'border-box',
          }}
        >
          <Text size="T300" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        </SequenceCard>
      )}
      {pending && (
        <Text size="T200" style={{ color: color.Surface.OnContainer }}>
          Updating {pending === 'screen' ? 'screen share' : pending}…
        </Text>
      )}
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          End call
        </Text>
      </Button>
    </Box>
  );
}
