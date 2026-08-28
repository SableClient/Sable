import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Room } from '$types/matrix-sdk';
import { CallStatusShell, HangupChip } from './CallStatusShell';

const callMembers = vi.fn<() => string[]>(() => []);

vi.mock('$hooks/useCall', () => ({
  useCallSession: () => undefined,
  useCallMembers: () => callMembers(),
}));

vi.mock('./LiveChip', () => ({
  LiveChip: ({ count }: { count: number }) => <div data-testid="live-chip">{count}</div>,
}));
vi.mock('./CallRoomName', () => ({
  CallRoomName: ({ room }: { room: Room }) => <div data-testid="room-name">{room.name}</div>,
}));
vi.mock('./MemberGlance', () => ({
  MemberGlance: () => <div data-testid="member-glance" />,
}));

const room = { roomId: '!room:test', name: 'Standup' } as Room;

describe('HangupChip', () => {
  it('hangs up when pressed', async () => {
    const onHangup = vi.fn<() => Promise<void>>(() => Promise.resolve());

    render(<HangupChip compact={false} onHangup={onHangup} />);
    await userEvent.click(screen.getByRole('button'));

    expect(onHangup).toHaveBeenCalledOnce();
  });

  it('disables itself while the hangup is in flight, so it cannot be double-fired', async () => {
    let settle = () => {};
    const onHangup = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        })
    );

    render(<HangupChip compact={false} onHangup={onHangup} />);
    const button = screen.getByRole('button');
    await userEvent.click(button);

    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));

    await userEvent.click(button);
    expect(onHangup).toHaveBeenCalledOnce();

    settle();
  });

  it('drops the "End" label when compact, leaving the icon', () => {
    const { rerender } = render(
      <HangupChip compact={false} onHangup={vi.fn<() => Promise<void>>()} />
    );
    expect(screen.getByText('End')).toBeTruthy();

    rerender(<HangupChip compact onHangup={vi.fn<() => Promise<void>>()} />);
    expect(screen.queryByText('End')).toBeNull();
  });
});

describe('CallStatusShell', () => {
  const renderShell = (props: Partial<Parameters<typeof CallStatusShell>[0]> = {}) =>
    render(
      <CallStatusShell
        room={room}
        compact={false}
        connected
        controls={<button type="button">controls</button>}
        {...props}
      />
    );

  it('renders the engine-specific controls it is handed', () => {
    renderShell();

    expect(screen.getByRole('button', { name: 'controls' })).toBeTruthy();
  });

  it('spins instead of showing a roster until the call is connected', () => {
    callMembers.mockReturnValue(['@alice:test']);
    renderShell({ connected: false });

    expect(screen.queryByTestId('live-chip')).toBeNull();
    expect(screen.queryByTestId('member-glance')).toBeNull();
  });

  it('spins while connected but the roster is still empty', () => {
    callMembers.mockReturnValue([]);
    renderShell();

    expect(screen.queryByTestId('live-chip')).toBeNull();
  });

  it('shows the roster once connected with members', () => {
    callMembers.mockReturnValue(['@alice:test', '@bob:test']);
    renderShell();

    expect(screen.getByTestId('live-chip').textContent).toBe('2');
    expect(screen.getByTestId('member-glance')).toBeTruthy();
  });

  it('renders the room name in both layouts', () => {
    callMembers.mockReturnValue(['@alice:test']);

    const { rerender } = renderShell();
    expect(screen.getByTestId('room-name').textContent).toBe('Standup');

    rerender(<CallStatusShell room={room} compact connected controls={<span />} />);
    expect(screen.getByTestId('room-name').textContent).toBe('Standup');
  });
});
