import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CallParticipant } from '@sableclient/matrixrtc';
import type { NativeCallSession } from '$state/nativeCall';
import { NativeCallSurface } from './NativeCallSurface';

vi.mock('@sableclient/tauri-plugin-livekit-mobile', () => ({
  setNativeCallRemoteVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  clearNativeCallRemoteVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  setNativeCallLocalVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  clearNativeCallLocalVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('./nativeVideoOverlay', () => ({
  useNativeVideoOverlay: vi.fn<() => void>(),
  setRemoteOverlay: vi.fn<() => Promise<void>>(),
  clearRemoteOverlay: vi.fn<() => Promise<void>>(),
  setLocalOverlay: vi.fn<() => Promise<void>>(),
  clearLocalOverlay: vi.fn<() => Promise<void>>(),
}));

const members: Record<string, string> = { '@bob:example.org': 'Bob', '@me:example.org': 'Me' };

vi.mock('$hooks/useRoom', () => ({
  useRoom: () => ({
    roomId: '!room:example.org',
    getMember: (userId: string) =>
      members[userId] === undefined
        ? null
        : { name: members[userId], getMxcAvatarUrl: () => `mxc://example.org/${members[userId]}` },
  }),
}));

vi.mock('$components/user-avatar', () => ({
  UserAvatar: ({ userId, alt }: { userId: string; alt?: string }) => (
    <span data-testid="avatar" data-user-id={userId}>
      {alt}
    </span>
  ),
}));
vi.mock('$hooks/useCall', () => ({ useCallSession: () => ({}), useCallMembers: () => [] }));
vi.mock('$hooks/router/useSelectedRoom', () => ({ useSelectedRoom: () => '!room:example.org' }));
vi.mock('$hooks/useMediaAuthentication', () => ({ useMediaAuthentication: () => false }));
vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getUserId: () => '@me:example.org',
    mxcUrlToHttp: (mxc: string) => mxc.replace('mxc://', 'https://'),
  }),
}));
vi.mock('@sableclient/matrixrtc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildRtcIdentityMap: () => new Map([['BOB', '@bob:example.org']]),
}));

const session = (overrides: Partial<NativeCallSession> = {}): NativeCallSession =>
  ({
    callId: 'call-1',
    roomId: '!room:example.org',
    lifecycle: 'connected',
    microphoneEnabled: true,
    cameraEnabled: false,
    screenShareEnabled: false,
    participants: [],
    listAudioRoutes: () => Promise.resolve([]),
    selectAudioRoute: () => Promise.resolve(),
    setMicrophoneEnabled: () => Promise.resolve(),
    setCameraEnabled: () => Promise.resolve(),
    switchCamera: () => Promise.resolve(),
    ...overrides,
  }) as NativeCallSession;

const bob = (overrides: Partial<CallParticipant> = {}): CallParticipant => ({
  identity: 'BOB',
  connectionQuality: 'good',
  ...overrides,
});

describe('NativeCallSurface', () => {
  it('shows your own avatar while alone with the camera off', () => {
    render(<NativeCallSurface session={session()} onHangup={() => {}} />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toHaveAttribute('data-user-id', '@me:example.org');
  });

  it('keeps your self-tile mounted in a 1:1 call with the camera off', () => {
    const { container } = render(
      <NativeCallSurface session={session({ participants: [bob()] })} onHangup={() => {}} />
    );

    expect(container.querySelectorAll('[class*="FloatingLocal"]').length).toBe(1);
  });

  it('marks a muted remote participant', () => {
    render(
      <NativeCallSurface
        session={session({
          participants: [bob({ microphone: { id: 'mic-1', muted: true, subscribed: true } })],
        })}
        onHangup={() => {}}
      />
    );

    expect(screen.getByLabelText('Microphone off')).toBeInTheDocument();
  });

  it('does not mark an unmuted remote participant', () => {
    render(
      <NativeCallSurface
        session={session({
          participants: [bob({ microphone: { id: 'mic-1', muted: false, subscribed: true } })],
        })}
        onHangup={() => {}}
      />
    );

    expect(screen.queryByLabelText('Microphone off')).not.toBeInTheDocument();
  });

  it("labels a shared screen as the sharer's screen", () => {
    render(
      <NativeCallSurface
        session={session({
          participants: [bob({ screenShare: { id: 'screen-1', muted: false, subscribed: true } })],
        })}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText(/'s screen$/)).toBeInTheDocument();
  });

  it('keeps the audio output button when the platform reports no routes', () => {
    render(<NativeCallSurface session={session()} onHangup={() => {}} />);

    expect(screen.getByLabelText('Audio output')).toBeInTheDocument();
  });

  it('keeps the audio output button when a refresh comes back empty', async () => {
    const listAudioRoutes = vi
      .fn<() => Promise<never[]>>()
      .mockResolvedValueOnce([
        { id: 'earpiece', name: 'Earpiece', type: 'earpiece', current: true },
      ] as never)
      .mockResolvedValue([]);
    render(<NativeCallSurface session={session({ listAudioRoutes })} onHangup={() => {}} />);

    const button = await screen.findByLabelText('Audio output');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByLabelText('Audio output')).toBeInTheDocument();
  });

  it('hides the screen share button where the platform cannot publish one', () => {
    render(<NativeCallSurface session={session()} onHangup={() => {}} />);

    expect(screen.queryByLabelText('Share screen')).not.toBeInTheDocument();
  });

  it('offers screen sharing once the platform supports it', () => {
    const setScreenShareEnabled = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(<NativeCallSurface session={session({ setScreenShareEnabled })} onHangup={() => {}} />);

    fireEvent.click(screen.getByLabelText('Share screen'));

    expect(setScreenShareEnabled).toHaveBeenCalledWith(true);
  });

  it('offers to stop an active screen share', () => {
    const setScreenShareEnabled = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(
      <NativeCallSurface
        session={session({ setScreenShareEnabled, screenShareEnabled: true })}
        onHangup={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Stop sharing screen'));

    expect(setScreenShareEnabled).toHaveBeenCalledWith(false);
  });

  it('labels a camera with the plain name', () => {
    render(
      <NativeCallSurface
        session={session({
          participants: [bob({ camera: { id: 'cam-1', muted: false, subscribed: true } })],
        })}
        onHangup={() => {}}
      />
    );

    expect(screen.queryByText(/'s screen$/)).not.toBeInTheDocument();
  });
});
