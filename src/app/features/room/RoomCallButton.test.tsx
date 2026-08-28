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

  it('starts a voice call from the voice button', async () => {
    render(
      <RoomCallButton
        room={room}
        direct
        kind="voice"
        defaultPreferences={{ microphone: true, video: true, sound: true }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start voice call/i }));

    await waitFor(() => {
      expect(startCallMock).toHaveBeenCalledWith(room, {
        microphone: true,
        video: false,
        sound: true,
      });
    });
  });

  it('starts a video call from the video button', async () => {
    render(
      <RoomCallButton
        room={room}
        direct
        kind="video"
        defaultPreferences={{ microphone: true, video: true, sound: true }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start video call/i }));

    await waitFor(() => {
      expect(startCallMock).toHaveBeenCalledWith(room, {
        microphone: true,
        video: true,
        sound: true,
      });
    });
  });

  it('hides video button when video start is disabled', () => {
    render(
      <RoomCallButton
        room={room}
        direct
        kind="video"
        allowVideoStart={false}
        defaultPreferences={{ microphone: true, video: true, sound: true }}
      />
    );

    expect(screen.queryByRole('button', { name: /start video call/i })).toBeNull();
  });
});
