import { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SyncState } from '$types/matrix-sdk';
import { getHomeRoomPath } from '$pages/pathUtils';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { NotificationJumper } from './useNotificationJumper';

const navigateMock = vi.fn();

const roomTimelineEvents: { getId: () => string }[] = [];
const roomMock = {
  roomId: '!room:test',
  getMyMembership: vi.fn(() => 'join'),
  getCanonicalAlias: vi.fn(() => undefined),
  getUnfilteredTimelineSet: vi.fn(() => ({
    getLiveTimeline: () => ({
      getEvents: () => roomTimelineEvents,
    }),
  })),
};

const mxMock = {
  getUserId: vi.fn(() => '@alice:test'),
  getSyncState: vi.fn(() => SyncState.Syncing),
  getRoom: vi.fn(() => roomMock),
  getRooms: vi.fn(() => []),
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('./useMatrixClient', () => ({
  useMatrixClient: () => mxMock,
}));

vi.mock('./useSyncState', () => ({
  useSyncState: vi.fn(),
}));

vi.mock('../utils/debug', () => ({
  createLogger: () => ({
    log: vi.fn(),
  }),
}));

type WrapperProps = {
  children: ReactNode;
};

function HydrateAtoms({ children }: WrapperProps) {
  useHydrateAtoms([
    [activeSessionIdAtom, '@alice:test'],
    [pendingNotificationAtom, { roomId: '!room:test', eventId: '$event:test' }],
    [mDirectAtom, new Set<string>()],
    [roomToParentsAtom, new Map()],
  ]);

  return <>{children}</>;
}

function HydratedWrapper({ children }: WrapperProps) {
  return (
    <Provider>
      <HydrateAtoms>
        <MemoryRouter>{children}</MemoryRouter>
      </HydrateAtoms>
    </Provider>
  );
}

describe('NotificationJumper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockReset();
    roomTimelineEvents.length = 0;
    roomMock.getMyMembership.mockReturnValue('join');
    mxMock.getUserId.mockReturnValue('@alice:test');
    mxMock.getSyncState.mockReturnValue(SyncState.Syncing);
    mxMock.getRoom.mockReturnValue(roomMock);
    mxMock.getRooms.mockReturnValue([]);
    mxMock.on.mockClear();
    mxMock.removeListener.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigates immediately when the target event is already in the live timeline', () => {
    roomTimelineEvents.push({ getId: () => '$event:test' });

    render(<NotificationJumper />, { wrapper: HydratedWrapper });

    expect(navigateMock).toHaveBeenCalledWith(getHomeRoomPath('!room:test', '$event:test'));
  });

  it('falls back after the timeout even if no further room events arrive', () => {
    render(<NotificationJumper />, { wrapper: HydratedWrapper });

    expect(navigateMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(navigateMock).toHaveBeenCalledWith(getHomeRoomPath('!room:test', '$event:test'));
  });
});
