import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as JotaiModule from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { RoomCallButton } from './RoomCallButton';

const { startCallMock, useCallJoinedMock } = vi.hoisted(() => ({
  startCallMock: vi.fn<(...args: unknown[]) => void>(),
  useCallJoinedMock: vi.fn<() => boolean>(),
}));

vi.mock('$hooks/useCallEmbed', () => ({
  useCallStart: () => startCallMock,
  useCallJoined: () => useCallJoinedMock(),
}));

vi.mock('jotai', async (importOriginal: () => Promise<typeof JotaiModule>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAtomValue: () => undefined,
  };
});

describe('RoomCallButton', () => {
  const room = { roomId: '!room:example.org' } as Room;

  beforeEach(() => {
    startCallMock.mockReset();
    useCallJoinedMock.mockReset().mockReturnValue(false);
  });

  it('opens a voice/video start menu', async () => {
    render(
      <RoomCallButton
        room={room}
        direct
        defaultPreferences={{ microphone: true, video: true, sound: true }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start call/i }));

    await waitFor(() => {
      expect(screen.getByText('Voice Call')).toBeInTheDocument();
    });
    expect(screen.getByText('Video Call')).toBeInTheDocument();
  });

  it('hides video start when video start is disabled', async () => {
    render(
      <RoomCallButton
        room={room}
        direct={false}
        allowVideoStart={false}
        defaultPreferences={{ microphone: true, video: true, sound: true }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start call/i }));

    await waitFor(() => {
      expect(screen.getByText('Voice Call')).toBeInTheDocument();
    });
    expect(screen.queryByText('Video Call')).toBeNull();
  });

  it('starts the default mode on context-click', () => {
    render(
      <RoomCallButton
        room={room}
        direct
        defaultPreferences={{ microphone: true, video: false, sound: true }}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: /start call/i }));

    expect(startCallMock).toHaveBeenCalledWith(room, {
      microphone: true,
      video: false,
      sound: true,
    });
  });
});
