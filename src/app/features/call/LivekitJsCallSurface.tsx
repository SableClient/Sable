import { useState } from 'react';
import {
  Microphone,
  MicrophoneSlash,
  ScreenShare,
  VideoCamera,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import { Box, Button, color, config, IconButton, Text, toRem } from 'folds';
import {
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { ConnectionState, Track, type Room } from 'livekit-client';
import { SequenceCard } from '$components/sequence-card';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';

function ParticipantVideoGrid({
  localIdentity,
  tracks,
}: {
  localIdentity: string;
  tracks: ReturnType<typeof useTracks>;
}) {
  if (tracks.length === 0) return null;

  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${toRem(220)}, 1fr))`,
        gap: config.space.S200,
        width: '100%',
      }}
    >
      {tracks.map((track) => {
        if (!track.publication) return null;
        const identity = track.participant.identity;
        const label = identity === localIdentity ? 'You' : identity;
        return (
          <ParticipantTile
            key={`${identity}-${track.source}`}
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
                padding: `0 ${config.space.S100}`,
                borderRadius: config.radii.R300,
                background: 'rgba(0, 0, 0, 0.68)',
              }}
            >
              {label}
            </Text>
          </ParticipantTile>
        );
      })}
    </Box>
  );
}

function MediaButton({
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
      radii="400"
      size="400"
      outlined
      disabled={pending}
      onClick={onClick}
    >
      {sizedIcon(icon, '300', { filled: enabled })}
    </IconButton>
  );
}

function LivekitJsCallContent({ onHangup }: { onHangup: () => void }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const compact = useScreenSizeOptionally() === ScreenSize.Mobile;
  const [pending, setPending] = useState<'microphone' | 'camera' | 'screen' | undefined>();
  const [error, setError] = useState<string>();

  const runAction = async (
    kind: 'microphone' | 'camera' | 'screen',
    action: () => Promise<void>
  ): Promise<void> => {
    if (pending) return;
    setPending(kind);
    setError(undefined);
    try {
      await action();
    } catch {
      setError('Could not update call audio or video.');
    } finally {
      setPending(undefined);
    }
  };

  const remoteCount = Math.max(0, participants.length - 1);
  const hasVideo = tracks.some((track) => track.publication !== undefined);
  const reconnecting = connectionState === ConnectionState.Reconnecting;
  const disconnected = connectionState === ConnectionState.Disconnected;

  return (
    <Box
      grow="Yes"
      direction="Column"
      gap="300"
      style={{
        width: '100%',
        minHeight: 0,
        maxWidth: toRem(1120),
        margin: '0 auto',
        padding: `${config.space.S300} ${config.space.S400}`,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <RoomAudioRenderer />
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
        <Box direction="Column" gap="100">
          <Text size="L400">New call</Text>
          <Text size="T300" style={{ color: color.Surface.OnContainer }}>
            {remoteCount > 0 ? `${remoteCount} other${remoteCount === 1 ? '' : 's'}` : 'Just you'}
          </Text>
        </Box>
        <SequenceCard variant={reconnecting || disconnected ? 'Warning' : 'Success'} radii="500">
          <Text size="T200">
            {reconnecting ? 'Reconnecting' : disconnected ? 'Connection lost' : 'Connected'}
          </Text>
        </SequenceCard>
      </Box>

      {reconnecting && (
        <SequenceCard variant="Warning" radii="500" role="status" justifyContent="Center">
          <Text size="T300">Trying to restore the call…</Text>
        </SequenceCard>
      )}
      {disconnected && (
        <SequenceCard variant="Critical" radii="500" role="alert" justifyContent="Center">
          <Text size="T300">The call connection was lost.</Text>
        </SequenceCard>
      )}

      {!hasVideo && (
        <SequenceCard
          variant="SurfaceVariant"
          radii="500"
          alignItems="Center"
          justifyContent="Center"
          direction="Column"
          gap="100"
          style={{ minHeight: toRem(220), textAlign: 'center' }}
        >
          <Text size="L400">Audio call</Text>
          <Text size="T300">
            {remoteCount > 0 ? 'Your microphone is live.' : 'Waiting for someone to join.'}
          </Text>
          <Box direction="Column" gap="100" alignItems="Center">
            {participants.map((participant) => (
              <Text key={participant.identity} size="T200">
                {participant.identity === localParticipant.identity ? 'You' : participant.identity}
              </Text>
            ))}
          </Box>
        </SequenceCard>
      )}
      <ParticipantVideoGrid localIdentity={localParticipant.identity} tracks={tracks} />

      <Box
        direction={compact ? 'Column' : 'Row'}
        alignItems="Center"
        justifyContent="Center"
        gap="200"
        style={{ flexWrap: 'wrap' }}
      >
        <MediaButton
          label={isMicrophoneEnabled ? 'Turn off microphone' : 'Turn on microphone'}
          enabled={isMicrophoneEnabled}
          pending={pending !== undefined}
          icon={isMicrophoneEnabled ? Microphone : MicrophoneSlash}
          onClick={() =>
            void runAction('microphone', async () => {
              await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
            })
          }
        />
        <MediaButton
          label={isCameraEnabled ? 'Stop camera' : 'Start camera'}
          enabled={isCameraEnabled}
          pending={pending !== undefined}
          icon={isCameraEnabled ? VideoCamera : VideoCameraSlash}
          onClick={() =>
            void runAction('camera', async () => {
              await localParticipant.setCameraEnabled(!isCameraEnabled);
            })
          }
        />
        <MediaButton
          label={isScreenShareEnabled ? 'Stop screen sharing' : 'Start screen sharing'}
          enabled={isScreenShareEnabled}
          pending={pending !== undefined}
          icon={ScreenShare}
          onClick={() =>
            void runAction('screen', async () => {
              await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
            })
          }
        />
        <Button size="300" variant="Critical" fill="Soft" radii="Pill" onClick={onHangup}>
          <Text as="span" size="B300">
            End call
          </Text>
        </Button>
      </Box>
      {pending && (
        <Text size="T200" align="Center" style={{ color: color.Surface.OnContainer }}>
          Updating {pending === 'screen' ? 'screen share' : pending}…
        </Text>
      )}
      {error && (
        <SequenceCard variant="Critical" radii="500" role="alert" justifyContent="Center">
          <Text size="T300" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        </SequenceCard>
      )}
    </Box>
  );
}

export function LivekitJsCallSurface({ room, onHangup }: { room: Room; onHangup: () => void }) {
  return (
    <RoomContext.Provider value={room}>
      <LivekitJsCallContent onHangup={onHangup} />
    </RoomContext.Provider>
  );
}
