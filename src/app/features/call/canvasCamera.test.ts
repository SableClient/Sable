import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Track, type LocalParticipant } from 'livekit-client';
import { wrapWebKitCamera } from './canvasCamera';

type DrawImageCall = [unknown, number, number, number, number];

const drawImage = vi.fn<(...args: DrawImageCall) => void>();

const canvasTrack = { kind: 'video', id: 'canvas-track' } as MediaStreamTrack;

let sourceTrackStop: ReturnType<typeof vi.fn>;
let rafCallbacks: FrameRequestCallback[];
let sourceVideo: HTMLVideoElement | null;

const makeParticipant = (overrides: Partial<LocalParticipant> = {}) => {
  const rawTrack = {
    kind: 'video',
    mediaStreamTrack: { kind: 'video', stop: sourceTrackStop } as unknown as MediaStreamTrack,
  };
  return {
    createTracks: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([rawTrack])),
    publishTrack: vi.fn<() => Promise<unknown>>(() => Promise.resolve({ trackSid: 'SID' })),
    unpublishTrack: vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined)),
    getTrackPublication: vi.fn<() => unknown>(() => undefined),
    ...overrides,
  } as unknown as LocalParticipant;
};

beforeEach(() => {
  drawImage.mockClear();
  sourceTrackStop = vi.fn<() => void>();
  rafCallbacks = [];
  sourceVideo = null;

  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?) => {
    const element = createElement(tagName, options);
    if (tagName === 'video') sourceVideo = element as HTMLVideoElement;
    return element;
  });

  vi.stubGlobal(
    'MediaStream',
    class {
      tracks: MediaStreamTrack[];

      constructor(tracks: MediaStreamTrack[] = []) {
        this.tracks = tracks;
      }

      getTracks() {
        return this.tracks;
      }
    }
  );

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn<() => void>());

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  (HTMLCanvasElement.prototype as unknown as { captureStream: () => MediaStream }).captureStream =
    () => ({ getVideoTracks: () => [canvasTrack] }) as unknown as MediaStream;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const liveCanvases = () => document.querySelectorAll('canvas[data-sable-camera]');

describe('wrapWebKitCamera', () => {
  it('publishes the canvas track as the camera source over VP8 without simulcast', async () => {
    const participant = makeParticipant();

    await wrapWebKitCamera(participant)(true);

    expect(participant.publishTrack).toHaveBeenCalledWith(
      canvasTrack,
      expect.objectContaining({
        source: Track.Source.Camera,
        videoCodec: 'vp8',
        simulcast: false,
      })
    );
  });

  it('removes the canvas from the DOM when the camera is turned off', async () => {
    const track = { stop: vi.fn<() => void>() };
    const participant = makeParticipant();
    const setCameraEnabled = wrapWebKitCamera(participant);

    await setCameraEnabled(true);
    expect(liveCanvases()).toHaveLength(1);

    vi.mocked(participant.getTrackPublication).mockReturnValue({
      track,
    } as never);
    await setCameraEnabled(false);

    expect(liveCanvases()).toHaveLength(0);
    expect(track.stop).toHaveBeenCalled();
    expect(participant.unpublishTrack).toHaveBeenCalledWith(track, true);
  });

  it('releases the source camera track when the camera is turned off', async () => {
    const participant = makeParticipant();
    const setCameraEnabled = wrapWebKitCamera(participant);

    await setCameraEnabled(true);
    expect(sourceTrackStop).not.toHaveBeenCalled();

    await setCameraEnabled(false);

    expect(sourceTrackStop).toHaveBeenCalled();
  });

  it('releases the camera on dispose, which is the hangup path', async () => {
    const participant = makeParticipant();
    const setCameraEnabled = wrapWebKitCamera(participant);

    await setCameraEnabled(true);
    setCameraEnabled.dispose();

    expect(sourceTrackStop).toHaveBeenCalled();
    expect(liveCanvases()).toHaveLength(0);
  });

  it('does not unpublish when the publication carries no track', async () => {
    const participant = makeParticipant({
      getTrackPublication: vi.fn<() => unknown>(() => ({ track: undefined })) as never,
    });

    await wrapWebKitCamera(participant)(false);

    expect(participant.unpublishTrack).not.toHaveBeenCalled();
  });

  it('letterboxes a 4:3 source into the 16:9 canvas instead of stretching it', async () => {
    const participant = makeParticipant();

    await wrapWebKitCamera(participant)(true);

    expect(sourceVideo).not.toBeNull();
    Object.defineProperty(sourceVideo, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(sourceVideo, 'videoHeight', { value: 480, configurable: true });

    drawImage.mockClear();
    rafCallbacks.pop()?.(0);

    const [, dx, dy, width, height] = drawImage.mock.calls[0] as DrawImageCall;
    expect({ dx, dy, width, height }).toEqual({ dx: 120, dy: 0, width: 720, height: 540 });
  });

  it('skips drawing until the source reports its dimensions', async () => {
    const participant = makeParticipant();

    await wrapWebKitCamera(participant)(true);

    drawImage.mockClear();
    rafCallbacks.pop()?.(0);

    expect(drawImage).not.toHaveBeenCalled();
  });
});
