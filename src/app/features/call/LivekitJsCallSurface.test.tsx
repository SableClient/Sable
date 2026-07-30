import { type Context, type ReactNode, useContext } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'livekit-client';
import { LivekitJsCallSurface } from './LivekitJsCallSurface';

type LocalParticipantMock = {
  identity: string;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  roomContext: undefined as unknown as Context<Room | undefined>,
  useConnectionState: vi.fn<() => string>(),
  useLocalParticipant: vi.fn<
    () => {
      localParticipant: LocalParticipantMock;
      isMicrophoneEnabled: boolean;
      isCameraEnabled: boolean;
      isScreenShareEnabled: boolean;
    }
  >(),
  useParticipants: vi.fn<() => { identity: string }[]>(),
  useTracks: vi.fn<() => unknown[]>(),
}));

vi.mock('@livekit/components-react', async () => {
  const { createContext } = await import('react');
  mocks.roomContext = createContext<Room | undefined>(undefined);
  return {
    ParticipantTile: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    RoomAudioRenderer: () => <div data-testid="room-audio" />,
    RoomContext: mocks.roomContext,
    Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
    useConnectionState: mocks.useConnectionState,
    useLocalParticipant: mocks.useLocalParticipant,
    useParticipants: mocks.useParticipants,
    useTracks: mocks.useTracks,
    VideoTrack: () => <div data-testid="video-track" />,
  };
});

vi.mock('$components/icons/phosphor', () => ({
  Microphone: 'microphone',
  MicrophoneSlash: 'microphone-slash',
  ScreenShare: 'screen-share',
  VideoCamera: 'video-camera',
  VideoCameraSlash: 'video-camera-slash',
  sizedIcon: () => null,
}));

vi.mock('$components/sequence-card', () => ({
  SequenceCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('folds', () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  color: {
    Critical: { Main: 'red' },
    Surface: { Container: 'white', OnContainer: 'black' },
  },
  config: {
    radii: { R300: '3px', R400: '4px' },
    space: { S100: '4px', S200: '8px', S300: '12px', S400: '16px' },
  },
  IconButton: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
  }: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    'aria-label': string;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  toRem: (value: number) => `${value}px`,
}));

const room = {} as Room;

beforeEach(() => {
  mocks.useConnectionState.mockReset().mockReturnValue('connected');
  mocks.useTracks.mockReset().mockReturnValue([]);
  mocks.useParticipants.mockReset().mockReturnValue([{ identity: 'local-user' }]);
  mocks.useLocalParticipant.mockReset().mockImplementation(() => {
    useContext(mocks.roomContext);
    return {
      localParticipant: {
        identity: 'local-user',
        setMicrophoneEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
        setCameraEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
        setScreenShareEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
      },
      isMicrophoneEnabled: true,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
    };
  });
});

describe('LiveKit JS call surface', () => {
  it('renders a graceful audio-only state and persistent controls', () => {
    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Audio call')).toBeInTheDocument();
    expect(screen.getByText('Waiting for someone to join.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start screen sharing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('uses the LiveKit local participant for media controls', async () => {
    const setCameraEnabled = vi.fn<() => Promise<void>>().mockResolvedValue();
    mocks.useLocalParticipant.mockReturnValue({
      localParticipant: {
        identity: 'local-user',
        setMicrophoneEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
        setCameraEnabled,
        setScreenShareEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
      },
      isMicrophoneEnabled: true,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
    });

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    await waitFor(() => expect(setCameraEnabled).toHaveBeenCalledWith(true));
  });

  it('makes a reconnecting connection obvious', () => {
    mocks.useConnectionState.mockReturnValue('reconnecting');

    render(<LivekitJsCallSurface room={room} onHangup={() => {}} />);

    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
    expect(screen.getByText('Trying to restore the call…')).toBeInTheDocument();
  });
});
