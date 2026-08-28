import { describe, expect, it } from 'vitest';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';
import { getDmOtherMember } from './display';

const makeMember = (userId: string, membership: 'join' | 'invite'): RoomMember =>
  ({ userId, membership }) as RoomMember;

describe('getDmOtherMember', () => {
  it('resolves an invited direct-chat participant from m.direct', () => {
    const invitedMember = makeMember('@alice:example.org', 'invite');
    const room = {
      getMember: (userId: string) => (userId === invitedMember.userId ? invitedMember : undefined),
      getMembers: () => [invitedMember],
      getAvatarFallbackMember: () => undefined,
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({ getContent: () => ({ '@alice:example.org': [room.roomId] }) }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(invitedMember);
  });

  it('ignores missing m.direct members', () => {
    const counterpart = makeMember('@alice:example.org', 'join');
    const room = {
      getMember: (userId: string) => {
        if (userId === counterpart.userId) return counterpart;
        if (userId === '@missing:example.org') return null;
        return undefined;
      },
      getMembers: () => [counterpart],
      getAvatarFallbackMember: () => undefined,
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({
        getContent: () => ({
          [counterpart.userId]: [room.roomId],
          '@missing:example.org': [room.roomId],
        }),
      }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(counterpart);
  });

  it('uses the m.direct counterpart even when a bridge bot is also in the room', () => {
    const counterpart = makeMember('@alice:example.org', 'join');
    const room = {
      getMember: (userId: string) => (userId === counterpart.userId ? counterpart : undefined),
      getMembers: () => [counterpart],
      getAvatarFallbackMember: () => makeMember('@bridgebot:example.org', 'join'),
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({ getContent: () => ({ '@alice:example.org': [room.roomId] }) }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(counterpart);
  });

  it('does not select a functional member when it is listed in m.direct', () => {
    const counterpart = makeMember('@alice:example.org', 'join');
    const bridgeMember = makeMember('@signal-service:example.org', 'join');
    const room = {
      getAvatarFallbackMember: () => bridgeMember,
      getLiveTimeline: () => ({
        getState: () => ({
          getStateEvents: () => ({
            getContent: () => ({ service_members: [bridgeMember.userId] }),
          }),
        }),
      }),
      getMember: (userId: string) =>
        [counterpart, bridgeMember].find((member) => member.userId === userId),
      getMembers: () => [makeMember('@me:example.org', 'join'), counterpart, bridgeMember],
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({ getContent: () => ({ [bridgeMember.userId]: [room.roomId] }) }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(counterpart);
  });

  it('selects a direct-chat participant whose MXID ends in bot', () => {
    const counterpart = makeMember('@alicebot:example.org', 'join');
    const room = {
      getAvatarFallbackMember: () => counterpart,
      getMember: (userId: string) => (userId === counterpart.userId ? counterpart : undefined),
      getMembers: () => [counterpart],
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({
        getContent: () => ({
          [counterpart.userId]: [room.roomId],
        }),
      }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(counterpart);
  });

  it('does not select a functional bridge member from m.direct', () => {
    const counterpart = makeMember('@alice:example.org', 'join');
    const bridgeMember = makeMember('@service:example.org', 'join');
    const room = {
      getAvatarFallbackMember: () => bridgeMember,
      getLiveTimeline: () => ({
        getState: () => ({
          getStateEvents: () => ({
            getContent: () => ({ service_members: [bridgeMember.userId] }),
          }),
        }),
      }),
      getMember: (userId: string) =>
        [counterpart, bridgeMember].find((member) => member.userId === userId),
      getMembers: () => [makeMember('@me:example.org', 'join'), counterpart, bridgeMember],
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({ getContent: () => ({ '@service:example.org': [room.roomId] }) }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(counterpart);
  });

  it('ignores a functional members event whose service_members is not an array', () => {
    const counterpart = makeMember('@alice:example.org', 'join');
    const bridgeMember = makeMember('@signal-service:example.org', 'join');
    const room = {
      getAvatarFallbackMember: () => bridgeMember,
      getLiveTimeline: () => ({
        getState: () => ({
          getStateEvents: () => ({
            getContent: () => ({ service_members: counterpart.userId }),
          }),
        }),
      }),
      getMember: (userId: string) =>
        [counterpart, bridgeMember].find((member) => member.userId === userId),
      getMembers: () => [makeMember('@me:example.org', 'join'), counterpart, bridgeMember],
      roomId: '!dm:example.org',
    } as unknown as Room;
    const mx = {
      getAccountData: () => ({ getContent: () => ({ [counterpart.userId]: [room.roomId] }) }),
      getUserId: () => '@me:example.org',
    } as unknown as MatrixClient;

    expect(getDmOtherMember(mx, room)).toBe(counterpart);
  });
});
