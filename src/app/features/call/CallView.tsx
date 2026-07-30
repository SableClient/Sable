import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Badge, Box, Button, color, Header, Scroll, Text, toRem } from 'folds';
import { useAtomValue } from 'jotai';
import { ContainerColor } from '$styles/ContainerColor.css';
import { useRoom } from '$hooks/useRoom';
import { useCallStartCapabilities } from './useCallStartCapabilities';

import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useCallEmbed, useCallEmbedPlacementSync, useCallJoined } from '$hooks/useCallEmbed';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import * as css from './styles.css';
import { CallMemberRenderer } from './CallMemberCard';
import { PrescreenControls } from './PrescreenControls';
import { callEmbedAtom, callEmbedStartErrorAtom } from '$state/callEmbed';
import { canJoinCall } from './callStartCapabilities';
import type { LivekitJsCallSession } from '$state/livekitJsCall';
import { livekitJsCallAtom } from '$state/livekitJsCall';
import type { NativeCallSession } from '$state/nativeCall';
import { nativeCallAtom } from '$state/nativeCall';
import { LivekitJsCallSurface } from './LivekitJsCallSurface';
import { MicrophoneButton, VideoButton } from './Controls';

function LivekitServerMissingMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your homeserver does not support calling. You can still join calls started by others.
    </Text>
  );
}

function WebRTCMissingError() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your browser does not support WebRTC, which is required for calling.
    </Text>
  );
}

function JoinMessage({
  hasParticipant,
  livekitSupported,
  rtcSupported,
}: {
  hasParticipant?: boolean;
  livekitSupported?: boolean;
  rtcSupported?: boolean;
}) {
  if (rtcSupported === false) {
    return <WebRTCMissingError />;
  }

  if (hasParticipant) return null;

  if (livekitSupported === false) {
    return <LivekitServerMissingMessage />;
  }

  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      Voice chat&apos;s empty - be the first to hop in!
    </Text>
  );
}

function NoPermissionMessage() {
  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      You don&apos;t have permission to join!
    </Text>
  );
}

function AlreadyInCallMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Warning.Main }} size="L400" align="Center">
      Already in another call - end the current call to join.
    </Text>
  );
}

function WidgetPreparationErrorMessage({ message }: { message: string }) {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      {message}
    </Text>
  );
}

const nativeCallLifecycleLabels: Record<NativeCallSession['lifecycle'], string> = {
  starting: 'Starting call',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Call failed',
};

export function NativeCallSurface({
  session,
  onHangup,
}: {
  session: NativeCallSession;
  onHangup: () => void;
}) {
  const isError = session.lifecycle === 'error';
  const controlsDisabled = isError || session.lifecycle !== 'connected';

  return (
    <Box alignItems="Center" justifyContent="Center" direction="Column" gap="300" grow="Yes">
      <Box direction="Column" gap="100" alignItems="Center">
        <Text size="L400">New call</Text>
        <Text size="T300">{nativeCallLifecycleLabels[session.lifecycle]}</Text>
        {session.error && (
          <Text style={{ color: color.Critical.Main }} size="T300" align="Center">
            {session.error} Dismiss this call to try again.
          </Text>
        )}
      </Box>
      {!isError && (
        <Box direction="Row" gap="200" alignItems="Center">
          <MicrophoneButton
            enabled={session.microphoneEnabled}
            onToggle={() => void session.setMicrophoneEnabled(!session.microphoneEnabled)}
            disabled={controlsDisabled}
          />
          <VideoButton
            enabled={session.cameraEnabled}
            onToggle={() => void session.setCameraEnabled(!session.cameraEnabled)}
            disabled={controlsDisabled}
          />
        </Box>
      )}
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          {isError ? 'Dismiss' : 'End'}
        </Text>
      </Button>
    </Box>
  );
}

const livekitJsLifecycleLabels: Record<LivekitJsCallSession['lifecycle'], string> = {
  idle: 'Idle',
  'joining-matrix': 'Joining call',
  provisioning: 'Preparing call',
  'connecting-livekit': 'Connecting',
  active: 'Connected',
  stopping: 'Ending call',
  failed: 'Call failed',
};

const livekitJsFailureMessages: Record<NonNullable<LivekitJsCallSession['failure']>, string> = {
  'e2ee-unsupported': 'Encrypted calls are not supported on this device.',
  'e2ee-import-failed': 'Could not set up call encryption.',
  'setup-failed': 'Could not connect to the call.',
};

export function LivekitJsCallStatus({
  session,
  onHangup,
}: {
  session: Pick<LivekitJsCallSession, 'lifecycle' | 'failure'>;
  onHangup: () => void;
}) {
  const failed = session.lifecycle === 'failed';
  const failureMessage = session.failure ? livekitJsFailureMessages[session.failure] : undefined;

  return (
    <Box alignItems="Center" justifyContent="Center" direction="Column" gap="300" grow="Yes">
      <Box direction="Column" gap="100" alignItems="Center">
        <Text size="L400">{livekitJsLifecycleLabels[session.lifecycle]}</Text>
        {failureMessage && (
          <Text style={{ color: color.Critical.Main }} size="T300" align="Center">
            {failureMessage}
          </Text>
        )}
      </Box>
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          {failed ? 'Dismiss' : 'End'}
        </Text>
      </Button>
    </Box>
  );
}

function CallPrescreen() {
  const room = useRoom();
  const callEmbed = useAtomValue(callEmbedAtom);
  const callEmbedStartError = useAtomValue(callEmbedStartErrorAtom);
  const callJoined = useCallJoined(callEmbed);
  const callStartCapabilities = useCallStartCapabilities(room);

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const hasParticipant = callMembers.length > 0;
  const showEmbedError =
    callEmbed?.roomId === room.roomId && !callJoined && callEmbedStartError !== null;
  const embedErrorMessage =
    callEmbedStartError?.kind === 'capability'
      ? 'Call setup failed because required call capabilities were rejected.'
      : 'Call setup failed while preparing the embedded call app.';

  const canJoin = canJoinCall(callStartCapabilities, hasParticipant);

  return (
    <Scroll variant="Surface" hideTrack>
      <Box className={css.CallViewContent} alignItems="Center" justifyContent="Center">
        <Box style={{ maxWidth: toRem(382), width: '100%' }} direction="Column" gap="100">
          {hasParticipant && (
            <Header size="300">
              <Box grow="Yes" alignItems="Center">
                <Text size="L400">Participant</Text>
              </Box>
              <Badge variant="Critical" fill="Solid" size="400">
                <Text as="span" size="L400" truncate>
                  {callMembers.length} Live
                </Text>
              </Badge>
            </Header>
          )}
          <CallMemberRenderer members={callMembers} />
          <PrescreenControls canJoin={canJoin} />
          <Box className={css.PrescreenMessage} alignItems="Center">
            {!callStartCapabilities.inAnotherCall &&
              (callStartCapabilities.hasCallMemberPermission ? (
                <JoinMessage
                  hasParticipant={hasParticipant}
                  livekitSupported={callStartCapabilities.livekitSupported}
                  rtcSupported={callStartCapabilities.webRTCSupported}
                />
              ) : (
                <NoPermissionMessage />
              ))}
            {callStartCapabilities.inAnotherCall && <AlreadyInCallMessage />}
            {showEmbedError && (
              <WidgetPreparationErrorMessage
                message={callEmbedStartError.message || embedErrorMessage}
              />
            )}
          </Box>
        </Box>
      </Box>
    </Scroll>
  );
}

type CallJoinedProps = {
  containerRef: RefObject<HTMLDivElement>;
};

function CallJoined({ containerRef }: CallJoinedProps) {
  return (
    <Box grow="Yes" direction="Column" style={{ position: 'relative' }}>
      <Box grow="Yes" ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </Box>
  );
}

interface CallViewProps {
  resizable?: boolean;
}

export function CallView({ resizable }: CallViewProps) {
  const room = useRoom();
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;

  const callViewRef = useRef<HTMLDivElement>(null);
  const callContainerRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(callContainerRef);

  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const livekitJsCall = useAtomValue(livekitJsCallAtom);
  const nativeCall = useAtomValue(nativeCallAtom);

  const livekitJsCallForRoom = livekitJsCall?.roomId === room.roomId ? livekitJsCall : undefined;
  const nativeCallForRoom = nativeCall?.roomId === room.roomId ? nativeCall : undefined;
  const livekitJsRoom =
    livekitJsCallForRoom?.lifecycle === 'active' ? livekitJsCallForRoom.room : undefined;
  const currentJoined =
    !livekitJsCallForRoom && !nativeCallForRoom && callEmbed?.roomId === room.roomId && callJoined;

  const [heightRatio, setHeightRatio] = useState(isMobile ? 0.3 : 0.72);
  const [availableHeight, setAvailableHeight] = useState(0);

  useEffect(() => {
    if (!resizable || !callViewRef.current) return undefined;
    const container = callViewRef.current.parentElement?.parentElement;
    if (!container) return undefined;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setAvailableHeight(entries[0].contentRect.height);
      }
    });
    observer.observe(container);
    setAvailableHeight(container.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, [resizable]);

  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const previousBodyUserSelect = useRef<string | null>(null);

  const handleMove = useCallback(
    (clientY: number) => {
      if (!isResizing.current || !callViewRef.current) return;
      const { top } = callViewRef.current.getBoundingClientRect();
      const newHeight = clientY - top;
      const baseHeight = availableHeight || window.innerHeight;
      const ratio = newHeight / baseHeight;
      const clampedRatio = Math.max(0.2, Math.min(ratio, 0.8));
      setHeightRatio(clampedRatio);
    },
    [availableHeight]
  );

  const handleMouseMove = useCallback((e: MouseEvent) => handleMove(e.clientY), [handleMove]);
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches[0]) handleMove(e.touches[0].clientY);
    },
    [handleMove]
  );

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', stopResizing);
    document.body.style.userSelect = previousBodyUserSelect.current ?? '';
    previousBodyUserSelect.current = null;
  }, [handleMouseMove, handleTouchMove]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    setIsDragging(true);
    if (previousBodyUserSelect.current === null) {
      previousBodyUserSelect.current = document.body.style.userSelect;
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', stopResizing);
    document.body.style.userSelect = 'none';
  }, [handleMouseMove, handleTouchMove, stopResizing]);

  useEffect(
    () => () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResizing);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', stopResizing);
      document.body.style.userSelect = previousBodyUserSelect.current ?? '';
      previousBodyUserSelect.current = null;
    },
    [handleMouseMove, handleTouchMove, stopResizing]
  );

  return (
    <Box
      ref={callViewRef}
      grow="Yes"
      className={ContainerColor({ variant: 'Surface' })}
      style={{
        position: 'relative',
        minWidth: toRem(280),
        height: resizable
          ? availableHeight > 0
            ? `${availableHeight * heightRatio}px`
            : `${heightRatio * 100}dvh`
          : undefined,
        borderBottom: `1px solid var(--sable-surface-container-line)`,
        zIndex: 20,
        backgroundColor: livekitJsRoom ? '#090b10' : currentJoined ? 'transparent' : undefined,
        overflow: livekitJsRoom ? 'hidden' : undefined,
        pointerEvents: currentJoined ? 'none' : 'all',
      }}
    >
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            cursor: 'ns-resize',
            pointerEvents: 'all',
          }}
        />
      )}

      {!currentJoined && !livekitJsCallForRoom && !nativeCallForRoom && <CallPrescreen />}
      {livekitJsCallForRoom && livekitJsRoom ? (
        <LivekitJsCallSurface
          room={livekitJsRoom}
          e2eeReady={livekitJsCallForRoom.e2eeReady}
          initialMedia={livekitJsCallForRoom.initialMedia}
          onHangup={() => void livekitJsCallForRoom.hangup()}
        />
      ) : livekitJsCallForRoom ? (
        <LivekitJsCallStatus
          session={livekitJsCallForRoom}
          onHangup={() => void livekitJsCallForRoom.hangup()}
        />
      ) : nativeCallForRoom ? (
        <NativeCallSurface
          session={nativeCallForRoom}
          onHangup={() => void nativeCallForRoom.hangup()}
        />
      ) : (
        <CallJoined containerRef={callContainerRef} />
      )}

      {resizable && (
        <button
          type="button"
          onMouseDown={startResizing}
          onTouchStart={startResizing}
          aria-label="Resize call view"
          style={{
            position: 'absolute',
            bottom: '-20px',
            left: 0,
            right: 0,
            height: '20px',
            cursor: 'ns-resize',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            outline: 'none',
            pointerEvents: 'all',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '4px',
              marginTop: '2px',
              borderRadius: '2px',
              background: 'var(--sable-surface-container-line)',
              opacity: 0.8,
            }}
          />
        </button>
      )}
    </Box>
  );
}
