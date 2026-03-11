import { useCallback, useRef, useState } from 'react';
import { Badge, Box, color, Header, Scroll, Text, toRem } from 'folds';
import { EventType } from '$types/matrix-sdk';
import { useCallEmbed, useCallEmbedPlacementSync, useCallJoined } from '$hooks/useCallEmbed';
import { ContainerColor } from '$styles/ContainerColor.css';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoom } from '$hooks/useRoom';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { PrescreenControls } from './PrescreenControls';
import { CallMemberRenderer } from './CallMemberCard';
import * as css from './styles.css';

function JoinMessage({ hasParticipant }: { hasParticipant?: boolean }) {
  if (hasParticipant) return null;

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

interface CallViewProps {
  resizable?: boolean;
}

export function CallView({ resizable }: CallViewProps) {
  const mx = useMatrixClient();
  const room = useRoom();

  const callViewRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(callViewRef);

  const [height, setHeight] = useState(380);
  const isResizing = useRef(false);

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canJoin = permissions.event(EventType.GroupCallMemberPrefix, mx.getSafeUserId());

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const hasParticipant = callMembers.length > 0;

  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const inOtherCall = callEmbed && callEmbed.roomId !== room.roomId;

  const currentJoined = callEmbed?.roomId === room.roomId && callJoined;

  const [isDragging, setIsDragging] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current || !callViewRef.current) return;
    const { top } = callViewRef.current.getBoundingClientRect();
    setHeight(Math.max(150, Math.min(e.clientY - top, window.innerHeight * 0.8)));
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.userSelect = 'auto';
  }, [handleMouseMove]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.userSelect = 'none';
  }, [handleMouseMove, stopResizing]);

  return (
    <Box
      ref={callViewRef}
      grow="Yes"
      className={ContainerColor({ variant: 'Surface' })}
      style={{
        position: 'relative',
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
      {!currentJoined && (
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
              <Header size="300">
                {!inOtherCall &&
                  (canJoin ? (
                    <JoinMessage hasParticipant={hasParticipant} />
                  ) : (
                    <NoPermissionMessage />
                  ))}
                {inOtherCall && <AlreadyInCallMessage />}
              </Header>
            </Box>
          </Box>
        </Scroll>
      )}
      {resizable && (
        <button
          type="button"
          onMouseDown={startResizing}
          aria-label="Resize call view"
          style={{
            position: 'absolute',
            bottom: '-4px',
            left: 0,
            right: 0,
            height: '8px',
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
          }}
        >
          <div
            style={{
              width: '32px',
              height: '4px',
              borderRadius: '2px',
              background: 'var(--sable-surface-container-line)',
              opacity: 0.6,
            }}
          />
        </button>
      )}
    </Box>
  );
}
