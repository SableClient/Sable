import { useCallback, useRef, useState, type RefObject } from 'react';
import { Badge, Box, color, Header, Scroll, Text, toRem } from 'folds';
import { ContainerColor } from '$styles/ContainerColor.css';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoom } from '$hooks/useRoom';
import { useLivekitSupport } from '$hooks/useLivekitSupport';
import { StateEvent } from '$types/matrix/room';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useCallEmbed, useCallEmbedPlacementSync, useCallJoined } from '$hooks/useCallEmbed';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import * as css from './styles.css';
import { CallMemberRenderer } from './CallMemberCard';
import { PrescreenControls } from './PrescreenControls';
import { CallControls } from './CallControls';

function LivekitServerMissingMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      Your homeserver does not support calling. But you can still join call started by others.
    </Text>
  );
}

function JoinMessage({
  hasParticipant,
  livekitSupported,
}: {
  hasParticipant?: boolean;
  livekitSupported?: boolean;
}) {
  if (hasParticipant) return null;

  if (livekitSupported === false) {
    return <LivekitServerMissingMessage />;
  }

  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      Voice chat&apos;s empty — Be the first to hop in!
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
      Already in another call — End the current call to join!
    </Text>
  );
}

function CallPrescreen() {
  const mx = useMatrixClient();
  const room = useRoom();
  const livekitSupported = useLivekitSupport();

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const hasPermission = permissions.event(StateEvent.GroupCallMemberPrefix, mx.getSafeUserId());

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const hasParticipant = callMembers.length > 0;

  const callEmbed = useCallEmbed();
  const inOtherCall = callEmbed && callEmbed.roomId !== room.roomId;

  const canJoin = hasPermission && (livekitSupported || hasParticipant);

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
            {!inOtherCall &&
              (hasPermission ? (
                <JoinMessage hasParticipant={hasParticipant} livekitSupported={livekitSupported} />
              ) : (
                <NoPermissionMessage />
              ))}
            {inOtherCall && <AlreadyInCallMessage />}
          </Box>
        </Box>
      </Box>
    </Scroll>
  );
}

type CallJoinedProps = {
  containerRef: RefObject<HTMLDivElement>;
  joined: boolean;
};

function CallJoined({ joined, containerRef }: CallJoinedProps) {
  const callEmbed = useCallEmbed();

  return (
    <Box grow="Yes" direction="Column" style={{ position: 'relative' }}>
      <Box grow="Yes" ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {callEmbed && joined && (
        <div
          style={{
            position: 'absolute',
            bottom: toRem(16),
            left: 0,
            right: 0,
            zIndex: 50,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'all', maxWidth: '100%' }}>
            <CallControls callEmbed={callEmbed} />
          </div>
        </div>
      )}
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

  const currentJoined = callEmbed?.roomId === room.roomId && callJoined;

  const [height, setHeight] = useState(isMobile ? 240 : 380);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);

  const handleMove = useCallback(
    (clientY: number) => {
      if (!isResizing.current || !callViewRef.current) return;
      const { top } = callViewRef.current.getBoundingClientRect();
      setHeight(Math.max(isMobile ? 120 : 150, Math.min(clientY - top, window.innerHeight * 0.8)));
    },
    [isMobile]
  );

  const handleMouseMove = useCallback((e: MouseEvent) => handleMove(e.clientY), [handleMove]);
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      handleMove(e.touches[0].clientY);
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
    document.body.style.userSelect = 'auto';
  }, [handleMouseMove, handleTouchMove]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', stopResizing);
    document.body.style.userSelect = 'none';
  }, [handleMouseMove, handleTouchMove, stopResizing]);

  return (
    <Box
      ref={callViewRef}
      grow="Yes"
      className={ContainerColor({ variant: 'Surface' })}
      style={{
        position: 'relative',
        minWidth: toRem(280),
        height: resizable ? `${height}px` : undefined,
        borderBottom: `1px solid var(--sable-surface-container-line)`,
        zIndex: 20,
        backgroundColor: currentJoined ? 'transparent' : undefined,
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

      {!currentJoined && <CallPrescreen />}
      <CallJoined joined={currentJoined} containerRef={callContainerRef} />

      {resizable && (
        <button
          type="button"
          onMouseDown={startResizing}
          onTouchStart={startResizing}
          aria-label="Resize call view"
          style={{
            position: 'absolute',
            bottom: '-12px',
            left: 0,
            right: 0,
            height: '24px',
            cursor: 'ns-resize',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
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
