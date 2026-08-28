import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
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
  RoomContext,
  TrackMutedIndicator,
  TrackToggle,
  useConnectionState,
  useEnsureTrackRef,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { ConnectionState, Track, type Participant, type Room } from 'livekit-client';
import { SpeakerHigh, sizedIcon } from '$components/icons/phosphor';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useRoom } from '$hooks/useRoom';
import {
  livekitJsCallInitialMediaAppliedAtom,
  type LivekitJsCallMedia,
} from '$state/livekitJsCall';
import { buildRtcIdentityMap, type UserIdByRtcIdentity } from '@sableclient/matrixrtc';
import {
  CallParticipantAvatar,
  CallParticipantName,
  useCallParticipantProfile,
} from './LivekitCallParticipant';
import { CallControlBar, CallLayout } from './callChrome';
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
  const profile = useCallParticipantProfile(
    participant.identity,
    participant.isLocal,
    userIdByIdentity
  );
  const isScreenShare = source === Track.Source.ScreenShare;

  return (
    <>
      {publication ? (
        // Without this, iOS WKWebView pops its own PiP overlay over the call.
        <VideoTrack trackRef={trackRef} disablePictureInPicture />
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
  const profile = useCallParticipantProfile(
    participant.identity,
    participant.isLocal,
    userIdByIdentity,
    192
  );
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
      style={{ width: '100%', height: '100%' }}
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
      // Both layouts need an explicit width: their parent Box is a flex row, and
      // every video is absolutely positioned, so laying out on intrinsic width
      // collapses the focus pane to the carousel's and blanks the screen share.
      <FocusLayoutContainer
        style={{
          display: 'flex',
          gap: config.space.S200,
          width: '100%',
          height: '100%',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <FocusLayout
          trackRef={screenShare}
          style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
        >
          <CallTileContent userIdByIdentity={userIdByIdentity} />
        </FocusLayout>
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
        width: '100%',
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

  // Only Disconnected is an actual loss. SignalReconnecting keeps media flowing
  // while the signal link re-establishes, and Connecting is the initial
  // handshake, so neither deserves the critical treatment.
  const lost = connectionState === ConnectionState.Disconnected;
  const label =
    connectionState === ConnectionState.Connecting
      ? 'Connecting…'
      : lost
        ? 'Connection lost'
        : 'Reconnecting…';
  return (
    <Box
      role={lost ? 'alert' : 'status'}
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
        background: lost ? color.Critical.Container : color.Warning.Container,
        color: lost ? color.Critical.OnContainer : color.Warning.OnContainer,
        pointerEvents: 'none',
      }}
    >
      <Text size="T200">{label}</Text>
    </Box>
  );
}

const deviceErrorMessages: Partial<Record<Track.Source, string>> = {
  [Track.Source.Microphone]: 'Microphone unavailable. Check your browser permissions.',
  [Track.Source.Camera]: 'Camera unavailable. Check your browser permissions.',
  [Track.Source.ScreenShare]: 'Screen sharing was not started.',
};

function LivekitJsCallContent({
  mediaReady,
  initialMedia,
  onHangup,
}: {
  mediaReady: boolean;
  initialMedia: LivekitJsCallMedia;
  onHangup: () => void;
}) {
  const tracks = useTracks(trackSources, trackOptions);
  const screenShareSupported = typeof navigator?.mediaDevices?.getDisplayMedia === 'function';
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
  const [appliedInitialMedia, setAppliedInitialMedia] = useAtom(
    livekitJsCallInitialMediaAppliedAtom
  );

  const handleDeviceError = useCallback(({ source }: { source: Track.Source }) => {
    setDeviceError(deviceErrorMessages[source] ?? 'A media device is unavailable.');
  }, []);

  // In an encrypted room, publishing before the local key is imported would
  // send frames in the clear, so the prescreen choice waits for `mediaReady`.
  // An unencrypted room is ready straight away and never waits on Matrix keys.
  useEffect(() => {
    if (!mediaReady || appliedInitialMedia) return;
    setAppliedInitialMedia(true);
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
  }, [
    mediaReady,
    initialMedia,
    localParticipant,
    handleDeviceError,
    appliedInitialMedia,
    setAppliedInitialMedia,
  ]);

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
    <CallLayout
      onKeyDown={revealControls}
      callSurfaceMarker
      className={css.CallSurface}
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={() => setControlsVisible(true)}
    >
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
      <CallControlBar
        layout="overlay"
        visible={controlsVisible}
        onFocusCapture={() => setControlsVisible(true)}
      >
        {mediaReady ? (
          <>
            <ControlBar
              variation="minimal"
              controls={{ leave: false, screenShare: false }}
              onDeviceError={handleDeviceError}
            />
            {screenShareSupported && (
              // ControlBar hardcodes selfBrowserSurface: 'include', which offers
              // the window showing the call and hangs the browser on capturing
              // itself.
              <TrackToggle
                source={Track.Source.ScreenShare}
                // PipeWire portals reliably provide the selected video surface;
                // requesting system audio can reject the whole capture request.
                captureOptions={{ audio: false, selfBrowserSurface: 'exclude' }}
                showIcon
                aria-label="Share screen"
                onDeviceError={() => handleDeviceError({ source: Track.Source.ScreenShare })}
              />
            )}
            <MediaDeviceMenu kind="audiooutput" aria-label="Select speaker">
              {sizedIcon(SpeakerHigh, '300')}
            </MediaDeviceMenu>
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
      </CallControlBar>
    </CallLayout>
  );
}

export function LivekitJsCallSurface({
  room,
  mediaReady,
  initialMedia,
  onHangup,
}: {
  room: Room;
  mediaReady: boolean;
  initialMedia: LivekitJsCallMedia;
  onHangup: () => void;
}) {
  return (
    <RoomContext.Provider value={room}>
      <LivekitJsCallContent
        mediaReady={mediaReady}
        initialMedia={initialMedia}
        onHangup={onHangup}
      />
    </RoomContext.Provider>
  );
}
