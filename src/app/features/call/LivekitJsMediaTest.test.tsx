import { type Context, type ReactNode, useContext } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'livekit-client';
import type { LivekitJsCallSession } from '$state/livekitJsCall';
import { canRenderLivekitJsMediaTest, LivekitJsMediaTestSurface } from './LivekitJsMediaTest';

const mocks = vi.hoisted(() => ({
  mockRoomContext: undefined as unknown as Context<Room | undefined>,
  mockUseTracks: vi.fn<() => readonly unknown[]>(() => []),
  mockObservedRoom: vi.fn<(room: Room) => void>(),
  mockUseLocalParticipant: vi.fn<
    () => {
      localParticipant: { identity: string };
      isMicrophoneEnabled: boolean;
      isCameraEnabled: boolean;
      isScreenShareEnabled: boolean;
    }
  >(),
}));

vi.mock('@livekit/components-react', async () => {
  const { createContext } = await import('react');
  mocks.mockRoomContext = createContext<Room | undefined>(undefined);
  return {
    ParticipantTile: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    RoomAudioRenderer: () => <div data-testid="room-audio-renderer" />,
    RoomContext: mocks.mockRoomContext,
    Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
    useLocalParticipant: mocks.mockUseLocalParticipant,
    useTracks: mocks.mockUseTracks,
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

vi.mock('folds', () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  color: { Critical: { Main: 'red' } },
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
}));

const room = {
  connect: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
} as unknown as Room;

const makeSession = (overrides: Partial<LivekitJsCallSession> = {}): LivekitJsCallSession => ({
  roomId: '!room:example.org',
  lifecycle: 'active',
  failure: null,
  room,
  media: {
    setMicrophoneEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
    setCameraEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
    setScreenShareEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(),
  },
  hangup: vi.fn<() => Promise<void>>().mockResolvedValue(),
  ...overrides,
});

beforeEach(() => {
  mocks.mockUseTracks.mockReset();
  mocks.mockUseTracks.mockReturnValue([]);
  mocks.mockObservedRoom.mockReset();
  mocks.mockUseLocalParticipant.mockReset();
  mocks.mockUseLocalParticipant.mockImplementation(() => {
    const activeRoom = useContext(mocks.mockRoomContext);
    if (activeRoom) mocks.mockObservedRoom(activeRoom);
    return {
      localParticipant: { identity: 'local-user' },
      isMicrophoneEnabled: false,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
    };
  });
});

describe('LiveKit JS manual media test', () => {
  it('renders only for an enabled active session with the controller bridge', () => {
    const session = makeSession();
    expect(canRenderLivekitJsMediaTest(true, session)).toBe(true);
    expect(canRenderLivekitJsMediaTest(false, session)).toBe(false);
    expect(canRenderLivekitJsMediaTest(true, { ...session, lifecycle: 'joining-matrix' })).toBe(
      false
    );
    expect(canRenderLivekitJsMediaTest(true, { ...session, media: undefined })).toBe(false);
  });

  it('provides the controller-owned Room and does not connect or capture on render', () => {
    const session = makeSession();
    render(
      <LivekitJsMediaTestSurface room={session.room!} media={session.media!} onHangup={() => {}} />
    );

    expect(mocks.mockObservedRoom).toHaveBeenCalledWith(room);
    expect(room.connect).not.toHaveBeenCalled();
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(session.media!.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(session.media!.setCameraEnabled).not.toHaveBeenCalled();
    expect(session.media!.setScreenShareEnabled).not.toHaveBeenCalled();
    expect(screen.getByText(/manual local media test only/i)).toBeInTheDocument();
    expect(screen.getByTestId('room-audio-renderer')).toBeInTheDocument();
  });

  it('calls the narrow facade directly from manual controls', async () => {
    const session = makeSession();
    render(
      <LivekitJsMediaTestSurface room={session.room!} media={session.media!} onHangup={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Turn on microphone' }));
    await waitFor(() => expect(session.media!.setMicrophoneEnabled).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    await waitFor(() => expect(session.media!.setCameraEnabled).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: 'Start screen sharing' }));

    await waitFor(() => expect(session.media!.setScreenShareEnabled).toHaveBeenCalledWith(true));
  });

  it('shows safe controller failure text without exposing raw errors', async () => {
    const session = makeSession();
    session.media!.setCameraEnabled = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue({ code: 'e2ee-key-not-ready', secret: 'do-not-show' });
    render(
      <LivekitJsMediaTestSurface room={session.room!} media={session.media!} onHangup={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByText('Waiting for encrypted media keys.')).toBeInTheDocument();
    expect(screen.queryByText(/do-not-show|secret/i)).not.toBeInTheDocument();
  });

  it('maps the platform lifecycle failure to a safe bounded message', async () => {
    const session = makeSession();
    session.media!.setMicrophoneEnabled = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue({ code: 'platform-lifecycle-failed', message: 'raw native detail' });
    render(
      <LivekitJsMediaTestSurface room={session.room!} media={session.media!} onHangup={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Turn on microphone' }));

    expect(
      await screen.findByText('Mobile call media is unavailable on this device.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/raw native detail/i)).not.toBeInTheDocument();
  });

  it('keeps End as the only teardown action', () => {
    const onHangup = vi.fn<() => void>();
    const session = makeSession();
    render(
      <LivekitJsMediaTestSurface room={session.room!} media={session.media!} onHangup={onHangup} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'End' }));

    expect(onHangup).toHaveBeenCalledOnce();
    expect(room.disconnect).not.toHaveBeenCalled();
  });
});
