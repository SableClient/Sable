import { type CSSProperties, type Context, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Track, type Room } from 'livekit-client';
import { getDefaultStore } from 'jotai';
import { livekitJsCallInitialMediaAppliedAtom } from '$state/livekitJsCall';
import { LivekitJsCallSurface } from './LivekitJsCallSurface';

const mocks = vi.hoisted(() => ({
  roomContext: undefined as unknown as Context<Room | undefined>,
  useConnectionState: vi.fn<() => string>(),
  useTracks: vi.fn<() => unknown[]>(),
  useParticipants: vi.fn<() => { identity: string }[]>(),
  setMicrophoneEnabled: vi.fn<(enabled: boolean) => Promise<void>>(),
  setCameraEnabled: vi.fn<(enabled: boolean) => Promise<void>>(),
  onDeviceError: undefined as undefined | ((e: { source: string }) => void),
}));

vi.mock('@livekit/components-react', async () => {
  const { createContext } = await import('react');
  mocks.roomContext = createContext<Room | undefined>(undefined);
  return {
    CarouselLayout: ({ children, tracks }: { children: ReactNode; tracks?: unknown[] }) => (
      <div data-testid="carousel-layout" data-track-count={tracks?.length}>
        {children}
      </div>
    ),
    ControlBar: ({
      controls,
      onDeviceError,
    }: {
      controls?: Record<string, boolean>;
      onDeviceError?: (e: { source: string }) => void;
    }) => {
      mocks.onDeviceError = onDeviceError;
      return (
        <div data-testid="control-bar" data-controls={JSON.stringify(controls)}>
          LiveKit controls
        </div>
      );
    },
    MediaDeviceMenu: ({ kind }: { kind?: string }) => (
      <div data-testid="device-menu" data-kind={kind} />
    ),
    FocusLayout: ({
      trackRef,
      children,
    }: {
      trackRef?: { source?: string };
      children?: ReactNode;
    }) => (
      <div data-testid="focus-layout" data-focus-source={trackRef?.source}>
        {children}
      </div>
    ),
    FocusLayoutContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="focus-layout-container">{children}</div>
    ),
    GridLayout: ({ children }: { children: ReactNode }) => (
      <div data-testid="grid-layout">{children}</div>
    ),
    ParticipantTile: ({ children }: { children?: ReactNode }) => (
      <div data-testid="participant-tile">{children}</div>
    ),
    RoomAudioRenderer: ({ muted }: { muted?: boolean }) => (
      <div data-testid="room-audio" data-muted={muted ? 'true' : 'false'} />
    ),
    RoomContext: mocks.roomContext,
    ConnectionQualityIndicator: () => <div data-testid="connection-quality" />,
    TrackMutedIndicator: () => <div data-testid="muted-indicator" />,
    TrackToggle: ({
      source,
      captureOptions,
    }: {
      source?: string;
      captureOptions?: Record<string, unknown>;
    }) => (
      <div
        data-testid="track-toggle"
        data-source={source}
        data-capture-options={JSON.stringify(captureOptions)}
      />
    ),
    VideoTrack: ({ disablePictureInPicture }: { disablePictureInPicture?: boolean }) => (
      <div
        data-testid="video-track"
        data-disable-pip={disablePictureInPicture ? 'true' : 'false'}
      />
    ),
    useConnectionState: mocks.useConnectionState,
    useTracks: mocks.useTracks,
    useParticipants: mocks.useParticipants,
    useEnsureTrackRef: () => mocks.useTracks()[0] ?? { participant: { identity: 'a' } },
    useIsSpeaking: () => false,
    useLocalParticipant: () => ({
      localParticipant: {
        setMicrophoneEnabled: mocks.setMicrophoneEnabled,
        setCameraEnabled: mocks.setCameraEnabled,
      },
    }),
  };
});

vi.mock('$hooks/useRoom', () => ({ useRoom: () => ({ roomId: '!room:example.org' }) }));
vi.mock('$hooks/useCall', () => ({
  useCallSession: () => ({}),
  useCallMembers: () => [
    { rtcBackendIdentity: 'hash-alice', userId: '@alice:example.org' },
    { rtcBackendIdentity: 'hash-bob', userId: '@bob:example.org' },
  ],
}));
vi.mock('./LivekitCallParticipant', () => ({
  useCallParticipantProfile: (identity: string, isLocal: boolean, map: Map<string, string>) => ({
    userId: map.get(identity),
    name: map.get(identity) ?? (isLocal ? '@me:example.org' : 'Unknown participant'),
  }),
  CallParticipantAvatar: ({ profile }: { profile: { name: string } }) => (
    <div data-testid="participant-avatar" data-name={profile.name} />
  ),
  CallParticipantName: ({ profile }: { profile: { name: string } }) => <span>{profile.name}</span>,
}));

vi.mock('folds', () => ({
  Box: ({
    children,
    role,
    className,
    style,
    onPointerDown,
    onPointerMove,
    onFocusCapture,
    onKeyDown,
    'aria-label': ariaLabel,
    'data-livekit-call-surface': callSurface,
    'data-livekit-controls': controls,
  }: {
    children: ReactNode;
    role?: string;
    className?: string;
    style?: CSSProperties;
    onPointerDown?: () => void;
    onPointerMove?: () => void;
    onFocusCapture?: () => void;
    onKeyDown?: () => void;
    'aria-label'?: string;
    'data-livekit-call-surface'?: boolean;
    'data-livekit-controls'?: boolean;
  }) => (
    // Stands in for folds' Box; the component under test supplies the role.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      role={role}
      className={className}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onFocusCapture={onFocusCapture}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      data-livekit-call-surface={callSurface ? '' : undefined}
      data-livekit-controls={controls ? '' : undefined}
    >
      {children}
    </div>
  ),
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  color: {
    Critical: { Container: 'red', OnContainer: 'white' },
    Surface: { OnContainer: 'white' },
    Warning: { Container: 'yellow', OnContainer: 'black' },
  },
  config: {
    radii: { R500: '5px' },
    space: { S100: '4px', S200: '8px', S300: '12px' },
  },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  toRem: (value: number) => `${value}px`,
}));

const room = {} as Room;
const initialMedia = { microphone: true, camera: false, sound: true };

const videoTrack = (source: Track.Source, isLocal: boolean, identity = 'hash-alice') => ({
  source,
  participant: { isLocal, identity },
  publication: {},
});

const placeholderTrack = (source: Track.Source, isLocal: boolean, identity = 'hash-alice') => ({
  source,
  participant: { isLocal, identity },
  publication: undefined,
});

const surfaceElement = () => document.body.querySelector('[data-livekit-call-surface]');
const controlsElement = () => document.body.querySelector('[data-livekit-controls]');

// jsdom has no mediaDevices, which is what a platform without screen capture
// looks like, so the supported case has to opt in.
const stubDisplayMedia = () =>
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia: () => Promise.resolve() },
  });

beforeEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
  getDefaultStore().set(livekitJsCallInitialMediaAppliedAtom, false);
  mocks.useConnectionState.mockReset().mockReturnValue('connected');
  mocks.useTracks.mockReset().mockReturnValue([]);
  mocks.useParticipants.mockReset().mockReturnValue([]);
  mocks.setMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
  mocks.setCameraEnabled.mockReset().mockResolvedValue(undefined);
  mocks.onDeviceError = undefined;
});

describe('LiveKit JS call surface', () => {
  it('publishes with the devices chosen in the prescreen preview', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={{
          microphone: true,
          camera: true,
          sound: true,
          audioDeviceId: 'mic-2',
          videoDeviceId: 'cam-1',
        }}
        onHangup={() => {}}
      />
    );

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true, { deviceId: 'mic-2' });
    expect(mocks.setCameraEnabled).toHaveBeenCalledWith(true, { deviceId: 'cam-1' });
  });

  it('leaves device selection to the browser when the user never picked one', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={{ microphone: true, camera: true, sound: true }}
        onHangup={() => {}}
      />
    );

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true, undefined);
    expect(mocks.setCameraEnabled).toHaveBeenCalledWith(true, undefined);
  });

  it('applies the prescreen media choice once media is ready', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={{ microphone: true, camera: true, sound: true }}
        onHangup={() => {}}
      />
    );

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true, undefined);
    expect(mocks.setCameraEnabled).toHaveBeenCalledWith(true, undefined);
  });

  it('joins muted when the prescreen microphone was off', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={{ microphone: false, camera: false, sound: true }}
        onHangup={() => {}}
      />
    );

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false, undefined);
    expect(mocks.setCameraEnabled).not.toHaveBeenCalled();
  });

  it('keeps the call bar state when the surface remounts, instead of re-muting', () => {
    const media = { microphone: false, camera: false, sound: true };
    const view = render(
      <LivekitJsCallSurface room={room} mediaReady initialMedia={media} onHangup={() => {}} />
    );

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    view.unmount();

    render(
      <LivekitJsCallSurface room={room} mediaReady initialMedia={media} onHangup={() => {}} />
    );

    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing until media is ready', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady={false}
        initialMedia={{ microphone: true, camera: true, sound: true }}
        onHangup={() => {}}
      />
    );

    expect(mocks.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(mocks.setCameraEnabled).not.toHaveBeenCalled();
  });

  it('leaves the audio sink to the app-level renderer so it survives room navigation', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.queryByTestId('room-audio')).not.toBeInTheDocument();
  });

  it('lets LiveKit derive publish controls from the token grants', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByTestId('control-bar')).toHaveAttribute(
      'data-controls',
      '{"leave":false,"screenShare":false}'
    );
    expect(screen.getByTestId('device-menu')).toHaveAttribute('data-kind', 'audiooutput');
  });

  it('hides the screen share toggle where getDisplayMedia is unavailable', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.queryByTestId('track-toggle')).not.toBeInTheDocument();
  });

  it('shares the screen without offering the window showing the call', () => {
    stubDisplayMedia();

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    const toggle = screen.getByTestId('track-toggle');
    expect(toggle).toHaveAttribute('data-source', Track.Source.ScreenShare);
    expect(JSON.parse(toggle.getAttribute('data-capture-options') ?? '{}')).toMatchObject({
      audio: false,
      selfBrowserSurface: 'exclude',
    });
  });

  it('surfaces a denied microphone instead of failing silently', async () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    act(() => mocks.onDeviceError?.({ source: Track.Source.Microphone }));

    expect(
      await screen.findByText('Microphone unavailable. Check your browser permissions.')
    ).toBeInTheDocument();
  });

  it('gives an unencrypted call its controls and devices with no key wait', () => {
    // `mediaReady` is true from the start for an unencrypted room, where
    // MSC4143 forbids MatrixRTC encryption and no Matrix key ever arrives.
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={{ microphone: true, camera: true, sound: true }}
        onHangup={() => {}}
      />
    );

    expect(screen.getByTestId('control-bar')).toBeInTheDocument();
    expect(screen.queryByText('Securing call…')).not.toBeInTheDocument();
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true, undefined);
    expect(mocks.setCameraEnabled).toHaveBeenCalledWith(true, undefined);
  });

  it('withholds media controls until call encryption is ready', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady={false}
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.queryByTestId('control-bar')).not.toBeInTheDocument();
    expect(screen.getByText('Securing call…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('keeps audio-only calls understandable with persistent controls', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText('Audio call')).toBeInTheDocument();
    expect(screen.getByTestId('control-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('shows every participant when no camera is published, not an empty grid', () => {
    mocks.useTracks.mockReturnValue([
      placeholderTrack(Track.Source.Camera, true),
      placeholderTrack(Track.Source.Camera, false),
    ]);
    mocks.useParticipants.mockReturnValue([{ identity: 'hash-alice' }, { identity: 'hash-bob' }]);

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('focus-layout')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('participant-avatar')).toHaveLength(2);
    expect(screen.getByText('@alice:example.org')).toBeInTheDocument();
    expect(screen.getByText('@bob:example.org')).toBeInTheDocument();
  });

  it('labels video tiles with the Matrix display name, never the LiveKit identity hash', () => {
    mocks.useTracks.mockReturnValue([videoTrack(Track.Source.Camera, false)]);

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByTestId('grid-layout')).toBeInTheDocument();
    expect(screen.getByText('@alice:example.org')).toBeInTheDocument();
    expect(screen.queryByText(/hash-/)).not.toBeInTheDocument();
  });

  it('keeps the iOS webview from popping its own picture-in-picture overlay', () => {
    mocks.useTracks.mockReturnValue([videoTrack(Track.Source.Camera, false)]);

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByTestId('video-track')).toHaveAttribute('data-disable-pip', 'true');
  });

  it('fills the call view container rather than the viewport', () => {
    const { container } = render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    const surface = container.querySelector('[data-livekit-call-surface]');
    expect(surface).not.toBeNull();
    expect(surface).toHaveStyle({ position: 'relative', width: '100%', height: '100%' });
    expect(screen.getByRole('region', { name: 'Call' })).toBe(surface);
  });

  it('puts the screen share in focus and keeps other tracks in a carousel', () => {
    mocks.useTracks.mockReturnValue([
      videoTrack(Track.Source.ScreenShare, false),
      videoTrack(Track.Source.Camera, false),
    ]);

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByTestId('focus-layout-container')).toBeInTheDocument();
    expect(screen.getByTestId('focus-layout')).toHaveAttribute(
      'data-focus-source',
      Track.Source.ScreenShare
    );
    expect(screen.getByTestId('carousel-layout')).toHaveAttribute('data-track-count', '1');
    expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();
    expect(screen.queryByText('Audio call')).not.toBeInTheDocument();
  });

  it('labels the focused screen share instead of leaving the default tile on top', () => {
    mocks.useTracks.mockReturnValue([
      videoTrack(Track.Source.ScreenShare, false),
      videoTrack(Track.Source.Camera, false),
    ]);

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    const focus = within(screen.getByTestId('focus-layout'));
    expect(focus.getByText("@alice:example.org's screen")).toBeInTheDocument();
    expect(focus.queryByText(/hash-/)).not.toBeInTheDocument();
  });

  it('keeps an active local screen share on stage instead of suppressing it', () => {
    mocks.useTracks.mockReturnValue([
      videoTrack(Track.Source.ScreenShare, true),
      videoTrack(Track.Source.Camera, false),
      placeholderTrack(Track.Source.Camera, true),
    ]);

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByTestId('focus-layout')).toHaveAttribute(
      'data-focus-source',
      Track.Source.ScreenShare
    );
    expect(screen.getByRole('status')).toHaveTextContent('Sharing your screen');
    expect(screen.getByTestId('carousel-layout')).toHaveAttribute('data-track-count', '2');
  });

  it('shows connection loss feedback without replacing the media canvas', () => {
    mocks.useConnectionState.mockReturnValue('reconnecting');

    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('hides idle controls from view and hit testing, then reveals them on a canvas tap', () => {
    vi.useFakeTimers();
    try {
      render(
        <LivekitJsCallSurface
          room={room}
          mediaReady
          initialMedia={initialMedia}
          onHangup={() => {}}
        />
      );

      const surface = surfaceElement()!;
      const controls = controlsElement()!;
      const pill = screen.getByTestId('control-bar').parentElement!;

      act(() => vi.advanceTimersByTime(3500));
      expect(controls).toHaveStyle({ opacity: '0', visibility: 'hidden' });
      expect(pill).toHaveStyle({ pointerEvents: 'none' });

      act(() => fireEvent.pointerDown(surface));
      expect(controls).toHaveStyle({ opacity: '1', visibility: 'visible' });
      expect(pill).toHaveStyle({ pointerEvents: 'auto' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals hidden controls on a key press, the only route a keyboard user has', () => {
    vi.useFakeTimers();
    try {
      render(
        <LivekitJsCallSurface
          room={room}
          mediaReady
          initialMedia={initialMedia}
          onHangup={() => {}}
        />
      );

      const surface = surfaceElement()!;
      const controls = controlsElement()!;

      act(() => vi.advanceTimersByTime(3500));
      expect(controls).toHaveStyle({ visibility: 'hidden' });

      // focusIn cannot fire from a Tab press: visibility:hidden removes the
      // controls from the tab order and nothing else inside the surface is
      // focusable, so keydown is the reveal a keyboard user can actually reach.
      act(() => fireEvent.keyDown(surface, { key: 'Tab' }));
      expect(controls).toHaveStyle({ visibility: 'visible' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels the shared control surface for assistive technology', () => {
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={() => {}}
      />
    );

    expect(screen.getByRole('group', { name: 'Call controls' })).toBe(controlsElement());
  });

  it('ends the call from the control bar', () => {
    const onHangup = vi.fn<() => void>();
    render(
      <LivekitJsCallSurface
        room={room}
        mediaReady
        initialMedia={initialMedia}
        onHangup={onHangup}
      />
    );

    screen.getByRole('button', { name: 'End call' }).click();
    expect(onHangup).toHaveBeenCalledOnce();
  });
});
