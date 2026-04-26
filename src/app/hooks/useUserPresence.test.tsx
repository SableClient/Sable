import { act, renderHook } from '@testing-library/react';
import { Provider } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { presenceAutoIdledAtom, settingsAtom } from '$state/settings';
import { useUserPresence, Presence, clearPresenceCache } from './useUserPresence';

// ------- mock setup -------

// Each test can override mockUser / mockGetPresence as needed.
let mockUser: ReturnType<typeof makeMockUser> | null = null;
type PresenceResponse = {
  presence: string;
  status_msg?: string;
  currently_active?: boolean;
  last_active_ago?: number | null;
};
let mockGetPresence: () => Promise<PresenceResponse>;

// Listeners registered via user.on() – captured so tests can emit events.
const userListeners = new Map<string, ((...args: unknown[]) => void)[]>();

const makeMockUser = (
  opts: {
    presence?: string;
    presenceStatusMsg?: string | undefined;
    currentlyActive?: boolean;
    lastActiveTs?: number;
  } = {}
) => ({
  userId: '@alice:test',
  presence: opts.presence ?? 'online',
  presenceStatusMsg: opts.presenceStatusMsg,
  currentlyActive: opts.currentlyActive ?? true,
  getLastActiveTs: vi.fn().mockReturnValue(opts.lastActiveTs ?? 1000),
  on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    const list = userListeners.get(event) ?? [];
    list.push(handler);
    userListeners.set(event, list);
  }),
  removeListener: vi.fn(),
});

const mockMx = {
  getUser: vi.fn((): ReturnType<typeof makeMockUser> | null => mockUser),
  getPresence: vi.fn((): Promise<PresenceResponse> => mockGetPresence()),
  getUserId: vi.fn<() => string | undefined>(() => undefined),
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('./useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

const USER_ID = '@alice:test';

type HookWrapperProps = {
  children: ReactNode;
  sendPresence?: boolean;
  presenceMode?: 'online' | 'unavailable' | 'dnd' | 'offline';
  autoIdled?: boolean;
};

const localStorageSettings = () => {
  const rawSettings = localStorage.getItem('settings');
  return rawSettings ? JSON.parse(rawSettings) : {};
};

const HydratePresenceSettings = ({
  children,
  sendPresence = true,
  presenceMode = 'online',
  autoIdled = false,
}: HookWrapperProps) => {
  useHydrateAtoms([
    [settingsAtom, { ...localStorageSettings(), sendPresence, presenceMode }],
    [presenceAutoIdledAtom, autoIdled],
  ]);
  return children;
};

const createWrapper = (options?: Omit<HookWrapperProps, 'children'>) => {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider>
        <HydratePresenceSettings {...options}>{children}</HydratePresenceSettings>
      </Provider>
    );
  }

  return Wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  userListeners.clear();
  clearPresenceCache();
  localStorage.clear();
  mockUser = null;
  mockGetPresence = () => new Promise(() => {}); // pending by default
  mockMx.getUser.mockImplementation(() => mockUser);
  mockMx.getPresence.mockImplementation(() => mockGetPresence());
  mockMx.getUserId.mockReturnValue(undefined);
});

// ------- tests -------

describe('useUserPresence', () => {
  it('returns undefined when the user is not in the SDK and REST is pending', () => {
    // mockUser is null; REST never resolves
    const { result } = renderHook(() => useUserPresence(USER_ID));
    expect(result.current).toBeUndefined();
  });

  it('initialises from SDK user when available with a non-zero lastActiveTs', () => {
    mockUser = makeMockUser({ presence: 'online', lastActiveTs: 5000 });
    // lastActiveTs > 0 — no REST fallback should be triggered
    const { result } = renderHook(() => useUserPresence(USER_ID));

    expect(result.current).toEqual({
      presence: Presence.Online,
      status: undefined,
      active: true,
      lastActiveTs: 5000,
    });
    expect(mockMx.getPresence).not.toHaveBeenCalled();
  });

  it('fires the REST fallback when getLastActiveTs() is 0 (sliding-sync server)', async () => {
    mockUser = makeMockUser({ presence: 'online', lastActiveTs: 0 });
    let resolvePresence!: (v: {
      presence: string;
      status_msg?: string;
      currently_active?: boolean;
      last_active_ago?: number;
    }) => void;
    mockGetPresence = () =>
      new Promise((res) => {
        resolvePresence = res;
      });

    const { result } = renderHook(() => useUserPresence(USER_ID));

    await act(async () => {
      resolvePresence({
        presence: 'unavailable',
        status_msg: 'in a meeting',
        currently_active: false,
        last_active_ago: 60_000,
      });
    });

    expect(result.current?.presence).toBe(Presence.Unavailable);
    expect(result.current?.status).toBe('in a meeting');
    expect(result.current?.active).toBe(false);
    // lastActiveTs should be approximately Date.now() - 60_000
    expect(result.current?.lastActiveTs).toBeGreaterThan(0);
  });

  it('fires the REST fallback when user object does not exist yet', async () => {
    // user is null — REST should still be requested
    let resolvePresence!: (v: { presence: string }) => void;
    mockGetPresence = () =>
      new Promise((res) => {
        resolvePresence = res;
      });

    const { result } = renderHook(() => useUserPresence(USER_ID));

    expect(mockMx.getPresence).toHaveBeenCalledWith(USER_ID);

    await act(async () => {
      resolvePresence({ presence: 'online' });
    });

    expect(result.current?.presence).toBe(Presence.Online);
  });

  it('does NOT fire REST when userId is an empty string', () => {
    const { result } = renderHook(() => useUserPresence(''));

    expect(mockMx.getPresence).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('ignores the REST response after the component unmounts (cancelled flag)', async () => {
    let resolvePresence!: (v: { presence: string }) => void;
    mockGetPresence = vi.fn().mockReturnValue(
      new Promise((res) => {
        resolvePresence = res;
      })
    );

    const { result, unmount } = renderHook(() => useUserPresence(USER_ID));
    unmount();

    // Resolve after unmount — cancelled = true, so state should NOT be updated
    await act(async () => {
      resolvePresence({ presence: 'online' });
    });

    expect(result.current).toBeUndefined();
  });

  it('updates presence when UserEvent.Presence fires on the user object', () => {
    mockUser = makeMockUser({ presence: 'online', lastActiveTs: 1000 });
    mockGetPresence = () => new Promise(() => {});

    const { result } = renderHook(() => useUserPresence(USER_ID));

    // Mutate mock user to simulate a presence change, then fire the registered listener
    mockUser.presence = 'unavailable';
    const handlers = userListeners.get('User.presence') ?? [];

    act(() => {
      handlers.forEach((h) => h({}, mockUser));
    });

    expect(result.current?.presence).toBe(Presence.Unavailable);
  });

  it('resets to undefined when userId changes to a user not in the SDK', () => {
    mockUser = makeMockUser({ presence: 'online', lastActiveTs: 1000 });
    mockGetPresence = () => new Promise(() => {});

    const { result, rerender } = renderHook(({ uid }) => useUserPresence(uid), {
      initialProps: { uid: USER_ID },
    });

    expect(result.current).not.toBeUndefined();

    // Switch to unknown user
    mockUser = null;
    rerender({ uid: '@bob:test' });

    expect(result.current).toBeUndefined();
  });

  it('silently ignores a REST error (presence not supported on this server)', async () => {
    mockGetPresence = () => Promise.reject(new Error('404 Not Found'));

    const { result } = renderHook(() => useUserPresence(USER_ID));

    // Wait for the rejection to be processed
    await act(async () => {
      await Promise.resolve();
    });

    // Should still be undefined without throwing
    expect(result.current).toBeUndefined();
  });

  it('normalizes synthetic dnd presence from the SDK user object', () => {
    mockUser = makeMockUser({ presence: 'online', presenceStatusMsg: 'dnd', lastActiveTs: 1000 });

    const { result } = renderHook(() => useUserPresence('@bob:test'));

    expect(result.current).toEqual({
      presence: Presence.Dnd,
      status: undefined,
      active: true,
      lastActiveTs: 1000,
    });
  });

  it('overrides own presence from settings so member lists update immediately', () => {
    mockUser = makeMockUser({ presence: 'online', lastActiveTs: 1000 });
    mockMx.getUserId.mockReturnValue(USER_ID);

    const { result } = renderHook(() => useUserPresence(USER_ID), {
      wrapper: createWrapper({ presenceMode: 'dnd' }),
    });

    expect(result.current?.presence).toBe(Presence.Dnd);
    expect(result.current?.status).toBeUndefined();
  });

  it('marks own presence idle when auto-idle is active', () => {
    mockUser = makeMockUser({ presence: 'online', lastActiveTs: 1000 });
    mockMx.getUserId.mockReturnValue(USER_ID);

    const { result } = renderHook(() => useUserPresence(USER_ID), {
      wrapper: createWrapper({ autoIdled: true }),
    });

    expect(result.current?.presence).toBe(Presence.Unavailable);
    expect(result.current?.active).toBe(false);
  });
});
