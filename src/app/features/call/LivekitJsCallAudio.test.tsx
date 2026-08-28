import { type Context } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Room } from 'livekit-client';
import { createStore, Provider } from 'jotai';
import {
  livekitJsCallAtom,
  livekitJsCallSoundAtom,
  type LivekitJsCallSession,
} from '$state/livekitJsCall';
import { LivekitJsCallAudio } from './LivekitJsCallAudio';

const mocks = vi.hoisted(() => ({
  roomContext: undefined as unknown as Context<Room | undefined>,
}));

vi.mock('@livekit/components-react', async () => {
  const { createContext, useContext } = await import('react');
  mocks.roomContext = createContext<Room | undefined>(undefined);
  return {
    RoomContext: mocks.roomContext,
    RoomAudioRenderer: ({ muted }: { muted?: boolean }) => {
      const room = useContext(mocks.roomContext) as { name?: string } | undefined;
      return (
        <div
          data-testid="room-audio"
          data-muted={muted ? 'true' : 'false'}
          data-room={room?.name}
        />
      );
    },
  };
});

const session = (room?: Room): LivekitJsCallSession => ({
  roomId: '!room:example.org',
  initialMedia: { microphone: true, camera: false, sound: true },
  lifecycle: 'active',
  failure: null,
  room,
  mediaReady: true,
  hangup: () => Promise.resolve(),
});

const renderWith = (call: LivekitJsCallSession | undefined, sound = true) => {
  const store = createStore();
  store.set(livekitJsCallAtom, call);
  store.set(livekitJsCallSoundAtom, sound);
  return render(
    <Provider store={store}>
      <LivekitJsCallAudio />
    </Provider>
  );
};

describe('LivekitJsCallAudio', () => {
  it('renders the sink for the ongoing call regardless of the selected room', () => {
    renderWith(session({ name: 'lk-room' } as unknown as Room));

    expect(screen.getByTestId('room-audio')).toHaveAttribute('data-room', 'lk-room');
  });

  it('mutes incoming audio while the shared sound toggle is off', () => {
    renderWith(session({ name: 'lk-room' } as unknown as Room), false);

    expect(screen.getByTestId('room-audio')).toHaveAttribute('data-muted', 'true');
  });

  it('renders nothing without a call', () => {
    renderWith(undefined);

    expect(screen.queryByTestId('room-audio')).not.toBeInTheDocument();
  });

  it('renders nothing before the LiveKit room exists', () => {
    renderWith(session(undefined));

    expect(screen.queryByTestId('room-audio')).not.toBeInTheDocument();
  });
});
