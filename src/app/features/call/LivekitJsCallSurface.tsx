import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, color, config, Text, toRem } from 'folds';
import {
  CarouselLayout,
  ControlBar,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  useConnectionState,
  useTracks,
} from '@livekit/components-react';
import { ConnectionState, Track, type Room } from 'livekit-client';

const controlIdleDelay = 3500;

function TrackTile() {
  return <ParticipantTile style={{ minWidth: 0, minHeight: 0, overflow: 'hidden' }} />;
}

function MediaLayout({ tracks }: { tracks: ReturnType<typeof useTracks> }) {
  const screenShare = tracks.find((track) => track.source === Track.Source.ScreenShare);

  if (screenShare) {
    const remainingTracks = tracks.filter((track) => track !== screenShare);
    return (
      <FocusLayoutContainer
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(160px, 25%)',
          gap: config.space.S200,
          height: '100%',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <FocusLayout
          trackRef={screenShare}
          style={{ minWidth: 0, minHeight: 0, overflow: 'hidden' }}
        />
        <CarouselLayout
          tracks={remainingTracks}
          orientation="vertical"
          style={{ minWidth: 0, minHeight: 0, overflowY: 'auto' }}
        >
          <TrackTile />
        </CarouselLayout>
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
      <TrackTile />
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

function LivekitJsCallContent({ onHangup }: { onHangup: () => void }) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      <RoomAudioRenderer />
      <Box style={{ position: 'absolute', inset: 0 }}>
        <MediaLayout tracks={tracks} />
      </Box>
      {tracks.every((track) => track.publication === undefined) && (
        <Box
          alignItems="Center"
          justifyContent="Center"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Text size="L400" style={{ color: color.Surface.OnContainer }}>
            Audio call
          </Text>
        </Box>
      )}
      <ConnectionFeedback />
      <Box
        data-livekit-controls
        onFocusCapture={() => setControlsVisible(true)}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: config.space.S300,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          gap: config.space.S200,
          transform: 'translateX(-50%)',
          padding: config.space.S100,
          borderRadius: config.radii.R500,
          background: 'rgba(9, 11, 16, 0.86)',
          opacity: controlsVisible ? 1 : 0,
          transition: 'opacity 160ms ease',
          pointerEvents: controlsVisible ? 'all' : 'none',
        }}
      >
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: true, screenShare: true, leave: false }}
        />
        <Button size="300" variant="Critical" fill="Solid" radii="Pill" onClick={onHangup}>
          <Text as="span" size="B300">
            End call
          </Text>
        </Button>
      </Box>
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
