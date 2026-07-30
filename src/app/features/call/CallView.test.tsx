import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LivekitJsCallStatus, NativeCallSurface } from './CallView';
import type { NativeCallSession } from '$state/nativeCall';

const nativeSession = (lifecycle: NativeCallSession['lifecycle']): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId: '!room:example.org',
  callId: 'call-id',
  lifecycle,
  microphoneEnabled: true,
  cameraEnabled: false,
  setMicrophoneEnabled: async () => {},
  setCameraEnabled: async () => {},
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

describe('native new-call surface', () => {
  it('shows connection controls when connected', () => {
    render(<NativeCallSurface session={nativeSession('connected')} onHangup={() => {}} />);

    expect(screen.getByText('New call')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
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

    expect(
      screen.getByText(/Native call connection failed\. Dismiss this call to try again\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Dismiss' }).click();
    expect(onHangup).toHaveBeenCalledOnce();
  });
});
