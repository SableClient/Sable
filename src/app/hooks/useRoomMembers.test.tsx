import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClientEvent, RoomMemberEvent } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room, RoomMember } from '$types/matrix-sdk';

const { hydrateAllRoomMembers } = vi.hoisted(() => ({
  hydrateAllRoomMembers: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('$client/roomMemberHydration', () => ({ hydrateAllRoomMembers }));

import { useRoomMembers } from './useRoomMembers';

describe('useRoomMembers', () => {
  it('does not retry with a full roster request when the SDK member load fails', async () => {
    const room = {
      roomId: '!room:example.org',
      getMembers: () => [] as RoomMember[],
      getJoinedMemberCount: () => 1,
      loadMembersIfNeeded: vi
        .fn<() => Promise<void>>()
        .mockRejectedValue(new Error('NetworkError')),
    } as unknown as Room;
    const mx = {
      getRoom: () => room,
      on: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;

    renderHook(() => useRoomMembers(mx, room.roomId));

    await waitFor(() => expect(room.loadMembersIfNeeded).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(hydrateAllRoomMembers).not.toHaveBeenCalled();
  });

  it('refills the roster again on later sync responses', async () => {
    hydrateAllRoomMembers.mockClear();
    const room = {
      roomId: '!room:example.org',
      getMembers: () => [] as RoomMember[],
      getJoinedMemberCount: () => 1,
      loadMembersIfNeeded: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Room;
    const handlers = new Map<string, () => void>();
    const mx = {
      getRoom: () => room,
      on: vi.fn<(event: string, handler: () => void) => void>((event, handler) => {
        handlers.set(event, handler);
      }),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;

    renderHook(() => useRoomMembers(mx, room.roomId));

    await waitFor(() => expect(hydrateAllRoomMembers).toHaveBeenCalledOnce());

    act(() => handlers.get(ClientEvent.Sync)?.());

    expect(hydrateAllRoomMembers).toHaveBeenCalledTimes(2);
  });

  it('does not refill the roster on sync after a failed SDK member load', async () => {
    hydrateAllRoomMembers.mockClear();
    const room = {
      roomId: '!room:example.org',
      getMembers: () => [] as RoomMember[],
      getJoinedMemberCount: () => 1,
      loadMembersIfNeeded: vi
        .fn<() => Promise<void>>()
        .mockRejectedValue(new Error('NetworkError')),
    } as unknown as Room;
    const handlers = new Map<string, () => void>();
    const mx = {
      getRoom: () => room,
      on: vi.fn<(event: string, handler: () => void) => void>((event, handler) => {
        handlers.set(event, handler);
      }),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;

    renderHook(() => useRoomMembers(mx, room.roomId));

    await waitFor(() => expect(room.loadMembersIfNeeded).toHaveBeenCalledOnce());
    await Promise.resolve();
    act(() => handlers.get(ClientEvent.Sync)?.());

    expect(hydrateAllRoomMembers).not.toHaveBeenCalled();
  });

  it('does not load a full roster for large rooms', () => {
    hydrateAllRoomMembers.mockClear();
    const room = {
      roomId: '!room:example.org',
      getMembers: () => [] as RoomMember[],
      getJoinedMemberCount: () => 30_000,
      loadMembersIfNeeded: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Room;
    const mx = {
      getRoom: () => room,
      on: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;

    renderHook(() => useRoomMembers(mx, room.roomId));

    expect(room.loadMembersIfNeeded).not.toHaveBeenCalled();
    expect(hydrateAllRoomMembers).not.toHaveBeenCalled();
  });

  it('keeps the member array identity stable when a sync refill changes nothing', async () => {
    hydrateAllRoomMembers.mockClear();
    const roster = [
      { userId: '@alice:example.org', membership: 'join', powerLevel: 0 },
    ] as unknown as RoomMember[];
    const room = {
      roomId: '!room:example.org',
      getMembers: () => [...roster],
      getJoinedMemberCount: () => 1,
      loadMembersIfNeeded: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Room;
    const handlers = new Map<string, () => void>();
    const mx = {
      getRoom: () => room,
      on: vi.fn<(event: string, handler: () => void) => void>((event, handler) => {
        handlers.set(event, handler);
      }),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;

    const { result } = renderHook(() => useRoomMembers(mx, room.roomId));
    await waitFor(() => expect(result.current).toHaveLength(1));
    const first = result.current;

    await act(async () => {
      handlers.get(ClientEvent.Sync)?.();
      await Promise.resolve();
    });

    expect(result.current).toBe(first);
  });

  it('publishes a new member array when the roster changes', async () => {
    hydrateAllRoomMembers.mockClear();
    const roster = [
      { userId: '@alice:example.org', membership: 'join', powerLevel: 0 },
    ] as unknown as RoomMember[];
    const room = {
      roomId: '!room:example.org',
      getMembers: () => [...roster],
      getJoinedMemberCount: () => 1,
      loadMembersIfNeeded: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Room;
    const handlers = new Map<string, (event?: MatrixEvent) => void>();
    const mx = {
      getRoom: () => room,
      on: vi.fn<(event: string, handler: (event?: MatrixEvent) => void) => void>(
        (event, handler) => {
          handlers.set(event, handler);
        }
      ),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;

    const { result } = renderHook(() => useRoomMembers(mx, room.roomId));
    await waitFor(() => expect(result.current).toHaveLength(1));

    act(() => {
      roster.push({
        userId: '@bob:example.org',
        membership: 'join',
        powerLevel: 0,
      } as unknown as RoomMember);
      handlers.get(RoomMemberEvent.Membership)?.({
        getRoomId: () => room.roomId,
      } as MatrixEvent);
    });

    expect(result.current).toHaveLength(2);
  });

  it('keeps member updates flowing while the SDK member load is pending', async () => {
    let resolveMemberLoad!: () => void;
    const members: RoomMember[] = [];
    const room = {
      roomId: '!room:example.org',
      getMembers: () => members,
      getJoinedMembers: () => members,
      getJoinedMemberCount: () => 1,
      loadMembersIfNeeded: vi.fn<() => Promise<void>>(
        () =>
          new Promise<void>((resolve) => {
            resolveMemberLoad = resolve;
          })
      ),
    } as unknown as Room;
    let membershipHandler: ((event: MatrixEvent) => void) | undefined;
    const mx = {
      getRoom: () => room,
      on: vi.fn<(event: string, handler: (event: MatrixEvent) => void) => void>(
        (event, handler) => {
          if (event === RoomMemberEvent.Membership) membershipHandler = handler;
        }
      ),
      removeListener: vi.fn<() => void>(),
    } as unknown as MatrixClient;
    const event = { getRoomId: () => room.roomId } as MatrixEvent;

    const { result } = renderHook(() => useRoomMembers(mx, room.roomId));
    act(() => {
      members.push({ userId: '@alice:example.org' } as RoomMember);
      membershipHandler?.(event);
    });

    await waitFor(() => expect(result.current).toEqual(members));
    resolveMemberLoad();
  });
});
