import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';

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
});
