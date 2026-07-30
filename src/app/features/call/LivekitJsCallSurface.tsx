import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import * as css from './LivekitJsCallSurface.css';

const controlIdleDelay = 3500;

function GridTile() {
  return (
    <ParticipantTile
      style={{
        position: 'relative',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    />
  );
}

function CarouselTile() {
  return <ParticipantTile style={{ position: 'relative', minWidth: 0, overflow: 'hidden' }} />;
}

function MediaLayout({ tracks }: { tracks: ReturnType<typeof useTracks> }) {
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
            <CarouselTile />
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
      <GridTile />
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
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const localScreenShare = tracks.some(
    (track) => track.source === Track.Source.ScreenShare && track.participant.isLocal
  );
  const hasVideo = tracks.some((track) => track.publication !== undefined);
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
      className={css.CallSurface}
      role="region"
      aria-label="Call"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={() => setControlsVisible(true)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--sable-livekit-canvas, #090b10)',
      }}
    >
      <RoomAudioRenderer />
      <Box style={{ position: 'absolute', inset: 0, padding: config.space.S200, minHeight: 0 }}>
        <MediaLayout tracks={tracks} />
      </Box>
      {!hasVideo && (
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
          <ControlBar
            variation="minimal"
            controls={{ microphone: true, camera: true, screenShare: true, leave: false }}
          />
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

export function LivekitJsCallSurface({ room, onHangup }: { room: Room; onHangup: () => void }) {
  const [portalTarget] = useState<HTMLElement>(
    () => document.getElementById('portalContainer') ?? document.body
  );

  return createPortal(
    <RoomContext.Provider value={room}>
      <LivekitJsCallContent onHangup={onHangup} />
    </RoomContext.Provider>,
    portalTarget
  );
}
