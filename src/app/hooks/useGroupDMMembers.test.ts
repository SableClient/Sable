import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent, Room, RoomMember } from '$types/matrix-sdk';
import { useGroupDMMembers } from './useGroupDMMembers';

const makeMember = (userId: string, displayName: string, avatar?: string): RoomMember =>
  ({
    userId,
    membership: 'join',
    rawDisplayName: displayName,
    getMxcAvatarUrl: () => avatar ?? null,
  }) as unknown as RoomMember;

describe('useGroupDMMembers', () => {
  it('uses synced room state without requesting members or global profiles', () => {
    const alice = makeMember('@alice:example.org', 'Alice');
    const bob = makeMember('@bob:example.org', 'Bob', 'mxc://example.org/bob');
    const carol = makeMember('@carol:example.org', 'Carol');
    const members = [alice, bob, carol];
    const loadMembersIfNeeded = vi.fn<() => Promise<void>>();
    const getProfileInfo = vi.fn<() => Promise<unknown>>();
    const events = [
      { getSender: () => '@carol:example.org' },
      { getSender: () => '@bob:example.org' },
    ] as MatrixEvent[];
    const room = {
      getMembers: () => members,
      getMember: (userId: string) => members.find((member) => member.userId === userId),
      getLiveTimeline: () => ({ getEvents: () => events }),
      loadMembersIfNeeded,
    } as unknown as Room;
    const mx = {
      getUserId: () => '@alice:example.org',
      getProfileInfo,
    } as unknown as MatrixClient;

    expect(useGroupDMMembers(mx, room, 2)).toEqual([
      {
        userId: '@bob:example.org',
        displayName: 'Bob',
        avatarUrl: 'mxc://example.org/bob',
      },
      { userId: '@carol:example.org', displayName: 'Carol', avatarUrl: undefined },
    ]);
    expect(loadMembersIfNeeded).not.toHaveBeenCalled();
    expect(getProfileInfo).not.toHaveBeenCalled();
  });
});
