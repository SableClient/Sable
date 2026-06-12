import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGroupDMMembers } from './useGroupDMMembers';

type MockMember = {
  userId: string;
  membership: string;
  name?: string;
  getMxcAvatarUrl: () => string | undefined;
};

const makeMember = (userId: string, name = userId): MockMember => ({
  userId,
  membership: 'join',
  name,
  getMxcAvatarUrl: () => `mxc://example.org/${userId.slice(1, 6)}`,
});

const makeMx = () => ({
  getUserId: () => '@me:example.org',
  getProfileInfo: vi.fn<(userId: string) => Promise<{ displayname: string; avatar_url: string }>>(
    async (userId) => ({
      displayname: `Profile ${userId}`,
      avatar_url: `mxc://profile/${userId}`,
    })
  ),
});

function makeRoom(roomId: string, localMembers: MockMember[], loadedMembers: MockMember[]) {
  let members = localMembers;
  const loadMembersIfNeeded = vi.fn<() => Promise<void>>(async () => {
    members = loadedMembers;
  });

  return {
    roomId,
    getJoinedMemberCount: () => loadedMembers.length,
    getMembers: () => members,
    loadMembersIfNeeded,
    getLiveTimeline: () => ({
      getEvents: () => [
        { getSender: () => '@third:example.org' },
        { getSender: () => '@second:example.org' },
      ],
    }),
  };
}

describe('useGroupDMMembers', () => {
  it('loads sparse lazy-loaded group DM members once so the triangle can render', async () => {
    const mx = makeMx();
    const loadedMembers = [
      makeMember('@me:example.org', 'Me'),
      makeMember('@first:example.org', 'First'),
      makeMember('@second:example.org', 'Second'),
      makeMember('@third:example.org', 'Third'),
    ];
    const room = makeRoom('!group-dm-lazy:example.org', loadedMembers.slice(0, 2), loadedMembers);

    const { result } = renderHook(() => useGroupDMMembers(mx as never, room as never, 3));

    expect(result.current).toHaveLength(1);

    await waitFor(() => {
      expect(result.current.map((member) => member.userId)).toEqual([
        '@second:example.org',
        '@third:example.org',
        '@first:example.org',
      ]);
    });
    expect(room.loadMembersIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent lazy member loads for the same room', async () => {
    const mx = makeMx();
    let finishLoad: (() => void) | undefined;
    const loadedMembers = [
      makeMember('@me:example.org', 'Me'),
      makeMember('@first:example.org', 'First'),
      makeMember('@second:example.org', 'Second'),
      makeMember('@third:example.org', 'Third'),
    ];
    let members = loadedMembers.slice(0, 2);
    const room = {
      roomId: '!group-dm-concurrent:example.org',
      getJoinedMemberCount: () => loadedMembers.length,
      getMembers: () => members,
      loadMembersIfNeeded: vi.fn<() => Promise<void>>(
        () =>
          new Promise<void>((resolve) => {
            finishLoad = () => {
              members = loadedMembers;
              resolve();
            };
          })
      ),
      getLiveTimeline: () => ({ getEvents: () => [] }),
    };

    const first = renderHook(() => useGroupDMMembers(mx as never, room as never, 3));
    const second = renderHook(() => useGroupDMMembers(mx as never, room as never, 3));

    expect(room.loadMembersIfNeeded).toHaveBeenCalledTimes(1);
    expect(finishLoad).toBeDefined();
    finishLoad?.();

    await waitFor(() => {
      expect(first.result.current).toHaveLength(3);
      expect(second.result.current).toHaveLength(3);
    });
  });
});
