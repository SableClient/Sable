import { createLivekitJsController, isCallOngoing } from '@sableclient/matrixrtc';
import { Room as LivekitRoom, RoomEvent, type RoomOptions } from 'livekit-client';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { wrapWebKitCamera } from './canvasCamera';
import { isWebKitGtk } from '$utils/platform';
import {
  livekitJsCallAtom,
  livekitJsCallInitialMediaAppliedAtom,
  livekitJsCallSoundAtom,
  type LivekitJsCallMedia,
} from '$state/livekitJsCall';
import { callInProgressAtom } from '$state/nativeCall';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAutoDiscoveryInfo } from '$hooks/useAutoDiscoveryInfo';
import { acquireCallOwner } from '$state/callOwner';
import { getSlidingSyncManager } from '$client/initMatrix';
import { fetch as appFetch } from '$utils/fetch';

export type LivekitJsCallStartOptions = {
  room: Room;
  dm?: boolean;
  video?: boolean;
  microphone?: boolean;
  sound?: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
};

export type LivekitJsCallManager = {
  start: (options: LivekitJsCallStartOptions) => void;
};

const LivekitJsCallManagerContext = createContext<LivekitJsCallManager | undefined>(undefined);

export const useLivekitJsCallManager = (): LivekitJsCallManager | undefined =>
  useContext(LivekitJsCallManagerContext);

type LivekitJsController = ReturnType<typeof createLivekitJsController>;

const webKitGtkRoomOptions = (): Partial<RoomOptions> => {
  if (!isWebKitGtk()) return {};
  return {
    // WebKitGTK's gstwebrtcbin cannot handle LiveKit's v1
    // single-peer-connection path: it crashes on offer-with-join
    // (data channel + recvonly transceivers) and on mid reuse during
    // republish after full restart. The v0 dual-PC path keeps a
    // dedicated publisher and subscriber PC, which works.
    singlePeerConnection: false,
    // WebKit's GStreamer WebRTC crashes on RTCPeerConnection's audio
    // enhancement lookup when the gstreamer plugin tree is not fully
    // registered at startup.
    audioCaptureDefaults: {
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
      voiceIsolation: false,
    },
    // Force a resolution the camera supports in raw YUY2 (640x480@30).
    // At 720p+ the "USB3.0 Capture" HDMI card only outputs image/jpeg,
    // and WebKitGTK's webrtcbin outgoing pipeline doesn't insert
    // jpegdec before the VP8 encoder — producing black video.
    // At 640x480 the camera supports video/x-raw,YUY2 natively.
    videoCaptureDefaults: {
      resolution: { width: 640, height: 480, frameRate: 30 },
    },
    // Force VP8 — gstwebrtcbin's H264 encoder (openh264) produces
    // incompatible output with most SFUs; VP8 from gst-plugins-good
    // is the reliable path (same choice Element Call makes).
    publishDefaults: {
      videoCodec: 'vp8',
      simulcast: false,
    },
  };
};

type LivekitJsCallManagerProviderProps = {
  children?: ReactNode;
};

/**
 * Provider-level owner of the single LiveKit JS call controller. Mounted with
 * CallEmbedProvider so transient consumers (prescreen, room header, auto-join)
 * never own or disconnect the controller themselves. Owns: creation,
 * subscription -> livekitJsCallAtom, and provider-unmount disconnect.
 */
export function LivekitJsCallManagerProvider({ children }: LivekitJsCallManagerProviderProps) {
  const mx = useMatrixClient();
  const discovery = useAutoDiscoveryInfo();
  const store = useStore();
  const roomIdRef = useRef<string | undefined>(undefined);
  const initialMediaRef = useRef<LivekitJsCallMedia>({
    microphone: true,
    camera: false,
    sound: true,
  });
  const controllerRef = useRef<LivekitJsController | undefined>(undefined);
  const generationRef = useRef(0);

  // Create and expose the controller synchronously during render so child
  // passive effects (e.g. AutoJoinManager calling start()) always see the
  // current controller before the provider's own subscription effect runs.
  const controller = useMemo(() => {
    generationRef.current += 1;
    return createLivekitJsController({
      acquireOwner: (kind, roomId) =>
        kind === 'livekit-js' ? acquireCallOwner(kind, roomId) : undefined,
      request: appFetch,
      subscribeToCallRoom: (roomId) => getSlidingSyncManager(mx)?.subscribeToCallRoom(roomId),
      createRoom: (options) => {
        const room = new LivekitRoom({ ...options, ...webKitGtkRoomOptions() });
        if (!isWebKitGtk()) return room;

        const connect = room.connect.bind(room);
        room.connect = (url, token, opts) =>
          connect(url, token, {
            ...opts,
            rtcConfig: { ...opts?.rtcConfig, bundlePolicy: 'max-bundle' },
          });
        // WebKitGTK MJPEG-only cameras produce black outbound video through
        // gstwebrtcbin; re-publish the camera as a raw canvas.captureStream()
        // track instead. Audio is unaffected.
        const lp = room.localParticipant;
        if (typeof document !== 'undefined' && lp && typeof lp.setCameraEnabled === 'function') {
          const override = wrapWebKitCamera(lp);
          lp.setCameraEnabled = override as typeof lp.setCameraEnabled;
          room.on(RoomEvent.Disconnected, override.dispose);
        }
        return room;
      },
    });
  }, [mx]);
  const generation = generationRef.current;
  if (controllerRef.current !== controller) controllerRef.current = controller;

  useEffect(() => {
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe((controllerState) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      if (controllerState.lifecycle === 'idle') {
        store.set(livekitJsCallAtom, undefined);
        return;
      }
      store.set(livekitJsCallAtom, {
        roomId,
        initialMedia: initialMediaRef.current,
        lifecycle: controllerState.lifecycle,
        failure: controllerState.failure,
        room: controllerState.lifecycle === 'active' ? controllerState.room : undefined,
        mediaReady: controllerState.mediaReady,
        hangup: () => controller.disconnect(),
      });
    });
    return () => {
      unsubscribe();
      roomIdRef.current = undefined;
      if (controllerRef.current === controller) controllerRef.current = undefined;
      void controller.disconnect().finally(() => {
        // A stale disconnect completing after a deliberate replacement must
        // not clear the newer controller's session from the atom.
        if (generationRef.current === generation) {
          store.set(livekitJsCallAtom, undefined);
        }
      });
    };
  }, [controller, generation, store]);

  const start = useCallback(
    ({
      room,
      dm,
      video,
      microphone,
      sound,
      audioDeviceId,
      videoDeviceId,
    }: LivekitJsCallStartOptions) => {
      if (store.get(callInProgressAtom)) return;
      const activeController = controllerRef.current;
      if (!activeController) return;
      roomIdRef.current = room.roomId;
      initialMediaRef.current = {
        microphone: microphone ?? true,
        camera: video ?? false,
        sound: sound ?? true,
        audioDeviceId,
        videoDeviceId,
      };
      store.set(livekitJsCallSoundAtom, sound ?? true);
      store.set(livekitJsCallInitialMediaAppliedAtom, false);
      void activeController
        .connect({
          mx,
          room,
          discovery,
          callIntent: video ? 'video' : 'audio',
          dm,
          ongoing: isCallOngoing(mx, room),
        })
        .catch(() => undefined);
    },
    [mx, discovery, store]
  );

  const manager = useMemo<LivekitJsCallManager>(() => ({ start }), [start]);

  return (
    <LivekitJsCallManagerContext.Provider value={manager}>
      {children}
    </LivekitJsCallManagerContext.Provider>
  );
}
