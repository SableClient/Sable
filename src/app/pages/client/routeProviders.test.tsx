import { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeRouteRoomProvider } from './home/RoomProvider';
import { RouteSpaceProvider } from './space/SpaceProvider';
import { SpaceRouteRoomProvider } from './space/RoomProvider';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { allRoomsAtom } from '$state/room-list/roomList';
import { mDirectAtom } from '$state/mDirectList';

const mockUseMatrixClient = vi.fn<() => { getRoom: (roomId?: string) => unknown }>();
const mockUseHomeRooms = vi.fn<() => string[]>();
const mockUseSelectedRoom = vi.fn<() => string | undefined>();
const mockUseSearchParamsViaServers = vi.fn<() => string[] | undefined>();
const mockUseSelectedSpace = vi.fn<() => string | undefined>();
const mockUseSpaces = vi.fn<() => string[]>();
const mockUseSpace = vi.fn<() => { roomId: string }>();
const mockUseSetting = vi.fn<() => [boolean]>();
const mockUseAtom = vi.fn<(atom: unknown) => unknown>();
const mockUseAtomValue = vi.fn<(atom: unknown) => unknown>();
const mockGetAllParents =
  vi.fn<(parents: Map<string, Set<string>>, roomId: string) => Set<string>>();
const mockGetSpaceChildren = vi.fn<(space: { roomId: string }) => string[]>();
const mockGetRoomToParents = vi.fn<() => Map<string, Set<string>>>();
const mockIsRoom = vi.fn<(room: unknown) => boolean>();
const mockIsSpace = vi.fn<(room: unknown) => boolean>();

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockUseMatrixClient(),
}));

vi.mock('./home/useHomeRooms', () => ({
  useHomeRooms: () => mockUseHomeRooms(),
}));

vi.mock('$hooks/router/useSelectedRoom', () => ({
  useSelectedRoom: () => mockUseSelectedRoom(),
}));

vi.mock('$hooks/router/useSearchParamsViaServers', () => ({
  useSearchParamsViaServers: () => mockUseSearchParamsViaServers(),
}));

vi.mock('$hooks/router/useSelectedSpace', () => ({
  useSelectedSpace: () => mockUseSelectedSpace(),
}));

vi.mock('$state/hooks/roomList', () => ({
  useSpaces: () => mockUseSpaces(),
}));

vi.mock('$utils/room', () => ({
  getAllParents: (parents: Map<string, Set<string>>, roomId: string) =>
    mockGetAllParents(parents, roomId),
  getSpaceChildren: (space: { roomId: string }) => mockGetSpaceChildren(space),
  getRoomToParents: () => mockGetRoomToParents(),
  isRoom: (room: unknown) => mockIsRoom(room),
  isSpace: (room: unknown) => mockIsSpace(room),
}));

vi.mock('$hooks/useSpace', () => ({
  useSpace: () => mockUseSpace(),
  SpaceProvider: ({ children, value }: { children: ReactNode; value: { roomId: string } }) => (
    <div data-room-id={value.roomId} data-testid="space-provider">
      {children}
    </div>
  ),
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => mockUseSetting(),
}));

vi.mock('jotai', async () => {
  const actual = await vi.importActual('jotai');
  return {
    ...(actual as object),
    useAtom: (atom: unknown) => mockUseAtom(atom),
    useAtomValue: (atom: unknown) => mockUseAtomValue(atom),
  };
});

vi.mock('$features/join-before-navigate', () => ({
  JoinBeforeNavigate: ({ roomIdOrAlias }: { roomIdOrAlias: string }) => (
    <div data-testid="join-fallback">{roomIdOrAlias}</div>
  ),
}));

vi.mock('$hooks/useRoom', () => ({
  RoomProvider: ({ children, value }: { children: ReactNode; value: { roomId: string } }) => (
    <div data-room-id={value.roomId} data-testid="room-provider">
      {children}
    </div>
  ),
  IsDirectRoomProvider: ({ children, value }: { children: ReactNode; value: boolean }) => (
    <div data-direct={String(value)} data-testid="direct-room-provider">
      {children}
    </div>
  ),
}));

const renderWithRoute = (route: string, path: string, element: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>
  );

describe('room route providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParamsViaServers.mockReturnValue(undefined);
    mockUseSetting.mockReturnValue([false]);
    mockGetAllParents.mockReturnValue(new Set());
    mockGetSpaceChildren.mockReturnValue([]);
    mockGetRoomToParents.mockReturnValue(new Map());
    mockIsRoom.mockReturnValue(true);
    mockIsSpace.mockReturnValue(true);
    mockUseAtom.mockImplementation((atom: unknown) => {
      if (atom === roomToParentsAtom) {
        return [new Map(), vi.fn<() => void>()];
      }
      throw new Error(`Unexpected atom: ${String(atom)}`);
    });
    mockUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === allRoomsAtom) return [];
      if (atom === mDirectAtom) return new Set<string>();
      throw new Error(`Unexpected atom: ${String(atom)}`);
    });
  });

  it('keeps rendering a joined home room while the home list catches up', () => {
    mockUseHomeRooms.mockReturnValue([]);
    mockUseSelectedRoom.mockReturnValue('!room:server');
    mockUseMatrixClient.mockReturnValue({
      getRoom: () => ({
        roomId: '!room:server',
        getMyMembership: () => 'join',
      }),
    });

    renderWithRoute(
      '/home/room/%21room%3Aserver',
      '/home/room/:roomIdOrAlias',
      <HomeRouteRoomProvider>
        <div>Joined room</div>
      </HomeRouteRoomProvider>
    );

    expect(screen.getByTestId('room-provider')).toHaveAttribute('data-room-id', '!room:server');
    expect(screen.getByText('Joined room')).toBeInTheDocument();
    expect(screen.queryByTestId('join-fallback')).not.toBeInTheDocument();
  });

  it('keeps non-home joined rooms out of the home route', () => {
    mockUseHomeRooms.mockReturnValue([]);
    mockUseSelectedRoom.mockReturnValue('!room:server');
    mockGetAllParents.mockReturnValue(new Set(['!space:server']));
    mockUseMatrixClient.mockReturnValue({
      getRoom: () => ({
        roomId: '!room:server',
        getMyMembership: () => 'join',
      }),
    });

    renderWithRoute(
      '/home/room/%21room%3Aserver',
      '/home/room/:roomIdOrAlias',
      <HomeRouteRoomProvider>
        <div>Joined room</div>
      </HomeRouteRoomProvider>
    );

    expect(screen.getByTestId('join-fallback')).toHaveTextContent('!room:server');
    expect(screen.queryByText('Joined room')).not.toBeInTheDocument();
  });

  it('keeps rendering a joined space while the space list catches up', () => {
    mockUseSpaces.mockReturnValue([]);
    mockUseSelectedSpace.mockReturnValue('!space:server');
    mockUseMatrixClient.mockReturnValue({
      getRoom: () => ({
        roomId: '!space:server',
        getMyMembership: () => 'join',
      }),
    });

    renderWithRoute(
      '/space/%21space%3Aserver',
      '/space/:spaceIdOrAlias',
      <RouteSpaceProvider>
        <div>Joined space</div>
      </RouteSpaceProvider>
    );

    expect(screen.getByTestId('space-provider')).toHaveAttribute('data-room-id', '!space:server');
    expect(screen.getByText('Joined space')).toBeInTheDocument();
    expect(screen.queryByTestId('join-fallback')).not.toBeInTheDocument();
  });

  it('keeps non-space rooms out of the top-level space route', () => {
    mockUseSpaces.mockReturnValue([]);
    mockUseSelectedSpace.mockReturnValue('!room:server');
    mockIsSpace.mockReturnValue(false);
    mockUseMatrixClient.mockReturnValue({
      getRoom: () => ({
        roomId: '!room:server',
        getMyMembership: () => 'join',
      }),
    });

    renderWithRoute(
      '/space/%21room%3Aserver',
      '/space/:spaceIdOrAlias',
      <RouteSpaceProvider>
        <div>Joined space</div>
      </RouteSpaceProvider>
    );

    expect(screen.getByTestId('join-fallback')).toHaveTextContent('!room:server');
    expect(screen.queryByText('Joined space')).not.toBeInTheDocument();
  });

  it('keeps rendering a joined room in a space while parent mapping catches up', () => {
    const setRoomToParents = vi.fn<(value: unknown) => void>();
    const space = {
      roomId: '!space:server',
    };
    const room = {
      roomId: '!room:server',
      getMyMembership: () => 'join',
      isSpaceRoom: () => false,
    };

    mockUseSpace.mockReturnValue(space);
    mockUseSelectedRoom.mockReturnValue('!room:server');
    mockUseMatrixClient.mockReturnValue({
      getRoom: () => room,
    });
    mockGetSpaceChildren.mockReturnValue(['!room:server']);
    mockUseAtom.mockImplementation((atom: unknown) => {
      if (atom === roomToParentsAtom) {
        return [new Map(), setRoomToParents];
      }
      throw new Error(`Unexpected atom: ${String(atom)}`);
    });
    mockUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === allRoomsAtom) return ['!room:server'];
      if (atom === mDirectAtom) return new Set<string>();
      throw new Error(`Unexpected atom: ${String(atom)}`);
    });

    renderWithRoute(
      '/space/%21space%3Aserver/room/%21room%3Aserver',
      '/space/:spaceIdOrAlias/room/:roomIdOrAlias',
      <SpaceRouteRoomProvider>
        <div>Space room</div>
      </SpaceRouteRoomProvider>
    );

    expect(screen.getByTestId('room-provider')).toHaveAttribute('data-room-id', '!room:server');
    expect(screen.getByText('Space room')).toBeInTheDocument();
    expect(screen.queryByTestId('join-fallback')).not.toBeInTheDocument();
    expect(setRoomToParents).toHaveBeenCalledWith({
      type: 'PUT',
      parent: '!space:server',
      children: ['!room:server'],
    });
  });

  it('keeps unrelated joined rooms out of a space route before list state catches up', () => {
    const setRoomToParents = vi.fn<(value: unknown) => void>();
    const space = {
      roomId: '!space:server',
    };
    const room = {
      roomId: '!room:server',
      getMyMembership: () => 'join',
      isSpaceRoom: () => false,
    };

    mockUseSpace.mockReturnValue(space);
    mockUseSelectedRoom.mockReturnValue('!room:server');
    mockUseMatrixClient.mockReturnValue({
      getRoom: () => room,
    });
    mockUseAtom.mockImplementation((atom: unknown) => {
      if (atom === roomToParentsAtom) {
        return [new Map(), setRoomToParents];
      }
      throw new Error(`Unexpected atom: ${String(atom)}`);
    });
    mockUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === allRoomsAtom) return [];
      if (atom === mDirectAtom) return new Set<string>();
      throw new Error(`Unexpected atom: ${String(atom)}`);
    });

    renderWithRoute(
      '/space/%21space%3Aserver/room/%21room%3Aserver',
      '/space/:spaceIdOrAlias/room/:roomIdOrAlias',
      <SpaceRouteRoomProvider>
        <div>Space room</div>
      </SpaceRouteRoomProvider>
    );

    expect(screen.getByTestId('join-fallback')).toHaveTextContent('!room:server');
    expect(screen.queryByText('Space room')).not.toBeInTheDocument();
    expect(setRoomToParents).not.toHaveBeenCalled();
  });
});
