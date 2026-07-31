import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Box, config, Menu, MenuItem, Text, toRem } from 'folds';
import type { NativeCallSession } from '$state/nativeCall';
import {
  ArrowsClockwise,
  MicrophoneSlash,
  PhoneDisconnect,
  SpeakerHigh,
  User,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import {
  clearNativeCallLocalVideoOverlay,
  clearNativeCallRemoteVideoOverlay,
  getNativeCallState,
  listenNativeCallSnapshot,
  setNativeCallLocalVideoOverlay,
  setNativeCallRemoteVideoOverlay,
  type NativeCallAudioRoute,
  type NativeCallRemoteCamera,
  type NativeCallRemoteParticipant,
  type NativeCallSnapshot,
} from './livekitMobileBridge';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useRoom } from '$hooks/useRoom';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { buildRtcIdentityMap, type UserIdByRtcIdentity } from './livekitCallIdentity';
import { CallParticipantAvatar, useCallParticipantProfile } from './LivekitCallParticipant';
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
      participant.connectionQuality === other.connectionQuality &&
      participant.camera?.sid === other.camera?.sid &&
      participant.camera?.muted === other.camera?.muted &&
      participant.camera?.subscribed === other.camera?.subscribed &&
      participant.screenShare?.sid === other.screenShare?.sid &&
      participant.screenShare?.muted === other.screenShare?.muted &&
      participant.screenShare?.subscribed === other.screenShare?.subscribed
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

type OverlayTarget = {
  participantIdentity: string;
  trackId: string;
};

/**
 * True when the slot's center point is covered by another element (drawers,
 * modal sheets, page transitions). Rect geometry alone cannot detect this:
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
  active: boolean,
  target: OverlayTarget | undefined,
  slotNode: HTMLDivElement | null
): void {
  const targetKey = active && target ? `${target.participantIdentity}:${target.trackId}` : null;

  useEffect(() => {
    if (!targetKey || !target || !slotNode) return undefined;

    let lastGeometryKey = '';
    const report = () => {
      const rect = slotNode.getBoundingClientRect();
      // Slot hidden, outside the viewport (display:none page, scrolled away), or
      // occluded by an overlaying page/drawer: hide the native overlay too,
      // otherwise it stays painted at a stale position over unrelated content.
      const offscreen =
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight ||
        nativeSlotOccluded(slotNode, rect);
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
  enabled: boolean,
  cameraEnabled: boolean,
  slotNode: HTMLDivElement | null
): void {
  const active = enabled && cameraEnabled && slotNode;

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
    // scroll/resize event), which is how recovery after a room change works.
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
  userIdByIdentity: UserIdByRtcIdentity;
  videoBound: boolean;
  slotRef?: (node: HTMLDivElement | null) => void;
  fixed?: boolean;
};

function RemoteTile({
  participant,
  userIdByIdentity,
  videoBound,
  slotRef,
  fixed,
}: RemoteTileProps) {
  const profile = useCallParticipantProfile(participant.identity, false, userIdByIdentity);
  return (
    <div
      className={fixed ? `${css.Tile} ${css.TileFixed}` : css.Tile}
      data-video-bound={videoBound || undefined}
    >
      {/* When video is bound, the native view renders exactly over this slot;
          the avatar stays mounted underneath as the pre-video placeholder. */}
      <div className={css.TileSlot} ref={slotRef}>
        <div className={css.InitialsBadge} aria-hidden>
          <CallParticipantAvatar profile={profile} size="100%" />
        </div>
      </div>
      <div className={css.TileLabel}>
        <QualityDot quality={participant.connectionQuality} />
        {participant.camera?.muted && (
          <span aria-label="Camera off" style={{ display: 'inline-flex', flexShrink: 0 }}>
            {sizedIcon(VideoCameraSlash, '200')}
          </span>
        )}
        <span className={css.TileLabelName}>{profile.name}</span>
      </div>
    </div>
  );
}

/**
 * Output picker (speaker, receiver, Bluetooth). The button only appears once the
 * platform actually reports routes, which is how it stays hidden on Android,
 * where the command does not exist.
 */
function AudioRouteControl({ session }: { session: NativeCallSession }) {
  const menu = useMenuAnchor<HTMLButtonElement>();
  const [routes, setRoutes] = useState<NativeCallAudioRoute[]>([]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const next = await session.listAudioRoutes();
      if (!disposed) setRoutes(next);
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [session]);

  if (routes.length === 0) return null;

  return (
    <ResponsiveMenu
      anchor={menu.anchor}
      requestClose={menu.close}
      position="Top"
      align="Center"
      mobile="dialog"
      menu={
        <Menu>
          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
            {routes.map((route) => (
              <MenuItem
                key={route.id}
                size="300"
                radii="300"
                variant="Surface"
                onClick={() => {
                  void session.selectAudioRoute(route.id);
                  menu.close();
                }}
              >
                <Text size="T300">{route.label || route.name}</Text>
              </MenuItem>
            ))}
          </Box>
        </Menu>
      }
    >
      <button
        type="button"
        className={controlButton}
        data-on
        aria-label="Audio output"
        title="Audio output"
        onClick={(evt) => {
          // Routes change when a headset is plugged in, so refresh on open.
          const refresh = async () => setRoutes(await session.listAudioRoutes());
          void refresh();
          menu.openAt(evt.currentTarget);
        }}
      >
        {sizedIcon(SpeakerHigh, '300')}
      </button>
    </ResponsiveMenu>
  );
}

const qualityLabels: Record<string, string> = {
  excellent: 'Excellent connection',
  good: 'Good connection',
  poor: 'Poor connection',
  lost: 'Connection lost',
  unknown: 'Connection quality unknown',
};

/** The dot carries state through colour alone, so it needs its own label. */
function QualityDot({ quality }: { quality: string | undefined }) {
  const value = quality ?? 'unknown';
  return (
    <span
      className={css.QualityDot}
      data-quality={value}
      role="img"
      aria-label={qualityLabels[value] ?? qualityLabels.unknown}
    />
  );
}

function RemoteDominantLabel({
  participant,
  userIdByIdentity,
}: {
  participant: NativeCallRemoteParticipant;
  userIdByIdentity: UserIdByRtcIdentity;
}) {
  const profile = useCallParticipantProfile(participant.identity, false, userIdByIdentity);
  return (
    <>
      <QualityDot quality={participant.connectionQuality} />
      {participant.camera?.muted && (
        <span aria-label="Camera off" style={{ display: 'inline-flex', flexShrink: 0 }}>
          {sizedIcon(VideoCameraSlash, '200')}
        </span>
      )}
      <span className={css.TileLabelName}>{profile.name}</span>
    </>
  );
}

function RemoteDominantPlaceholder({
  participant,
  userIdByIdentity,
}: {
  participant: NativeCallRemoteParticipant;
  userIdByIdentity: UserIdByRtcIdentity;
}) {
  const profile = useCallParticipantProfile(participant.identity, false, userIdByIdentity, 192);
  return <CallParticipantAvatar profile={profile} size="100%" />;
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
  const remoteParticipants = useNativeRemoteParticipants(session.callId, !isError);
  const matrixRoom = useRoom();
  const callSession = useCallSession(matrixRoom);
  const callMembers = useCallMembers(matrixRoom, callSession);
  const userIdByIdentity = useMemo(() => buildRtcIdentityMap(callMembers), [callMembers]);

  const featured = useMemo(() => {
    const live = (track: NativeCallRemoteCamera | undefined): boolean =>
      track !== undefined && track.subscribed && !track.muted;
    // A shared screen is the thing people are actually looking at, so it
    // outranks any camera.
    const sharing = remoteParticipants.find((p) => live(p.screenShare));
    if (sharing?.screenShare) {
      return { participantIdentity: sharing.identity, trackId: sharing.screenShare.sid };
    }
    const onCamera = remoteParticipants.find((p) => live(p.camera));
    if (!onCamera?.camera) return undefined;
    return { participantIdentity: onCamera.identity, trackId: onCamera.camera.sid };
  }, [remoteParticipants]);

  // The room page stays mounted for the whole mobile slide-out transition, so
  // geometry alone leaves the native video painted over the outgoing page until
  // the slot finally clears the viewport. Route selection flips when the
  // transition starts, which is the earliest honest "no longer on screen".
  const selectedRoom = useSelectedRoom();
  const overlayActive = connected && selectedRoom === session.roomId;

  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);
  useNativeVideoOverlay(session.callId, overlayActive, featured, slotNode);

  const [localSlotNode, setLocalSlotNode] = useState<HTMLDivElement | null>(null);
  useNativeLocalVideoOverlay(session.callId, overlayActive, session.cameraEnabled, localSlotNode);

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
            placeholder={
              <RemoteDominantPlaceholder
                participant={duoRemote}
                userIdByIdentity={userIdByIdentity}
              />
            }
            label={
              <RemoteDominantLabel participant={duoRemote} userIdByIdentity={userIdByIdentity} />
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
                userIdByIdentity={userIdByIdentity}
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
          // The native setters reject unless the room is connected, so staying
          // enabled while reconnecting just makes the buttons silently do
          // nothing.
          disabled={!connected}
        />
        {connected && <AudioRouteControl session={session} />}
        {session.cameraEnabled && connected && (
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
