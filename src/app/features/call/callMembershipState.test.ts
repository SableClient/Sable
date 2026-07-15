import { describe, expect, it } from 'vitest';
import {
  getCallMembershipPresence,
  isCallActive,
  isIncomingCallActive,
  isOutgoingCallPending,
} from './callMembershipState';

const MY_USER_ID = '@self:example.org';

describe('callMembershipState', () => {
  it('detects incoming call when remote members exist without self', () => {
    const memberships = [{ userId: '@remote:example.org' }];

    expect(isIncomingCallActive(MY_USER_ID, memberships)).toBe(true);
    expect(isCallActive(MY_USER_ID, memberships)).toBe(false);
    expect(isOutgoingCallPending(MY_USER_ID, memberships)).toBe(false);
  });

  it('detects active call when self and remote members exist', () => {
    const memberships = [{ userId: MY_USER_ID }, { userId: '@remote:example.org' }];

    expect(isIncomingCallActive(MY_USER_ID, memberships)).toBe(false);
    expect(isCallActive(MY_USER_ID, memberships)).toBe(true);
    expect(isOutgoingCallPending(MY_USER_ID, memberships)).toBe(false);
  });

  it('detects pending outgoing call when only self is present', () => {
    const memberships = [{ userId: MY_USER_ID }];

    expect(getCallMembershipPresence(MY_USER_ID, memberships)).toEqual({
      hasSelfMember: true,
      remoteMemberCount: 0,
    });
    expect(isOutgoingCallPending(MY_USER_ID, memberships)).toBe(true);
  });
});
