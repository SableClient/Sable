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
    CarouselLayout: ({ children }: { children: ReactNode }) => (
      <div data-testid="carousel-layout">{children}</div>
    ),
    ControlBar: () => <div data-testid="control-bar">LiveKit controls</div>,
    FocusLayout: () => <div data-testid="focus-layout" />,
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
    style,
    onPointerDown,
    onPointerMove,
    onFocusCapture,
    'data-livekit-call-surface': callSurface,
    'data-livekit-controls': controls,
  }: {
    children: ReactNode;
    role?: string;
    style?: CSSProperties;
    onPointerDown?: () => void;
    onPointerMove?: () => void;
    onFocusCapture?: () => void;
    'data-livekit-call-surface'?: boolean;
    'data-livekit-controls'?: boolean;
  }) => (
    <div
      role={role}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onFocusCapture={onFocusCapture}
      data-livekit-call-surface={callSurface ? '' : undefined}
      data-livekit-controls={controls ? '' : undefined}
    >
      {children}
    </div>
  ),
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
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

  it('focuses screen sharing and keeps other tracks in a carousel', () => {
    mocks.useTracks.mockReturnValue([
      { source: 'screen_share', publication: {} },
      { source: 'camera', publication: {} },
    ]);

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByTestId('focus-layout-container')).toBeInTheDocument();
    expect(screen.getByTestId('focus-layout')).toBeInTheDocument();
    expect(screen.getByTestId('carousel-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();
  });

  it('shows connection loss feedback without replacing the media canvas', () => {
    mocks.useConnectionState.mockReturnValue('reconnecting');

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');
    expect(screen.getByTestId('room-audio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('removes hidden controls from hit testing and reveals them on a canvas tap', () => {
    vi.useFakeTimers();
    try {
      render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

      const surface = screen.getByTestId('room-audio').parentElement!;
      const controls = screen.getByTestId('control-bar').parentElement!;

      act(() => vi.advanceTimersByTime(3500));
      expect(controls).toHaveStyle({ pointerEvents: 'none' });

      act(() => fireEvent.pointerDown(surface));
      expect(controls).toHaveStyle({ pointerEvents: 'all' });
    } finally {
      vi.useRealTimers();
    }
  });
});
