import { describe, expect, it } from 'vitest';
import { matrixRtcMembershipFixtures } from './matrixRtcMemberships';

describe('matrixRtcMembershipFixtures', () => {
  it('includes all baseline membership scenarios for call signaling tests', () => {
    expect(matrixRtcMembershipFixtures.noMembers).toHaveLength(0);
    expect(matrixRtcMembershipFixtures.remoteOnly).toHaveLength(1);
    expect(matrixRtcMembershipFixtures.selfOnly).toHaveLength(1);
    expect(matrixRtcMembershipFixtures.selfAndRemote).toHaveLength(2);
    expect(matrixRtcMembershipFixtures.staleSelfAfterActiveCall).toHaveLength(1);
  });
});
