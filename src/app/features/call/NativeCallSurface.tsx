import {
  type CallParticipant,
  type CallTrack,
  type UserIdByRtcIdentity,
  buildRtcIdentityMap,
} from '@sableclient/matrixrtc';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Box, config, Menu, MenuItem, Text, toRem } from 'folds';
import type { NativeCallSession } from '$state/nativeCall';
import {
  ArrowsClockwise,
  Check,
  MicrophoneSlash,
  PhoneDisconnect,
  ScreenShare,
  SpeakerHigh,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { type NativeCallAudioRoute } from '@sableclient/tauri-plugin-livekit-mobile';
import {
  clearLocalOverlay,
  clearRemoteOverlay,
  setLocalOverlay,
  setRemoteOverlay,
  useNativeVideoOverlay,
} from './nativeVideoOverlay';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useRoom } from '$hooks/useRoom';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { CallParticipantAvatar, useCallParticipantProfile } from './LivekitCallParticipant';
import { CallControlBar, CallLayout, CallMediaControls, CallStatusBar } from './callChrome';
import { controlButton } from './callChrome.css';
import { nativeCallLifecycleLabels, nativeCallStatus } from './callClient';
import * as css from './NativeCallSurface.css';

export type NativeCallSurfaceProps = {
  session: NativeCallSession;
  onHangup: () => void;
};

function LocalTile({
  session,
  userIdByIdentity,
  slotRef,
  fixed,
}: {
  session: NativeCallSession;
  userIdByIdentity: UserIdByRtcIdentity;
  slotRef?: (node: HTMLDivElement | null) => void;
  fixed?: boolean;
}) {
  const profile = useCallParticipantProfile('', true, userIdByIdentity);

  return (
    <div
      className={fixed ? `${css.Tile} ${css.TileFixed}` : css.Tile}
      data-video-bound={session.cameraEnabled || undefined}
    >
      {/* When the camera is on, the native local preview renders over this
          slot; the avatar stays mounted underneath as the placeholder. */}
      <div className={css.TileSlot} ref={slotRef}>
        <div className={css.InitialsBadge} aria-hidden>
          <CallParticipantAvatar profile={profile} size="100%" />
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

const isLive = (track: CallTrack | undefined): boolean =>
  track !== undefined && track.subscribed && !track.muted;

function MicrophoneOff() {
  return (
    <span aria-label="Microphone off" style={{ display: 'inline-flex', flexShrink: 0 }}>
      {sizedIcon(MicrophoneSlash, '200')}
    </span>
  );
}

type RemoteTileProps = {
  participant: CallParticipant;
  userIdByIdentity: UserIdByRtcIdentity;
  videoBound: boolean;
  sharingScreen?: boolean;
  slotRef?: (node: HTMLDivElement | null) => void;
  fixed?: boolean;
};

function RemoteTile({
  participant,
  userIdByIdentity,
  videoBound,
  sharingScreen,
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
        {participant.microphone?.muted && <MicrophoneOff />}
        {participant.camera?.muted && (
          <span aria-label="Camera off" style={{ display: 'inline-flex', flexShrink: 0 }}>
            {sizedIcon(VideoCameraSlash, '200')}
          </span>
        )}
        <span className={css.TileLabelName}>
          {sharingScreen ? `${profile.name}'s screen` : profile.name}
        </span>
      </div>
    </div>
  );
}

/** Output picker. Stays mounted on an empty list; unmounting on that took the
 * open menu down with it. */
function AudioRouteControl({
  session,
  onMenuOpenChange,
}: {
  session: NativeCallSession;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const menu = useMenuAnchor<HTMLButtonElement>();
  const [routes, setRoutes] = useState<NativeCallAudioRoute[]>([]);
  const open = menu.anchor !== undefined;

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

  // The native video view sits above the webview, so it would paint over this
  // menu. Report the open state so the surface can drop the overlay while it is
  // up, the same way an occluding drawer does.
  useEffect(() => {
    onMenuOpenChange(open);
    return () => onMenuOpenChange(false);
  }, [open, onMenuOpenChange]);

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
            {routes.length === 0 && (
              <Box style={{ padding: config.space.S200 }}>
                <Text size="T300">No other audio outputs</Text>
              </Box>
            )}
            {routes.map((route) => (
              <MenuItem
                key={route.id}
                size="300"
                radii="300"
                variant="Surface"
                aria-checked={route.current}
                before={
                  route.current ? sizedIcon(Check, '200') : <span style={{ width: toRem(16) }} />
                }
                onClick={() => {
                  void session.selectAudioRoute(route.id);
                  menu.close();
                }}
              >
                <Text size="T300">{route.name}</Text>
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
          // The native video layer sits above the webview; drop it before the
          // menu paints, not after the open state commits.
          onMenuOpenChange(true);
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
  sharingScreen,
}: {
  participant: CallParticipant;
  userIdByIdentity: UserIdByRtcIdentity;
  sharingScreen?: boolean;
}) {
  const profile = useCallParticipantProfile(participant.identity, false, userIdByIdentity);
  return (
    <>
      <QualityDot quality={participant.connectionQuality} />
      {participant.microphone?.muted && <MicrophoneOff />}
      {participant.camera?.muted && (
        <span aria-label="Camera off" style={{ display: 'inline-flex', flexShrink: 0 }}>
          {sizedIcon(VideoCameraSlash, '200')}
        </span>
      )}
      <span className={css.TileLabelName}>
        {sharingScreen ? `${profile.name}'s screen` : profile.name}
      </span>
    </>
  );
}

function RemoteDominantPlaceholder({
  participant,
  userIdByIdentity,
}: {
  participant: CallParticipant;
  userIdByIdentity: UserIdByRtcIdentity;
}) {
  const profile = useCallParticipantProfile(participant.identity, false, userIdByIdentity, 192);
  return <CallParticipantAvatar profile={profile} size="100%" />;
}

/** Full-stage tile for a lone participant. */
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
  const capabilities = session.capabilities ?? {
    camera: true,
    screenShare: Boolean(session.setScreenShareEnabled),
    pictureInPicture: true,
    audioRoutes: true,
  };
  const { setScreenShareEnabled } = session;
  const isError = session.lifecycle === 'error';
  const connected = session.lifecycle === 'connected';
  const remoteParticipants = session.participants;
  const matrixRoom = useRoom();
  const callSession = useCallSession(matrixRoom);
  const callMembers = useCallMembers(matrixRoom, callSession);
  const userIdByIdentity = useMemo(() => buildRtcIdentityMap(callMembers), [callMembers]);
  const localProfile = useCallParticipantProfile('', true, userIdByIdentity, 192);

  // A shared screen is the thing people are actually looking at, so it
  // outranks any camera.
  const sharing = useMemo(
    () => remoteParticipants.find((participant) => isLive(participant.screenShare)),
    [remoteParticipants]
  );

  const featured = useMemo(() => {
    if (sharing?.screenShare) {
      return { participantIdentity: sharing.identity, trackId: sharing.screenShare.id };
    }
    const onCamera = remoteParticipants.find((participant) => isLive(participant.camera));
    if (!onCamera?.camera) return undefined;
    return { participantIdentity: onCamera.identity, trackId: onCamera.camera.id };
  }, [remoteParticipants, sharing]);

  // The room page stays mounted for the whole mobile slide-out transition, so
  // geometry alone leaves the native video painted over the outgoing page until
  // the slot finally clears the viewport. Route selection flips when the
  // transition starts, which is the earliest honest "no longer on screen".
  const selectedRoom = useSelectedRoom();
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const overlayActive = connected && selectedRoom === session.roomId && !routeMenuOpen;

  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);
  useNativeVideoOverlay(
    session.callId,
    overlayActive && featured !== undefined,
    slotNode,
    (callId, geometry) =>
      featured ? setRemoteOverlay(featured, callId, geometry) : Promise.resolve(),
    clearRemoteOverlay
  );

  const [localSlotNode, setLocalSlotNode] = useState<HTMLDivElement | null>(null);
  useNativeVideoOverlay(
    session.callId,
    overlayActive && session.cameraEnabled,
    localSlotNode,
    setLocalOverlay,
    clearLocalOverlay
  );

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
              <RemoteDominantLabel
                participant={duoRemote}
                userIdByIdentity={userIdByIdentity}
                sharingScreen={duoLive && sharing?.identity === duoRemote.identity}
              />
            }
          />
          <div className={css.FloatingLocal} data-video-bound={session.cameraEnabled || undefined}>
            <div
              className={css.TileSlot}
              ref={session.cameraEnabled ? setLocalSlotNode : undefined}
            >
              <div className={css.InitialsBadge} aria-hidden style={{ width: '60%' }}>
                <CallParticipantAvatar profile={localProfile} size="100%" />
              </div>
            </div>
          </div>
        </div>
      ) : remoteCount === 0 ? (
        <div className={css.DominantStage}>
          <DominantTile
            videoBound={connected && session.cameraEnabled}
            slotRef={connected && session.cameraEnabled ? setLocalSlotNode : undefined}
            placeholder={<CallParticipantAvatar profile={localProfile} size="100%" />}
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
                sharingScreen={live && sharing?.identity === participant.identity}
                slotRef={live ? setSlotNode : undefined}
                fixed={compactGrid}
              />
            );
          })}
          <LocalTile
            session={session}
            userIdByIdentity={userIdByIdentity}
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
          cameraAvailable={capabilities.camera}
          // The native setters reject unless the room is connected, so staying
          // enabled while reconnecting just makes the buttons silently do
          // nothing.
          disabled={!connected}
        />
        {connected && capabilities.audioRoutes && (
          <AudioRouteControl session={session} onMenuOpenChange={setRouteMenuOpen} />
        )}
        {capabilities.camera && session.cameraEnabled && connected && (
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
        {setScreenShareEnabled && connected && (
          <button
            type="button"
            className={controlButton}
            data-on={session.screenShareEnabled || undefined}
            aria-pressed={session.screenShareEnabled}
            aria-label={session.screenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
            title={session.screenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
            onClick={() => void setScreenShareEnabled(!session.screenShareEnabled)}
          >
            {sizedIcon(ScreenShare, '300', { filled: session.screenShareEnabled })}
          </button>
        )}
        <button type="button" className={css.HangupButton} aria-label="End call" onClick={onHangup}>
          {sizedIcon(PhoneDisconnect, '300')}
        </button>
      </CallControlBar>
    </CallLayout>
  );
}
