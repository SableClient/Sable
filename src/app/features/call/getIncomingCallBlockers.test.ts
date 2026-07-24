import { describe, expect, it } from 'vitest';
import { getIncomingCallBlockers } from './getIncomingCallBlockers';

describe('getIncomingCallBlockers', () => {
  it('returns no blockers when all capabilities are available', () => {
    expect(
      getIncomingCallBlockers({
        canUseWebRTC: true,
        hasCallMemberPermission: true,
        inAnotherCall: false,
      })
    ).toEqual([]);
  });

  it('returns blockers in priority order', () => {
    const issues = getIncomingCallBlockers({
      canUseWebRTC: false,
      hasCallMemberPermission: false,
      inAnotherCall: true,
    });

    expect(issues.map((issue) => issue.id)).toEqual(['webrtc', 'permission', 'another_call']);
  });
});
