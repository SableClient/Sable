import type { ReactNode } from 'react';
import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MatrixClient } from '$types/matrix-sdk';
import { MatrixClientProvider } from './useMatrixClient';
import { IsInactivePanelProvider } from './useRoom';
import { useUserProfile } from './useUserProfile';

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: string) => {
    const enabled = new Set(['renderGlobalNameColors', 'renderRoomColors', 'renderRoomFonts']);
    return [enabled.has(key), vi.fn<() => void>()];
  },
}));

vi.mock('./useTheme', () => ({
  ThemeKind: { Light: 'light', Dark: 'dark' },
  useActiveTheme: () => ({ kind: 'light' }),
}));

const makeClient = () =>
  ({
    getProfileInfo: vi
      .fn<() => Promise<{ displayname: string }>>()
      .mockResolvedValue({ displayname: 'Alice' }),
    getUser: vi.fn<() => void>(),
    getUserId: vi.fn<() => string>().mockReturnValue('@me:example.org'),
  }) as unknown as MatrixClient;

const makeWrapper = (mx: MatrixClient, inactive: boolean) => {
  const store = createStore();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      JotaiProvider,
      { store },
      createElement(
        MatrixClientProvider,
        { value: mx },
        createElement(IsInactivePanelProvider, { value: inactive }, children)
      )
    );
  };
};

describe('useUserProfile', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fetch profiles for an inactive persistent room', async () => {
    vi.useFakeTimers();
    const mx = makeClient();

    renderHook(() => useUserProfile('@alice:example.org'), {
      wrapper: makeWrapper(mx, true),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mx.getProfileInfo).not.toHaveBeenCalled();
  });

  it('still fetches profiles in the active panel after the dwell delay', async () => {
    vi.useFakeTimers();
    const mx = makeClient();

    renderHook(() => useUserProfile('@alice:example.org'), {
      wrapper: makeWrapper(mx, false),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mx.getProfileInfo).toHaveBeenCalledOnce();
    expect(mx.getProfileInfo).toHaveBeenCalledWith('@alice:example.org');
  });

  it('serves the newest queued profile first so a backlog cannot bury it', async () => {
    vi.useFakeTimers();
    const userIds = Array.from({ length: 6 }, (_unused, index) => `@user${index}:example.org`);
    const requested: string[] = [];
    const release: (() => void)[] = [];
    const mx = {
      getProfileInfo: vi.fn<(userId: string) => Promise<{ displayname: string }>>(
        (userId: string) => {
          requested.push(userId);
          return new Promise((resolve) => {
            release.push(() => resolve({ displayname: userId }));
          });
        }
      ),
      getUser: vi.fn<() => void>(),
      getUserId: vi.fn<() => string>().mockReturnValue('@me:example.org'),
    } as unknown as MatrixClient;

    renderHook(() => userIds.map((userId) => useUserProfile(userId)), {
      wrapper: makeWrapper(mx, false),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    // The cap is four, so the last two queue.
    expect(requested).toEqual(userIds.slice(0, 4));

    await act(async () => {
      release.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(requested[4]).toBe(userIds[5]);
  });
});
