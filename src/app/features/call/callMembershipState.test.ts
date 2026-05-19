import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatrixRTCSession } from '$types/matrix-sdk';
import {
  getCallMembershipPresence,
  isCallActive,
  isIncomingCallActive,
  isOutgoingCallPending,
  type SessionDescription,
} from './callMembershipState';

const MY_USER_ID = '@self:example.org';
const SESSION_DESCRIPTION = {} as SessionDescription;
const room = { roomId: '!room:example.org' } as Parameters<
  typeof MatrixRTCSession.sessionMembershipsForRoom
>[0];

describe('callMembershipState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects incoming call when remote members exist without self', () => {
    vi.spyOn(MatrixRTCSession, 'sessionMembershipsForRoom').mockReturnValue([
      { userId: '@remote:example.org' },
    ] as never);

    expect(isIncomingCallActive(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(true);
    expect(isCallActive(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(false);
    expect(isOutgoingCallPending(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(false);
  });

  it('detects active call when self and remote members exist', () => {
    vi.spyOn(MatrixRTCSession, 'sessionMembershipsForRoom').mockReturnValue([
      { userId: MY_USER_ID },
      { userId: '@remote:example.org' },
    ] as never);

    expect(isIncomingCallActive(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(false);
    expect(isCallActive(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(true);
    expect(isOutgoingCallPending(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(false);
  });

  it('detects pending outgoing call when only self is present', () => {
    vi.spyOn(MatrixRTCSession, 'sessionMembershipsForRoom').mockReturnValue([
      { userId: MY_USER_ID },
    ] as never);

    expect(getCallMembershipPresence(MY_USER_ID, room, SESSION_DESCRIPTION)).toEqual({
      hasSelfMember: true,
      remoteMemberCount: 0,
    });
    expect(isOutgoingCallPending(MY_USER_ID, room, SESSION_DESCRIPTION)).toBe(true);
  });
});
