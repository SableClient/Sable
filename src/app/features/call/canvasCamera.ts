import { Track, type LocalParticipant, type TrackPublishOptions } from 'livekit-client';

type CameraEnabledOptions = {
  deviceId?: string;
  resolution?: { width: number; height: number; frameRate?: number };
};

type SetCameraEnabled = (
  enabled: boolean,
  options?: CameraEnabledOptions,
  publishOptions?: TrackPublishOptions
) => Promise<unknown>;

export type WebKitCameraOverride = SetCameraEnabled & { dispose: () => void };

const canvasWidth = 960;
const canvasHeight = 540;
const captureFps = 15;

/**
 * WebKitGTK's GStreamer WebRTC backend sends black video when the camera
 * only exposes image/jpeg (MJPEG): the capture pipeline picks the encoded
 * format and the outgoing VP8 encoder never receives decodable frames
 * (WebKit PR #9883 is still unmerged). Local preview is fine because it
 * uses a different render path.
 *
 * Workaround: capture the camera with getUserMedia, draw it to a 2D canvas
 * and publish `canvas.captureStream()` instead. WebKitGTK 2.52.5 supports
 * canvas captureStream natively; the resulting track is raw BGRA, which
 * the VP8 encoder path handles correctly.
 */
export function wrapWebKitCamera(localParticipant: LocalParticipant): WebKitCameraOverride {
  let canvas: HTMLCanvasElement | undefined;
  let drawLoop: number | undefined;
  let sourceStream: MediaStream | undefined;
  let sourceVideo: HTMLVideoElement | undefined;

  const stopDrawing = () => {
    if (drawLoop !== undefined) {
      cancelAnimationFrame(drawLoop);
      drawLoop = undefined;
    }
    sourceVideo?.remove();
    sourceVideo = undefined;
    sourceStream?.getTracks().forEach((t) => t.stop());
    sourceStream = undefined;
    canvas?.remove();
    canvas = undefined;
  };

  const draw = () => {
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx && sourceVideo) {
      const { videoWidth, videoHeight } = sourceVideo;
      if (videoWidth > 0 && videoHeight > 0) {
        const scale = Math.min(canvas.width / videoWidth, canvas.height / videoHeight);
        const width = videoWidth * scale;
        const height = videoHeight * scale;
        ctx.drawImage(
          sourceVideo,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height
        );
      }
    }
    drawLoop = requestAnimationFrame(draw);
  };

  const setCameraEnabled: SetCameraEnabled = async (enabled, options, publishOptions) => {
    if (!enabled) {
      stopDrawing();
      const pub = localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track) {
        pub.track.stop();
        await localParticipant.unpublishTrack(pub.track, true);
      }
      return undefined;
    }

    const existing = localParticipant.getTrackPublication(Track.Source.Camera);
    if (existing?.track && canvas) {
      await existing.unmute();
      return existing;
    }

    // Create the real camera track (permission prompt happens here).
    let localTracks: Awaited<ReturnType<LocalParticipant['createTracks']>>;
    try {
      localTracks = await localParticipant.createTracks({
        video: options ?? true,
      });
    } catch (e) {
      return Promise.reject(e);
    }
    const rawTrack = localTracks.find((t) => t.kind === 'video');
    if (!rawTrack) {
      return Promise.reject(new Error('No video track produced'));
    }

    canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.setAttribute('data-sable-camera', '1');
    canvas.style.cssText =
      'position:absolute;left:-10000px;top:0;width:960px;height:540px;pointer-events:none;';
    document.body.appendChild(canvas);

    sourceStream = new MediaStream([rawTrack.mediaStreamTrack]);
    sourceVideo = document.createElement('video');
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.srcObject = sourceStream;
    // Do not await play(); some WebKit builds never resolve it. Draw on a
    // timer regardless — drawImage of a not-yet-ready video is a no-op.
    void sourceVideo.play().catch(() => {});
    draw();

    const canvasStream = canvas.captureStream(captureFps);
    const canvasTrack = canvasStream.getVideoTracks()[0];
    if (!canvasTrack) {
      stopDrawing();
      return Promise.reject(new Error('captureStream returned no track'));
    }

    return localParticipant.publishTrack(canvasTrack, {
      ...publishOptions,
      source: Track.Source.Camera,
      videoCodec: 'vp8',
      simulcast: false,
      videoEncoding: { maxBitrate: 900_000, maxFramerate: captureFps },
      name: 'camera-canvas',
    });
  };

  return Object.assign(setCameraEnabled, { dispose: stopDrawing });
}
