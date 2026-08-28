import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LivekitJsCallStatus } from './CallView';
import { NativeCallSurface } from './NativeCallSurface';
import type { NativeCallSession } from '$state/nativeCall';

vi.mock('@sableclient/tauri-plugin-livekit-mobile', () => ({
  setNativeCallRemoteVideoOverlay: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
  clearNativeCallRemoteVideoOverlay: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
  setNativeCallLocalVideoOverlay: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
  clearNativeCallLocalVideoOverlay: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
}));

vi.mock('$hooks/useRoom', () => ({ useRoom: () => ({ roomId: '!room:example.org' }) }));
vi.mock('$hooks/router/useSelectedRoom', () => ({
  useSelectedRoom: () => '!room:example.org',
}));
vi.mock('$hooks/useCall', () => ({ useCallSession: () => ({}), useCallMembers: () => [] }));
vi.mock('./LivekitCallParticipant', () => ({
  useCallParticipantProfile: () => ({ name: 'Bob' }),
  CallParticipantAvatar: () => <div data-testid="participant-avatar" />,
}));

const nativeSession = (lifecycle: NativeCallSession['lifecycle']): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId: '!room:example.org',
  callId: 'call-id',
  lifecycle,
  participants: [],
  microphoneEnabled: true,
  cameraEnabled: false,
  screenShareEnabled: false,
  setMicrophoneEnabled: async () => {},
  setCameraEnabled: async () => {},
  switchCamera: async () => {},
  listAudioRoutes: async () => [],
  selectAudioRoute: async () => {},
  hangup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
});

describe('LiveKit JS call status', () => {
  it('reports progress without exposing backend or transport details', () => {
    render(
      <LivekitJsCallStatus
        session={{ lifecycle: 'provisioning', failure: null }}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText('Preparing call')).toBeInTheDocument();
    expect(screen.queryByText(/livekit|token|url|secret|e2ee/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
  });

  it('explains a setup failure in plain language', () => {
    render(
      <LivekitJsCallStatus
        session={{ lifecycle: 'failed', failure: 'setup-failed' }}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText('Call failed')).toBeInTheDocument();
    expect(screen.getByText('Could not connect to the call.')).toBeInTheDocument();
    expect(screen.queryByText(/token|url|secret|error:/i)).not.toBeInTheDocument();
  });

  it('gives an unsupported-encryption failure a dismiss route', () => {
    const onHangup = vi.fn<() => void>();
    render(
      <LivekitJsCallStatus
        session={{ lifecycle: 'failed', failure: 'e2ee-unsupported' }}
        onHangup={onHangup}
      />
    );

    expect(
      screen.getByText('Encrypted calls are not supported on this device.')
    ).toBeInTheDocument();
    screen.getByRole('button', { name: 'Dismiss' }).click();
    expect(onHangup).toHaveBeenCalledOnce();
  });
});

describe('native call surface', () => {
  it('shows the local tile and call controls when connected', () => {
    render(<NativeCallSurface session={nativeSession('connected')} onHangup={() => {}} />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Audio output' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  it('keeps media toggles disabled while connecting', () => {
    render(<NativeCallSurface session={nativeSession('connecting')} onHangup={() => {}} />);

    expect(screen.getByText('Connecting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'End call' })).toBeEnabled();
  });

  it('renders a remote tile from the participants the session carries', () => {
    render(
      <NativeCallSurface
        session={{
          ...nativeSession('connected'),
          participants: [
            {
              identity: 'bob-identity',
              camera: { id: 'track-1', muted: true, subscribed: true },
              connectionQuality: 'poor',
            },
          ],
        }}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Poor connection' })).toBeInTheDocument();
    expect(screen.getByLabelText('Camera off')).toBeInTheDocument();
  });

  it('gives failed calls an explicit dismiss route', () => {
    const onHangup = vi.fn<() => void>();
    render(
      <NativeCallSurface
        session={{
          ...nativeSession('error'),
          error: 'Native call connection failed.',
        }}
        onHangup={onHangup}
      />
    );

    expect(screen.getByText('Call failed')).toBeInTheDocument();
    expect(screen.getByText('Native call connection failed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Dismiss' }).click();
    expect(onHangup).toHaveBeenCalledOnce();
  });
});
