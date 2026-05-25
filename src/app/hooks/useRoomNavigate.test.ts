import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createStore, Provider } from 'jotai';
import type * as ReactRouterDom from 'react-router-dom';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { useRoomNavigate } from './useRoomNavigate';

const mockNavigate = vi.fn<(path: string) => void>();

// Preserve the real generatePath (used by $pages/pathUtils) while stubbing useNavigate.
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof ReactRouterDom>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ getRoom: vi.fn<() => null>() }),
}));

// Return the roomId as-is so path assertions are straightforward.
vi.mock('$utils/matrix', () => ({
  getCanonicalAliasOrRoomId: (_mx: unknown, roomId: string) => roomId,
}));

vi.mock('$hooks/router/useSelectedSpace', () => ({
  useSelectedSpace: () => undefined,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [false, vi.fn<(value: boolean) => void>()],
}));

function makeWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
  };
}

describe('useRoomNavigate', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  describe('navigateRoom', () => {
    it('routes a DM room to /direct even when it has space parents (regression)', () => {
      // Regression guard: before the fix, a DM room that also appeared in
      // roomToParents would be routed to the space path instead of /direct.
      const store = createStore();
      const dmRoomId = '!dm:example.org';
      const spaceId = '!space:example.org';

      store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set([dmRoomId]) });
      const roomToParents = new Map<string, Set<string>>();
      roomToParents.set(dmRoomId, new Set([spaceId]));
      store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents });

      const { result } = renderHook(() => useRoomNavigate(), {
        wrapper: makeWrapper(store),
      });

      result.current.navigateRoom(dmRoomId);

      expect(mockNavigate).toHaveBeenCalledOnce();
      expect(mockNavigate.mock.calls[0]![0]).toMatch(/^\/direct\//);
    });

    it('routes a non-DM room with an orphan space parent through the space path', () => {
      const store = createStore();
      const roomId = '!room:example.org';
      const spaceId = '!space:example.org';

      store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set() });
      // spaceId is a parent of roomId and is itself an orphan (top-level space)
      const roomToParents = new Map<string, Set<string>>();
      roomToParents.set(roomId, new Set([spaceId]));
      store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents });

      const { result } = renderHook(() => useRoomNavigate(), {
        wrapper: makeWrapper(store),
      });

      result.current.navigateRoom(roomId);

      expect(mockNavigate).toHaveBeenCalledOnce();
      const navigatedPath = mockNavigate.mock.calls[0]![0];
      expect(navigatedPath).not.toMatch(/^\/direct\//);
      expect(navigatedPath).not.toMatch(/^\/home\//);
    });

    it('routes an orphan room with no parents to /home', () => {
      const store = createStore();
      const roomId = '!room:example.org';

      store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set() });
      store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents: new Map() });

      const { result } = renderHook(() => useRoomNavigate(), {
        wrapper: makeWrapper(store),
      });

      result.current.navigateRoom(roomId);

      expect(mockNavigate).toHaveBeenCalledOnce();
      expect(mockNavigate.mock.calls[0]![0]).toMatch(/^\/home\//);
    });
  });
});
