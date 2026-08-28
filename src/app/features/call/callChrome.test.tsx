import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallMediaControls, CallMediaToggleButton, CallStatusBar } from './callChrome';
import type { CallStatusView } from './callClient';

const noop = () => Promise.resolve();

describe('CallStatusBar', () => {
  it('shows the status label', () => {
    const status: CallStatusView = { phase: 'connecting', statusLabel: 'Connecting' };

    render(<CallStatusBar status={status} onHangup={vi.fn<() => void>()} />);

    expect(screen.getByText('Connecting')).toBeTruthy();
  });

  it('offers "End" while the call is still live', () => {
    const status: CallStatusView = { phase: 'connected', statusLabel: 'Connected' };

    render(<CallStatusBar status={status} onHangup={vi.fn<() => void>()} />);

    expect(screen.getByRole('button').textContent).toBe('End');
  });

  it('offers "Dismiss" on a failure, where there is nothing left to end', () => {
    const status: CallStatusView = {
      phase: 'failed',
      statusLabel: 'Call failed',
      error: 'Could not connect to the call.',
    };

    render(<CallStatusBar status={status} onHangup={vi.fn<() => void>()} />);

    expect(screen.getByRole('button').textContent).toBe('Dismiss');
    expect(screen.getByText('Could not connect to the call.')).toBeTruthy();
  });

  it('hangs up when the button is pressed', async () => {
    const onHangup = vi.fn<() => void>();
    const status: CallStatusView = { phase: 'connected', statusLabel: 'Connected' };

    render(<CallStatusBar status={status} onHangup={onHangup} />);
    await userEvent.click(screen.getByRole('button'));

    expect(onHangup).toHaveBeenCalledOnce();
  });
});

describe('CallMediaToggleButton', () => {
  it('exposes its state to assistive tech', () => {
    render(
      <CallMediaToggleButton on label="Mute microphone" onToggle={vi.fn<() => void>()}>
        icon
      </CallMediaToggleButton>
    );

    const button = screen.getByRole('button', { name: 'Mute microphone' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not fire while disabled', async () => {
    const onToggle = vi.fn<() => void>();
    render(
      <CallMediaToggleButton on={false} disabled label="Unmute microphone" onToggle={onToggle}>
        icon
      </CallMediaToggleButton>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('CallMediaControls', () => {
  const renderControls = (overrides = {}) => {
    const setMicrophoneEnabled = vi.fn<() => Promise<void>>(noop);
    const setCameraEnabled = vi.fn<() => Promise<void>>(noop);
    render(
      <CallMediaControls
        microphoneEnabled
        cameraEnabled={false}
        setMicrophoneEnabled={setMicrophoneEnabled}
        setCameraEnabled={setCameraEnabled}
        {...overrides}
      />
    );
    return { setMicrophoneEnabled, setCameraEnabled };
  };

  it('labels each control by the action it performs, not the current state', () => {
    renderControls();

    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeTruthy();
  });

  it('toggles the microphone to the opposite of its current state', async () => {
    const { setMicrophoneEnabled } = renderControls();

    await userEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('toggles the camera to the opposite of its current state', async () => {
    const { setCameraEnabled } = renderControls();

    await userEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it('rejects media commands before the transport has connected', async () => {
    const { setMicrophoneEnabled, setCameraEnabled } = renderControls({ disabled: true });

    await userEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(setCameraEnabled).not.toHaveBeenCalled();
  });
});
