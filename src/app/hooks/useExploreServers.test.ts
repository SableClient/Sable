import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { CustomAccountDataEvent } from '$types/matrix/accountData';

import { useExploreServers } from './useExploreServers';

const { callbackHolder, mockMx } = vi.hoisted(() => {
  const holder: {
    current: ((event: { getType: () => string; getContent: () => unknown }) => void) | null;
  } = { current: null };
  const mx = {
    getAccountData: vi.fn<() => { getContent: () => unknown } | null>().mockReturnValue(null),
    setAccountData: vi
      .fn<(type: string, content: { servers: string[] }) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  return { callbackHolder: holder, mockMx: mx };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

vi.mock('$hooks/useAccountDataCallback', () => ({
  useAccountDataCallback: (
    _mx: unknown,
    cb: (event: { getType: () => string; getContent: () => unknown }) => void
  ) => {
    callbackHolder.current = cb;
  },
}));

describe('useExploreServers', () => {
  beforeEach(() => {
    mockMx.getAccountData.mockReturnValue(null);
    mockMx.setAccountData.mockClear();
  });

  it('loads servers from account data', () => {
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({ servers: ['matrix.org', 't2bot.io'] }),
    });

    const { result } = renderHook(() => useExploreServers());

    expect(result.current.servers).toEqual(['matrix.org', 't2bot.io']);
  });

  it('persists a new server to account data', async () => {
    const { result } = renderHook(() => useExploreServers());

    await act(async () => {
      await result.current.addServer('matrix.org');
    });

    expect(mockMx.setAccountData).toHaveBeenCalledWith(CustomAccountDataEvent.SableAddedServers, {
      servers: ['matrix.org'],
    });
    expect(result.current.servers).toEqual(['matrix.org']);
  });

  it('does not duplicate servers case-insensitively', async () => {
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({ servers: ['matrix.org'] }),
    });

    const { result } = renderHook(() => useExploreServers());

    await act(async () => {
      await result.current.addServer('Matrix.org');
    });

    expect(mockMx.setAccountData).not.toHaveBeenCalled();
    expect(result.current.servers).toEqual(['matrix.org']);
  });

  it('rejects invalid server names', async () => {
    const { result } = renderHook(() => useExploreServers());

    await act(async () => {
      const ok = await result.current.addServer('not a server!!!');
      expect(ok).toBe(false);
    });

    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });

  it('removes a server from account data', async () => {
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({ servers: ['matrix.org', 'example.org'] }),
    });

    const { result } = renderHook(() => useExploreServers());

    await act(async () => {
      await result.current.removeServer('matrix.org');
    });

    expect(mockMx.setAccountData).toHaveBeenCalledWith(CustomAccountDataEvent.SableAddedServers, {
      servers: ['example.org'],
    });
    expect(result.current.servers).toEqual(['example.org']);
  });

  it('updates when account data changes', () => {
    const { result } = renderHook(() => useExploreServers());

    act(() => {
      callbackHolder.current?.({
        getType: () => CustomAccountDataEvent.SableAddedServers,
        getContent: () => ({ servers: ['example.org'] }),
      });
    });

    expect(result.current.servers).toEqual(['example.org']);
  });
});
