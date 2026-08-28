import { renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { KnownMembership } from '$types/matrix-sdk';
import type { Room, RoomMember } from '$types/matrix-sdk';
import { useMembership } from './useMembership';

describe('useMembership', () => {
  it('uses a member that arrives after the profile opens', () => {
    let member: RoomMember | undefined;
    const memberEvents = new EventEmitter();
    const room = {
      roomId: '!room:example.org',
      getMember: () => member,
    } as unknown as Room;

    const { result, rerender } = renderHook(() => useMembership(room, '@alice:example.org'));
    expect(result.current).toBe(KnownMembership.Leave);

    member = Object.assign(memberEvents, { membership: KnownMembership.Join }) as RoomMember;
    rerender();

    expect(result.current).toBe(KnownMembership.Join);
  });

  it('does not retain membership when switching users', () => {
    const memberEvents = new EventEmitter();
    const members = new Map<string, RoomMember>([
      [
        '@alice:example.org',
        Object.assign(memberEvents, { membership: KnownMembership.Join }) as RoomMember,
      ],
    ]);
    const room = {
      roomId: '!room:example.org',
      getMember: (userId: string) => members.get(userId),
    } as unknown as Room;

    const { result, rerender } = renderHook(({ userId }) => useMembership(room, userId), {
      initialProps: { userId: '@alice:example.org' },
    });
    expect(result.current).toBe(KnownMembership.Join);

    rerender({ userId: '@bob:example.org' });

    expect(result.current).toBe(KnownMembership.Leave);
  });
});
