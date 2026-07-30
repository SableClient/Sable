import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LivekitJsCallProbe, NativeCallSurface } from './CallView';
import type { NativeCallSession } from '$state/nativeCall';

const nativeSession = (lifecycle: NativeCallSession['lifecycle']): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId: '!room:example.org',
  callId: 'call-id',
  lifecycle,
  microphoneEnabled: true,
  cameraEnabled: false,
  hangup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
});

describe('LiveKit JS connection probe', () => {
  it('renders connection and E2EE readiness without media controls', () => {
    render(
      <LivekitJsCallProbe session={{ lifecycle: 'active', failure: null }} onHangup={() => {}} />
    );

    expect(screen.getByText('LiveKit JS connection probe')).toBeInTheDocument();
    expect(screen.getByText('Connection: Connected')).toBeInTheDocument();
    expect(screen.getByText('E2EE readiness:')).toHaveTextContent('Ready');
    expect(
      screen.getByText('Connection-only experiment · media is not published')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /microphone|camera|screen/i })
    ).not.toBeInTheDocument();
  });

  it('uses safe status and setup failure text', () => {
    render(
      <LivekitJsCallProbe
        session={{ lifecycle: 'failed', failure: 'setup-failed' }}
        onHangup={() => {}}
      />
    );

    expect(screen.getByText('Connection: Connection failed')).toBeInTheDocument();
    expect(screen.getByText('E2EE readiness:')).toHaveTextContent('Unavailable');
    expect(screen.getByText('LiveKit JS connection setup failed.')).toBeInTheDocument();
    expect(screen.queryByText(/token|url|secret|error:/i)).not.toBeInTheDocument();
  });

  it('shows unavailable E2EE status and calls hangup from End', () => {
    const onHangup = vi.fn<() => void>();
    render(
      <LivekitJsCallProbe
        session={{ lifecycle: 'failed', failure: 'e2ee-unsupported' }}
        onHangup={onHangup}
      />
    );

    expect(screen.getByText('E2EE readiness:')).toHaveTextContent('Unavailable on this device');
    screen.getByRole('button', { name: 'End' }).click();
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
    const onHangup = vi.fn();
    render(
      <NativeCallSurface
        session={{ ...nativeSession('error'), error: 'Native call connection failed.' }}
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
