import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Room as MatrixRoom } from '$types/matrix-sdk';
import { getHomeForumPath, getSpaceForumPath } from '$pages/pathUtils';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { PersistentRoomHost } from './PersistentRoomHost';

const { FORUM_ROOM_ID, ROOM_ID, SPACE_ID, makeRoom } = vi.hoisted(() => {
  const forumRoomId = '!forum-room:example.com';
  const roomId = '!room:example.com';
  return {
    FORUM_ROOM_ID: forumRoomId,
    ROOM_ID: roomId,
    SPACE_ID: '!space:example.com',
    makeRoom: (idOrAlias: string | undefined, forumType: string) => ({
      roomId: idOrAlias ?? roomId,
      getType: () => (idOrAlias === forumRoomId ? forumType : undefined),
    }),
  };
});

vi.mock('$features/room', () => ({
  Room: () => <div data-testid="room-timeline" />,
}));

vi.mock('$features/forum', () => ({
  ForumView: () => <div data-testid="forum-view" />,
}));

type MockProviderProps = {
  roomIdOrAlias?: string;
  eventId?: string;
  children: ReactNode;
};

vi.mock('$pages/client/home', async () => {
  const { RoomProvider } = await import('$hooks/useRoom');
  const { CustomRoomType } = await import('$types/matrix/room');
  return {
    HomeRouteRoomProvider: ({ roomIdOrAlias, children }: MockProviderProps) => (
      <RoomProvider value={makeRoom(roomIdOrAlias, CustomRoomType.Forum) as unknown as MatrixRoom}>
        {children}
      </RoomProvider>
    ),
  };
});

vi.mock('$pages/client/direct', async () => {
  const { RoomProvider } = await import('$hooks/useRoom');
  const { CustomRoomType } = await import('$types/matrix/room');
  return {
    DirectRouteRoomProvider: ({ roomIdOrAlias, children }: MockProviderProps) => (
      <RoomProvider value={makeRoom(roomIdOrAlias, CustomRoomType.Forum) as unknown as MatrixRoom}>
        {children}
      </RoomProvider>
    ),
  };
});

vi.mock('$pages/client/space', async () => {
  const { RoomProvider } = await import('$hooks/useRoom');
  const { CustomRoomType } = await import('$types/matrix/room');
  return {
    SpaceRouteRoomProvider: ({ roomIdOrAlias, children }: MockProviderProps) => (
      <RoomProvider value={makeRoom(roomIdOrAlias, CustomRoomType.Forum) as unknown as MatrixRoom}>
        {children}
      </RoomProvider>
    ),
  };
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

const renderHost = (pathname: string, lastRoom?: Record<string, string>) => {
  const store = createStore();
  if (lastRoom) store.set(lastVisitedRoomAtom, lastRoom);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[pathname]}>
        <PersistentRoomHost inactive={false} />
        <LocationProbe />
      </MemoryRouter>
    </Provider>
  );
};

describe('PersistentRoomHost', () => {
  it('hosts the timeline for a non-forum room on a room route', () => {
    renderHost(`/home/${encodeURIComponent(ROOM_ID)}/`);
    expect(screen.getByTestId('room-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      `/home/${encodeURIComponent(ROOM_ID)}/`
    );
  });

  it('redirects a forum room from a home timeline route to the forum route', () => {
    renderHost(`/home/${encodeURIComponent(FORUM_ROOM_ID)}/`);
    expect(screen.queryByTestId('room-timeline')).not.toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent(getHomeForumPath(FORUM_ROOM_ID));
  });

  it('redirects a forum room from a space timeline route to the forum route', () => {
    renderHost(`/${encodeURIComponent(SPACE_ID)}/${encodeURIComponent(FORUM_ROOM_ID)}/`);
    expect(screen.queryByTestId('room-timeline')).not.toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      getSpaceForumPath(SPACE_ID, FORUM_ROOM_ID)
    );
  });

  it('keeps a forum room on the timeline route when the timeline param asks for it', () => {
    renderHost(`/home/${encodeURIComponent(FORUM_ROOM_ID)}/?timeline=true`);
    expect(screen.getByTestId('room-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      `/home/${encodeURIComponent(FORUM_ROOM_ID)}/`
    );
  });

  it('preloads the last visited room on a list route without redirecting', () => {
    renderHost('/home', { home: FORUM_ROOM_ID });
    expect(screen.getByTestId('room-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent('/home');
  });
});
