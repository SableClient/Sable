import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, config, toRem } from 'folds';
import type { NativeCallSession } from '$state/nativeCall';
import {
  ArrowsClockwise,
  MicrophoneSlash,
  PhoneDisconnect,
  User,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import {
  clearNativeCallLocalVideoOverlay,
  clearNativeCallRemoteVideoOverlay,
  getNativeCallState,
  listenNativeCallSnapshot,
  setNativeCallLocalVideoOverlay,
  setNativeCallRemoteVideoOverlay,
  type NativeCallRemoteParticipant,
  type NativeCallSnapshot,
} from './livekitMobileBridge';
import { CallControlBar, CallLayout, CallMediaControls, CallStatusBar } from './callChrome';
import { controlButton } from './callChrome.css';
import { nativeCallLifecycleLabels, nativeCallStatus } from './callClient';
import * as css from './NativeCallSurface.css';

export type NativeCallSurfaceProps = {
  session: NativeCallSession;
  onHangup: () => void;
};

const sameParticipants = (
  a: NativeCallRemoteParticipant[],
  b: NativeCallRemoteParticipant[]
): boolean =>
  a.length === b.length &&
  a.every((participant, index) => {
    const other = b[index];
    return (
      participant.identity === other?.identity &&
      participant.camera?.sid === other.camera?.sid &&
      participant.camera?.muted === other.camera?.muted &&
      participant.camera?.subscribed === other.camera?.subscribed
    );
  });

/**
 * Tracks the remote participant projection for this call. The controller owns
 * the call lifecycle; this listener is a second, read-only consumer of the
 * same snapshot stream (snapshots reach every listener in the connecting
 * webview), so control-path behavior is untouched.
 */
function useNativeRemoteParticipants(
  callId: string,
  active: boolean
): NativeCallRemoteParticipant[] {
  const [participants, setParticipants] = useState<NativeCallRemoteParticipant[]>([]);
  const participantsRef = useRef<NativeCallRemoteParticipant[]>([]);

  useEffect(() => {
    if (!active || !callId) {
      participantsRef.current = [];
      setParticipants([]);
      return undefined;
    }

    let disposed = false;
    const apply = (snapshot: NativeCallSnapshot) => {
      if (disposed || snapshot.callId !== callId) return;
      const next = snapshot.remoteParticipants ?? [];
      if (sameParticipants(participantsRef.current, next)) return;
      participantsRef.current = next;
      setParticipants(next);
    };

    // Seed from the current state so remounting mid-call shows participants
    // before the next snapshot event arrives.
    getNativeCallState()
      .then(apply)
      .catch(() => undefined);
    const unlistenPromise = listenNativeCallSnapshot(apply);
    // Mark the listen promise as handled immediately; cleanup re-attaches.
    unlistenPromise.catch(() => undefined);

    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [callId, active]);

  return participants;
}

/**
 * MatrixRTC backend identities are usually `<userId>:<deviceId>` (and a
 * userId itself contains a colon). Strip the device part when that shape is
 * recognizable; anything else is shown as-is.
 */
export function nativeParticipantLabel(identity: string): string {
  if (identity.startsWith('@')) {
    const firstColon = identity.indexOf(':');
    const lastColon = identity.lastIndexOf(':');
    if (firstColon !== -1 && lastColon > firstColon) {
      return identity.slice(0, lastColon);
    }
  }
  return identity;
}

export function nativeParticipantInitials(identity: string): string {
  const label = nativeParticipantLabel(identity);
  const initials = Array.from(label)
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return initials || '?';
}

type OverlayTarget = {
  participantIdentity: string;
  trackId: string;
};

/**
 * Reserves the featured tile's DOM slot and reports its viewport-relative
 * rect to the native video overlay. The native side renders a single remote
 * video view exactly over the reported rect, so only one slot is reported at
 * a time; a new target rebinds the view, a repeated rect repositions it.
 */
function useNativeVideoOverlay(
  callId: string,
  connected: boolean,
  target: OverlayTarget | undefined,
  slotNode: HTMLDivElement | null
): void {
  const targetKey = connected && target ? `${target.participantIdentity}:${target.trackId}` : null;

  useEffect(() => {
    if (!targetKey || !target || !slotNode) return undefined;

    let lastGeometryKey = '';
    const report = () => {
      const rect = slotNode.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const geometryKey = `${rect.x},${rect.y},${rect.width},${rect.height}`;
      if (geometryKey === lastGeometryKey) return;
      lastGeometryKey = geometryKey;
      void setNativeCallRemoteVideoOverlay({
        callId,
        participantIdentity: target.participantIdentity,
        trackId: target.trackId,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      }).catch(() => undefined);
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(slotNode);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [targetKey, target, slotNode, callId]);

  // No eligible target (camera muted/unpublished, reconnecting, error): the
  // overlay must not linger over the tile grid.
  useEffect(() => {
    if (targetKey) return;
    void clearNativeCallRemoteVideoOverlay({ callId }).catch(() => undefined);
  }, [targetKey, callId]);

  useEffect(
    () => () => {
      // Unmount safety: a stale callId is a native no-op.
      void clearNativeCallRemoteVideoOverlay({ callId }).catch(() => undefined);
    },
    [callId]
  );
}

/**
 * Mirrors `useNativeVideoOverlay` for the local camera preview. Active only
 * when the session's camera is on and the call is connected; reports the
 * local tile's slot rect to the native side.
 */
function useNativeLocalVideoOverlay(
  callId: string,
  connected: boolean,
  cameraEnabled: boolean,
  slotNode: HTMLDivElement | null
): void {
  const active = connected && cameraEnabled && slotNode;

  useEffect(() => {
    if (!active || !slotNode) return undefined;

    let lastGeometryKey = '';
    const report = () => {
      const rect = slotNode.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const geometryKey = `${rect.x},${rect.y},${rect.width},${rect.height}`;
      if (geometryKey === lastGeometryKey) return;
      lastGeometryKey = geometryKey;
      void setNativeCallLocalVideoOverlay({
        callId,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      }).catch(() => undefined);
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(slotNode);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [callId, slotNode, active]);

  useEffect(() => {
    if (active) return;
    void clearNativeCallLocalVideoOverlay({ callId }).catch(() => undefined);
  }, [callId, active]);

  useEffect(
    () => () => {
      void clearNativeCallLocalVideoOverlay({ callId }).catch(() => undefined);
    },
    [callId]
  );
}

function LocalTile({
  session,
  slotRef,
}: {
  session: NativeCallSession;
  slotRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div className={css.Tile} data-video-bound={session.cameraEnabled || undefined}>
      {/* When the camera is on, the native local preview renders over this
          slot; the user icon stays mounted underneath as the placeholder. */}
      <div className={css.TileSlot} ref={slotRef}>
        <div className={css.InitialsBadge} aria-hidden>
          {sizedIcon(User, '400')}
        </div>
      </div>
      <div className={css.TileLabel}>
        {!session.microphoneEnabled && (
          <span aria-label="Microphone off" style={{ display: 'inline-flex', flexShrink: 0 }}>
            {sizedIcon(MicrophoneSlash, '200')}
          </span>
        )}
        <span className={css.TileLabelName}>You</span>
      </div>
    </div>
  );
}

type RemoteTileProps = {
  participant: NativeCallRemoteParticipant;
  videoBound: boolean;
  slotRef?: (node: HTMLDivElement | null) => void;
};

function RemoteTile({ participant, videoBound, slotRef }: RemoteTileProps) {
  const label = nativeParticipantLabel(participant.identity);
  return (
    <div className={css.Tile} data-video-bound={videoBound || undefined}>
      {/* When video is bound, the native view renders exactly over this slot;
          the initials stay mounted underneath as the pre-video placeholder. */}
      <div className={css.TileSlot} ref={slotRef}>
        <div className={css.InitialsBadge} aria-hidden>
          {nativeParticipantInitials(participant.identity)}
        </div>
      </div>
      <div className={css.TileLabel}>
        {participant.camera?.muted && (
          <span aria-label="Camera off" style={{ display: 'inline-flex', flexShrink: 0 }}>
            {sizedIcon(VideoCameraSlash, '200')}
          </span>
        )}
        <span className={css.TileLabelName} title={participant.identity}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function NativeCallSurface({ session, onHangup }: NativeCallSurfaceProps) {
  const isError = session.lifecycle === 'error';
  const connected = session.lifecycle === 'connected';
  const connecting = session.lifecycle === 'starting' || session.lifecycle === 'connecting';
  const remoteParticipants = useNativeRemoteParticipants(session.callId, !isError);

  const featured = useMemo(() => {
    const participant = remoteParticipants.find(
      (p) => p.camera && p.camera.subscribed && !p.camera.muted
    );
    if (!participant?.camera) return undefined;
    return { participantIdentity: participant.identity, trackId: participant.camera.sid };
  }, [remoteParticipants]);

  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);
  useNativeVideoOverlay(session.callId, connected, featured, slotNode);

  const [localSlotNode, setLocalSlotNode] = useState<HTMLDivElement | null>(null);
  useNativeLocalVideoOverlay(session.callId, connected, session.cameraEnabled, localSlotNode);

  const hasFeatured = connected && featured !== undefined;
  const otherRemotes = hasFeatured
    ? remoteParticipants.filter((p) => p.identity !== featured?.participantIdentity)
    : remoteParticipants;

  if (isError) {
    return (
      <CallLayout stack style={{ color: '#ffffff' }}>
        <CallStatusBar status={nativeCallStatus(session)} onHangup={onHangup} />
      </CallLayout>
    );
  }

  return (
    <CallLayout stack style={{ color: '#ffffff' }}>
      {!connected && (
        <div
          className={css.StatusRow}
          role={session.lifecycle === 'reconnecting' ? 'alert' : 'status'}
        >
          <Text as="span" size="T300" style={{ color: 'rgba(255, 255, 255, 0.72)' }}>
            {nativeCallLifecycleLabels[session.lifecycle]}
          </Text>
        </div>
      )}
      {hasFeatured ? (
        <>
          <div className={css.FeaturedStage}>
            <div className={css.FeaturedTile} data-video-bound>
              <div className={css.TileSlot} ref={setSlotNode}>
                <div className={css.InitialsBadge} aria-hidden>
                  {nativeParticipantInitials(featured!.participantIdentity)}
                </div>
              </div>
              <div className={css.TileLabel}>
                {featured && (
                  <span
                    className={css.QualityDot}
                    data-quality={
                      remoteParticipants.find((p) => p.identity === featured.participantIdentity)
                        ?.connectionQuality ?? 'unknown'
                    }
                  />
                )}
                <span className={css.TileLabelName}>
                  {nativeParticipantLabel(featured!.participantIdentity)}
                </span>
              </div>
            </div>
            {session.cameraEnabled && (
              <div className={css.FloatingLocal} data-video-bound>
                <div className={css.TileSlot} ref={setLocalSlotNode}>
                  <div
                    className={css.InitialsBadge}
                    aria-hidden
                    style={{ width: '40%', fontSize: toRem(14) }}
                  >
                    {sizedIcon(User, '200')}
                  </div>
                </div>
              </div>
            )}
          </div>
          {otherRemotes.length > 0 && (
            <div className={css.Filmstrip}>
              {otherRemotes.map((participant) => (
                <div key={participant.identity} className={css.FilmstripTile}>
                  <div className={css.TileSlot}>
                    <div className={css.InitialsBadge} aria-hidden>
                      {nativeParticipantInitials(participant.identity)}
                    </div>
                  </div>
                  <div className={css.TileLabel} style={{ padding: `${config.space.S100}` }}>
                    <span
                      className={css.QualityDot}
                      data-quality={participant.connectionQuality ?? 'unknown'}
                    />
                    <span className={css.TileLabelName} style={{ fontSize: toRem(11) }}>
                      {nativeParticipantLabel(participant.identity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={css.TilesStage}>
          <LocalTile
            session={session}
            slotRef={connected && session.cameraEnabled ? setLocalSlotNode : undefined}
          />
          {remoteParticipants.map((participant) => (
            <RemoteTile
              key={participant.identity}
              participant={participant}
              videoBound={false}
              slotRef={undefined}
            />
          ))}
          {connected && remoteParticipants.length === 0 && (
            <div className={css.Tile} style={{ gridColumn: '1 / -1' }}>
              <div className={css.TileSlot}>
                <Text as="span" size="T300" className={css.SlotCaption}>
                  No one else is here yet
                </Text>
              </div>
            </div>
          )}
        </div>
      )}
      <CallControlBar layout="flow">
        <CallMediaControls
          microphoneEnabled={session.microphoneEnabled}
          cameraEnabled={session.cameraEnabled}
          setMicrophoneEnabled={session.setMicrophoneEnabled}
          setCameraEnabled={session.setCameraEnabled}
          disabled={connecting}
        />
        {session.cameraEnabled && !connecting && (
          <button
            type="button"
            className={controlButton}
            aria-label="Switch camera"
            title="Switch camera"
            onClick={() => void session.switchCamera()}
          >
            {sizedIcon(ArrowsClockwise, '300')}
          </button>
        )}
        <button type="button" className={css.HangupButton} aria-label="End call" onClick={onHangup}>
          {sizedIcon(PhoneDisconnect, '300')}
        </button>
      </CallControlBar>
    </CallLayout>
  );
}
