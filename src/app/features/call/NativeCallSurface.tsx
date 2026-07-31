import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Text, toRem } from 'folds';
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
 * True when the slot's center point is covered by another element (drawers,
 * modal sheets, page transitions). Rect geometry alone cannot detect this —
 * a drawer sliding over the call view moves nothing. Probing the topmost
 * element at the slot's center is the reliable occlusion signal.
 */
function nativeSlotOccluded(slotNode: HTMLDivElement, rect: DOMRect): boolean {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true;
  const topElement = document.elementFromPoint(cx, cy);
  return topElement === null || (topElement !== slotNode && !slotNode.contains(topElement));
}

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
      // Slot hidden or outside the viewport (display:none page, scrolled away):
      // hide the native overlay too, otherwise it stays painted at a stale
      // position over unrelated content.
      const offscreen =
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight;
      if (offscreen) {
        if (lastGeometryKey !== '') {
          lastGeometryKey = '';
          void clearNativeCallRemoteVideoOverlay({ callId }).catch(() => undefined);
        }
        return;
      }
      const geometryKey = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
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
    // Scroll is the dominant rect-changing event: the message list (or any
    // nested scroll container) moves the slot without resizing it. Capture
    // phase reaches scrolls from nested containers, which don't bubble.
    document.addEventListener('scroll', report, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      document.removeEventListener('scroll', report, { capture: true });
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
      // Never tear down the preview while the page is hidden (e.g. PiP owns
      // the layer during backgrounding).
      if (document.visibilityState !== 'visible') return;
      const rect = slotNode.getBoundingClientRect();
      // Slot hidden, outside the viewport (scrolled away), or occluded by an
      // overlaying page/drawer: hide the native overlay too, otherwise it
      // stays painted at a stale position over unrelated content.
      const hidden =
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight ||
        nativeSlotOccluded(slotNode, rect);
      if (hidden) {
        if (lastGeometryKey !== '') {
          lastGeometryKey = '';
          void clearNativeCallLocalVideoOverlay({ callId }).catch(() => undefined);
        }
        return;
      }
      const geometryKey = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
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
    // Fires during slide transitions (transforms move the slot without any
    // scroll/resize event) — this is how recovery after a room change works.
    const intersectionObserver = new IntersectionObserver(report, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    intersectionObserver.observe(slotNode);
    window.addEventListener('resize', report);
    // Scroll is the dominant rect-changing event: any nested scroll container
    // moves the slot without resizing it. Capture phase reaches scrolls from
    // nested containers, which don't bubble.
    document.addEventListener('scroll', report, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('resize', report);
      document.removeEventListener('scroll', report, { capture: true });
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
  fixed,
}: {
  session: NativeCallSession;
  slotRef?: (node: HTMLDivElement | null) => void;
  fixed?: boolean;
}) {
  return (
    <div
      className={fixed ? `${css.Tile} ${css.TileFixed}` : css.Tile}
      data-video-bound={session.cameraEnabled || undefined}
    >
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
  fixed?: boolean;
};

function RemoteTile({ participant, videoBound, slotRef, fixed }: RemoteTileProps) {
  const label = nativeParticipantLabel(participant.identity);
  return (
    <div
      className={fixed ? `${css.Tile} ${css.TileFixed}` : css.Tile}
      data-video-bound={videoBound || undefined}
    >
      {/* When video is bound, the native view renders exactly over this slot;
          the initials stay mounted underneath as the pre-video placeholder. */}
      <div className={css.TileSlot} ref={slotRef}>
        <div className={css.InitialsBadge} aria-hidden>
          {nativeParticipantInitials(participant.identity)}
        </div>
      </div>
      <div className={css.TileLabel}>
        <span
          className={css.QualityDot}
          data-quality={participant.connectionQuality ?? 'unknown'}
        />
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

/**
 * Edge-to-edge tile for the layouts where one participant owns the whole
 * stage: the local preview when the call is still empty, or the single remote
 * in a two-person call (FaceTime-style).
 */
function DominantTile({
  slotRef,
  videoBound,
  placeholder,
  label,
}: {
  slotRef?: (node: HTMLDivElement | null) => void;
  videoBound?: boolean;
  placeholder: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className={css.DominantTile} data-video-bound={videoBound || undefined}>
      {/* The slot's rect is what JS reports to the native video overlay; the
          placeholder stays mounted underneath as the pre-video fallback. */}
      <div className={css.TileSlot} ref={slotRef}>
        <div className={css.InitialsBadge} aria-hidden>
          {placeholder}
        </div>
      </div>
      <div className={css.TileLabel}>{label}</div>
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

  const remoteCount = remoteParticipants.length;
  // Total tiles once the local self-tile joins the grid. 7+ switches the grid
  // to its compact, scrollable three-column variant.
  const tileCount = remoteCount + 1;
  const compactGrid = tileCount > 6;

  // Two-person layout: the remote owns the stage and is video-bound here
  // whenever its camera is the featured track.
  const duoRemote = remoteCount === 1 ? remoteParticipants[0] : undefined;
  const duoLive =
    duoRemote !== undefined && connected && featured?.participantIdentity === duoRemote.identity;

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
      {duoRemote ? (
        <div className={css.DominantStage}>
          <DominantTile
            videoBound={duoLive}
            slotRef={duoLive ? setSlotNode : undefined}
            placeholder={nativeParticipantInitials(duoRemote.identity)}
            label={
              <>
                <span
                  className={css.QualityDot}
                  data-quality={duoRemote.connectionQuality ?? 'unknown'}
                />
                {duoRemote.camera?.muted && (
                  <span aria-label="Camera off" style={{ display: 'inline-flex', flexShrink: 0 }}>
                    {sizedIcon(VideoCameraSlash, '200')}
                  </span>
                )}
                <span className={css.TileLabelName} title={duoRemote.identity}>
                  {nativeParticipantLabel(duoRemote.identity)}
                </span>
              </>
            }
          />
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
      ) : remoteCount === 0 ? (
        <div className={css.DominantStage}>
          <DominantTile
            videoBound={connected && session.cameraEnabled}
            slotRef={connected && session.cameraEnabled ? setLocalSlotNode : undefined}
            placeholder={sizedIcon(User, '400')}
            label={
              <>
                {!session.microphoneEnabled && (
                  <span
                    aria-label="Microphone off"
                    style={{ display: 'inline-flex', flexShrink: 0 }}
                  >
                    {sizedIcon(MicrophoneSlash, '200')}
                  </span>
                )}
                <span className={css.TileLabelName}>You</span>
              </>
            }
          />
        </div>
      ) : (
        <div className={css.TileGrid} data-cols={compactGrid ? '3' : '2'}>
          {remoteParticipants.map((participant) => {
            const live = connected && featured?.participantIdentity === participant.identity;
            return (
              <RemoteTile
                key={participant.identity}
                participant={participant}
                videoBound={live}
                slotRef={live ? setSlotNode : undefined}
                fixed={compactGrid}
              />
            );
          })}
          <LocalTile
            session={session}
            slotRef={connected && session.cameraEnabled ? setLocalSlotNode : undefined}
            fixed={compactGrid}
          />
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
