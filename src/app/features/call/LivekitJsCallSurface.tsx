import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, color, config, Text, toRem } from 'folds';
import {
  CarouselLayout,
  ConnectionQualityIndicator,
  ControlBar,
  MediaDeviceMenu,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  TrackMutedIndicator,
  useConnectionState,
  useEnsureTrackRef,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { ConnectionState, Track, type Participant, type Room } from 'livekit-client';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useRoom } from '$hooks/useRoom';
import type { LivekitJsCallMedia } from '$state/livekitJsCall';
import { buildRtcIdentityMap, type UserIdByRtcIdentity } from './livekitCallIdentity';
import {
  CallParticipantAvatar,
  CallParticipantName,
  useCallParticipantProfile,
} from './LivekitCallParticipant';
import * as css from './LivekitJsCallSurface.css';

const controlIdleDelay = 3500;

// Camera carries a placeholder so participants without video still get a tile;
// screen share must not, or every participant would fake a shared screen.
const trackSources = [
  { source: Track.Source.Camera, withPlaceholder: true },
  { source: Track.Source.ScreenShare, withPlaceholder: false },
];

const trackOptions = { onlySubscribed: false };

function CallTileContent({ userIdByIdentity }: { userIdByIdentity: UserIdByRtcIdentity }) {
  const trackRef = useEnsureTrackRef();
  const { participant, publication, source } = trackRef;
  const profile = useCallParticipantProfile(participant.identity, userIdByIdentity);
  const isScreenShare = source === Track.Source.ScreenShare;

  return (
    <>
      {publication ? (
        <VideoTrack trackRef={trackRef} />
      ) : (
        <div className="lk-participant-placeholder">
          <CallParticipantAvatar profile={profile} size="min(96px, 40%)" />
        </div>
      )}
      <div className="lk-participant-metadata">
        <div className="lk-participant-metadata-item">
          {!isScreenShare && (
            <TrackMutedIndicator
              trackRef={{ participant, source: Track.Source.Microphone }}
              show="muted"
            />
          )}
          <span className="lk-participant-name">
            {isScreenShare ? `${profile.name}'s screen` : profile.name}
          </span>
        </div>
        <ConnectionQualityIndicator className="lk-participant-metadata-item" />
      </div>
    </>
  );
}

function GridTile({ userIdByIdentity }: { userIdByIdentity: UserIdByRtcIdentity }) {
  return (
    <ParticipantTile
      style={{
        position: 'relative',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <CallTileContent userIdByIdentity={userIdByIdentity} />
    </ParticipantTile>
  );
}

function CarouselTile({ userIdByIdentity }: { userIdByIdentity: UserIdByRtcIdentity }) {
  return (
    <ParticipantTile style={{ position: 'relative', minWidth: 0, overflow: 'hidden' }}>
      <CallTileContent userIdByIdentity={userIdByIdentity} />
    </ParticipantTile>
  );
}

function AudioCallParticipant({
  participant,
  userIdByIdentity,
}: {
  participant: Participant;
  userIdByIdentity: UserIdByRtcIdentity;
}) {
  const profile = useCallParticipantProfile(participant.identity, userIdByIdentity, 192);
  const speaking = useIsSpeaking(participant);

  return (
    <Box
      className={css.AudioParticipant}
      data-lk-speaking={speaking ? 'true' : 'false'}
      direction="Column"
      alignItems="Center"
      gap="200"
    >
      <CallParticipantAvatar profile={profile} size={toRem(96)} />
      <CallParticipantName profile={profile} />
    </Box>
  );
}

function AudioCallLayout({ userIdByIdentity }: { userIdByIdentity: UserIdByRtcIdentity }) {
  const participants = useParticipants();

  return (
    <Box
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="500"
      style={{ height: '100%' }}
    >
      <Text size="L400" style={{ color: color.Surface.OnContainer, opacity: 0.7 }}>
        Audio call
      </Text>
      <Box wrap="Wrap" justifyContent="Center" alignItems="Center" gap="400">
        {participants.map((participant) => (
          <AudioCallParticipant
            key={participant.identity}
            participant={participant}
            userIdByIdentity={userIdByIdentity}
          />
        ))}
      </Box>
    </Box>
  );
}

function MediaLayout({
  tracks,
  userIdByIdentity,
}: {
  tracks: ReturnType<typeof useTracks>;
  userIdByIdentity: UserIdByRtcIdentity;
}) {
  const screenShare = tracks.find((track) => track.source === Track.Source.ScreenShare);

  if (screenShare) {
    const remainingTracks = tracks.filter((track) => track !== screenShare);
    return (
      <FocusLayoutContainer
        style={{
          display: 'flex',
          gap: config.space.S200,
          height: '100%',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <FocusLayout
          trackRef={screenShare}
          style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
        />
        {remainingTracks.length > 0 && (
          <CarouselLayout
            tracks={remainingTracks}
            orientation="vertical"
            style={{ minWidth: 0, minHeight: 0, overflowY: 'auto' }}
          >
            <CarouselTile userIdByIdentity={userIdByIdentity} />
          </CarouselLayout>
        )}
      </FocusLayoutContainer>
    );
  }

  return (
    <GridLayout
      tracks={tracks}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(var(--lk-col-count, 1), minmax(0, 1fr))',
        gridTemplateRows: 'repeat(var(--lk-row-count, 1), minmax(0, 1fr))',
        gap: config.space.S200,
        height: '100%',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <GridTile userIdByIdentity={userIdByIdentity} />
    </GridLayout>
  );
}

function ConnectionFeedback() {
  const connectionState = useConnectionState();
  if (connectionState === ConnectionState.Connected) return null;

  const reconnecting = connectionState === ConnectionState.Reconnecting;
  return (
    <Box
      role={reconnecting ? 'status' : 'alert'}
      alignItems="Center"
      justifyContent="Center"
      style={{
        position: 'absolute',
        top: toRem(16),
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        padding: `${config.space.S100} ${config.space.S200}`,
        borderRadius: config.radii.R500,
        background: reconnecting ? color.Warning.Container : color.Critical.Container,
        color: reconnecting ? color.Warning.OnContainer : color.Critical.OnContainer,
        pointerEvents: 'none',
      }}
    >
      <Text size="T200">{reconnecting ? 'Reconnecting…' : 'Connection lost'}</Text>
    </Box>
  );
}

const deviceErrorMessages: Partial<Record<Track.Source, string>> = {
  [Track.Source.Microphone]: 'Microphone unavailable. Check your browser permissions.',
  [Track.Source.Camera]: 'Camera unavailable. Check your browser permissions.',
  [Track.Source.ScreenShare]: 'Screen sharing was not started.',
};

function LivekitJsCallContent({
  e2eeReady,
  initialMedia,
  onHangup,
}: {
  e2eeReady: boolean;
  initialMedia: LivekitJsCallMedia;
  onHangup: () => void;
}) {
  const tracks = useTracks(trackSources, trackOptions);
  const localScreenShare = tracks.some(
    (track) => track.source === Track.Source.ScreenShare && track.participant.isLocal
  );
  const hasVideo = tracks.some((track) => track.publication !== undefined);
  const matrixRoom = useRoom();
  const callSession = useCallSession(matrixRoom);
  const callMembers = useCallMembers(matrixRoom, callSession);
  const userIdByIdentity = useMemo(() => buildRtcIdentityMap(callMembers), [callMembers]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [deviceError, setDeviceError] = useState<string | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { localParticipant } = useLocalParticipant();
  const appliedInitialMedia = useRef(false);

  const handleDeviceError = useCallback(({ source }: { source: Track.Source }) => {
    setDeviceError(deviceErrorMessages[source] ?? 'A media device is unavailable.');
  }, []);

  // Publishing before the local key is imported would send unencrypted frames,
  // so the prescreen choice is applied on the first render where E2EE is ready.
  useEffect(() => {
    if (!e2eeReady || appliedInitialMedia.current) return;
    appliedInitialMedia.current = true;
    localParticipant
      .setMicrophoneEnabled(
        initialMedia.microphone,
        initialMedia.audioDeviceId ? { deviceId: initialMedia.audioDeviceId } : undefined
      )
      .catch(() => handleDeviceError({ source: Track.Source.Microphone }));
    if (initialMedia.camera) {
      localParticipant
        .setCameraEnabled(
          true,
          initialMedia.videoDeviceId ? { deviceId: initialMedia.videoDeviceId } : undefined
        )
        .catch(() => handleDeviceError({ source: Track.Source.Camera }));
    }
  }, [e2eeReady, initialMedia, localParticipant, handleDeviceError]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!document.activeElement?.closest('[data-livekit-controls]')) {
        setControlsVisible(false);
      }
    }, controlIdleDelay);
  }, []);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [revealControls]);

  return (
    <Box
      data-livekit-call-surface
      className={css.CallSurface}
      role="region"
      aria-label="Call"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={() => setControlsVisible(true)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--sable-livekit-canvas, #090b10)',
      }}
    >
      <RoomAudioRenderer muted={!initialMedia.sound} />
      <Box style={{ position: 'absolute', inset: 0, padding: config.space.S200, minHeight: 0 }}>
        {hasVideo ? (
          <MediaLayout tracks={tracks} userIdByIdentity={userIdByIdentity} />
        ) : (
          <AudioCallLayout userIdByIdentity={userIdByIdentity} />
        )}
      </Box>
      <ConnectionFeedback />
      {deviceError && (
        <Box
          role="alert"
          alignItems="Center"
          justifyContent="Center"
          style={{
            position: 'absolute',
            top: toRem(56),
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3,
            padding: `${config.space.S100} ${config.space.S200}`,
            borderRadius: config.radii.R500,
            background: color.Critical.Container,
            color: color.Critical.OnContainer,
          }}
        >
          <Text size="T200">{deviceError}</Text>
          <Button
            size="300"
            variant="Critical"
            fill="None"
            onClick={() => setDeviceError(undefined)}
          >
            <Text as="span" size="B300">
              Dismiss
            </Text>
          </Button>
        </Box>
      )}
      {localScreenShare && (
        <Box
          role="status"
          style={{
            position: 'absolute',
            top: config.space.S300,
            right: config.space.S300,
            zIndex: 3,
            padding: `${config.space.S100} ${config.space.S300}`,
            borderRadius: config.radii.R500,
            background: 'rgba(9, 11, 16, 0.72)',
            color: color.Surface.OnContainer,
            pointerEvents: 'none',
          }}
        >
          <Text size="T200">Sharing your screen</Text>
        </Box>
      )}
      <Box
        data-livekit-controls
        role="group"
        aria-label="Call controls"
        onFocusCapture={() => setControlsVisible(true)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 4,
          display: 'flex',
          justifyContent: 'center',
          padding: `${config.space.S200} ${config.space.S300} calc(${config.space.S300} + env(safe-area-inset-bottom, 0px))`,
          opacity: controlsVisible ? 1 : 0,
          visibility: controlsVisible ? 'visible' : 'hidden',
          transition: 'opacity 160ms ease, visibility 160ms ease',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: config.space.S200,
            padding: config.space.S100,
            maxWidth: '100%',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: config.radii.R500,
            background: 'rgba(9, 11, 16, 0.72)',
            backdropFilter: 'blur(12px)',
            pointerEvents: controlsVisible ? 'auto' : 'none',
          }}
        >
          {e2eeReady ? (
            <>
              <ControlBar
                variation="minimal"
                controls={{ leave: false }}
                onDeviceError={handleDeviceError}
              />
              <MediaDeviceMenu kind="audiooutput" aria-label="Select speaker" />
            </>
          ) : (
            <Text size="T200" style={{ padding: `0 ${config.space.S200}` }}>
              Securing call…
            </Text>
          )}
          <Button
            size="300"
            variant="Critical"
            fill="Solid"
            radii="Pill"
            style={{
              minHeight: toRem(44),
              paddingRight: config.space.S400,
              paddingLeft: config.space.S400,
            }}
            onClick={onHangup}
          >
            <Text as="span" size="B300">
              End call
            </Text>
          </Button>
        </div>
      </Box>
    </Box>
  );
}

export function LivekitJsCallSurface({
  room,
  e2eeReady,
  initialMedia,
  onHangup,
}: {
  room: Room;
  e2eeReady: boolean;
  initialMedia: LivekitJsCallMedia;
  onHangup: () => void;
}) {
  return (
    <RoomContext.Provider value={room}>
      <LivekitJsCallContent e2eeReady={e2eeReady} initialMedia={initialMedia} onHangup={onHangup} />
    </RoomContext.Provider>
  );
}
