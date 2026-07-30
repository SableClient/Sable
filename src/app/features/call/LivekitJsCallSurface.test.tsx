import { type CSSProperties, type Context, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'livekit-client';
import { LivekitJsCallSurface } from './LivekitJsCallSurface';

const mocks = vi.hoisted(() => ({
  roomContext: undefined as unknown as Context<Room | undefined>,
  useConnectionState: vi.fn<() => string>(),
  useTracks: vi.fn<() => unknown[]>(),
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
    ControlBar: () => <div data-testid="control-bar">LiveKit controls</div>,
    FocusLayout: ({ trackRef }: { trackRef?: { source?: string } }) => (
      <div data-testid="focus-layout" data-focus-source={trackRef?.source} />
    ),
    FocusLayoutContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="focus-layout-container">{children}</div>
    ),
    GridLayout: ({ children }: { children: ReactNode }) => (
      <div data-testid="grid-layout">{children}</div>
    ),
    ParticipantTile: () => <div data-testid="participant-tile" />,
    RoomAudioRenderer: () => <div data-testid="room-audio" />,
    RoomContext: mocks.roomContext,
    useConnectionState: mocks.useConnectionState,
    useTracks: mocks.useTracks,
  };
});

vi.mock('folds', () => ({
  Box: ({
    children,
    role,
    className,
    style,
    onPointerDown,
    onPointerMove,
    onFocusCapture,
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
    'aria-label'?: string;
    'data-livekit-call-surface'?: boolean;
    'data-livekit-controls'?: boolean;
  }) => (
    <div
      role={role}
      className={className}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onFocusCapture={onFocusCapture}
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

const videoTrack = (source: string, isLocal: boolean) => ({
  source,
  participant: { isLocal },
  publication: {},
});

const placeholderTrack = (source: string, isLocal: boolean) => ({
  source,
  participant: { isLocal },
  publication: undefined,
});

const surfaceElement = () => document.body.querySelector('[data-livekit-call-surface]');
const controlsElement = () => document.body.querySelector('[data-livekit-controls]');

beforeEach(() => {
  mocks.useConnectionState.mockReset().mockReturnValue('connected');
  mocks.useTracks.mockReset().mockReturnValue([]);
});

describe('LiveKit JS call surface', () => {
  it('keeps audio-only calls understandable with persistent controls', () => {
    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByTestId('room-audio')).toBeInTheDocument();
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument();
    expect(screen.getByText('Audio call')).toBeInTheDocument();
    expect(screen.getByTestId('control-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('reports audio-only when every tracked camera is a placeholder', () => {
    mocks.useTracks.mockReturnValue([
      placeholderTrack('camera', true),
      placeholderTrack('camera', false),
    ]);

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByTestId('grid-layout')).toBeInTheDocument();
    expect(screen.getByText('Audio call')).toBeInTheDocument();
    expect(screen.queryByTestId('focus-layout')).not.toBeInTheDocument();
  });

  it('takes over the whole viewport in a portal instead of staying in the channel pane', () => {
    const { container } = render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(container.querySelector('[data-livekit-call-surface]')).toBeNull();
    const surface = surfaceElement();
    expect(surface).not.toBeNull();
    expect(surface).toHaveStyle({ position: 'fixed' });
    expect(screen.getByRole('region', { name: 'Call' })).toBe(surface);
  });

  it('puts the screen share in focus and keeps other tracks in a carousel', () => {
    mocks.useTracks.mockReturnValue([
      videoTrack('screen_share', false),
      videoTrack('camera', false),
    ]);

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByTestId('focus-layout-container')).toBeInTheDocument();
    expect(screen.getByTestId('focus-layout')).toHaveAttribute('data-focus-source', 'screen_share');
    expect(screen.getByTestId('carousel-layout')).toHaveAttribute('data-track-count', '1');
    expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();
    expect(screen.queryByText('Audio call')).not.toBeInTheDocument();
  });

  it('keeps an active local screen share on stage instead of suppressing it', () => {
    mocks.useTracks.mockReturnValue([
      videoTrack('screen_share', true),
      videoTrack('camera', false),
      placeholderTrack('camera', true),
    ]);

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByTestId('focus-layout')).toHaveAttribute('data-focus-source', 'screen_share');
    expect(screen.getByRole('status')).toHaveTextContent('Sharing your screen');
    expect(screen.getByTestId('carousel-layout')).toHaveAttribute('data-track-count', '2');
  });

  it('shows connection loss feedback without replacing the media canvas', () => {
    mocks.useConnectionState.mockReturnValue('reconnecting');

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');
    expect(screen.getByTestId('room-audio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('hides idle controls from view and hit testing, then reveals them on a canvas tap', () => {
    vi.useFakeTimers();
    try {
      render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

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

  it('reveals hidden controls for keyboard users when focus enters the call surface', () => {
    vi.useFakeTimers();
    try {
      render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

      const surface = surfaceElement()!;
      const controls = controlsElement()!;

      act(() => vi.advanceTimersByTime(3500));
      expect(controls).toHaveStyle({ visibility: 'hidden' });

      act(() => fireEvent.focusIn(surface));
      expect(controls).toHaveStyle({ visibility: 'visible' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels the shared control surface for assistive technology', () => {
    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByRole('group', { name: 'Call controls' })).toBe(controlsElement());
  });

  it('ends the call from the control bar', () => {
    const onHangup = vi.fn<() => void>();
    render(<LivekitJsCallSurface room={room} onHangup={onHangup} />);

    screen.getByRole('button', { name: 'End call' }).click();
    expect(onHangup).toHaveBeenCalledOnce();
  });
});
