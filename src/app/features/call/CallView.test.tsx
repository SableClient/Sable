import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LivekitJsCallProbe } from './CallView';

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
