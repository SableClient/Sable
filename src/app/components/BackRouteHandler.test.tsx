import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { Provider as JotaiProvider, createStore } from 'jotai';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useBackRoute } from './BackRouteHandler';

vi.mock('$utils/androidBack', () => ({
  useAndroidBackHandler: vi.fn<() => void>(),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="pathname">{location.pathname}</output>;
}

function BackButton() {
  const goBack = useBackRoute();
  return (
    <button type="button" onClick={goBack}>
      go back
    </button>
  );
}

const makeRoom = (roomId: string, canonicalAlias?: string) =>
  ({
    roomId,
    getCanonicalAlias: () => canonicalAlias,
    getLiveTimeline: () => ({ getState: () => undefined }),
  }) as unknown as Room;

const makeClient = (rooms: Room[] = []) =>
  ({
    getRooms: () => rooms,
  }) as unknown as MatrixClient;

function renderBackRoute(options: {
  initialPath: string;
  joinedRoomIds?: string[];
  clientRooms?: Room[];
}) {
  const store = createStore();
  store.set(allRoomsAtom, { type: 'INITIALIZE', rooms: options.joinedRoomIds ?? [] });

  render(
    <JotaiProvider store={store}>
      <MatrixClientProvider value={makeClient(options.clientRooms ?? [])}>
        <MemoryRouter initialEntries={[options.initialPath]}>
          <LocationProbe />
          <BackButton />
        </MemoryRouter>
      </MatrixClientProvider>
    </JotaiProvider>
  );

  return {
    goBack: () => fireEvent.click(screen.getByRole('button', { name: 'go back' })),
    pathname: () => screen.getByTestId('pathname').textContent,
  };
}

describe('useBackRoute', () => {
  it('backs out of a room to its section list', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/home/!room:example.org/',
      joinedRoomIds: ['!room:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/home/');
  });

  it('backs out of a space room to the space lobby when the space is joined', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/!space:example.org/!room:example.org/',
      joinedRoomIds: ['!space:example.org', '!room:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/!space%3Aexample.org');
  });

  it('backs out of a joined space lobby to the space root', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/!space:example.org/lobby/',
      joinedRoomIds: ['!space:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/!space%3Aexample.org');
  });

  it('backs out of a space preview to home instead of looping onto the preview', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/!space:example.org/lobby/',
      joinedRoomIds: ['!other:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/home/');
  });

  it('backs out of a space preview reached by bare address to home', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/!space:example.org/',
      joinedRoomIds: ['!other:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/home/');
  });

  it('backs out of a space preview reached by alias to home', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/%23space%3Aexample.org/lobby/',
      joinedRoomIds: ['!other:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/home/');
  });

  it('treats a space as joined when its canonical alias resolves to a joined room', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/%23space%3Aexample.org/lobby/',
      joinedRoomIds: ['!space:example.org'],
      clientRooms: [makeRoom('!space:example.org', '#space:example.org')],
    });

    goBack();

    expect(pathname()).toBe('/%23space%3Aexample.org');
  });

  it('backs from an unjoined space room preview up to the space preview', () => {
    const { goBack, pathname } = renderBackRoute({
      initialPath: '/!space:example.org/!room:example.org/',
      joinedRoomIds: ['!other:example.org'],
    });

    goBack();

    expect(pathname()).toBe('/!space%3Aexample.org');
  });
});
