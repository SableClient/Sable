import { describe, expect, it } from 'vitest';
import { getIncomingCallBlockers } from './getIncomingCallBlockers';

describe('getIncomingCallBlockers', () => {
  it('returns no blockers when all capabilities are available', () => {
    expect(
      getIncomingCallBlockers({
        canUseWebRTC: true,
        livekitSupported: true,
        hasCallMemberPermission: true,
        inAnotherCall: false,
      })
    ).toEqual([]);
  });

  it('returns blockers in priority order', () => {
    const issues = getIncomingCallBlockers({
      canUseWebRTC: false,
      livekitSupported: false,
      hasCallMemberPermission: false,
      inAnotherCall: true,
    });

    expect(issues.map((issue) => issue.id)).toEqual([
      'webrtc',
      'livekit',
      'permission',
      'another_call',
    ]);
  });
});
