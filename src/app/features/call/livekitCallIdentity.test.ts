import { describe, expect, it } from 'vitest';
import type { CallMembership } from '$types/matrix-sdk';
import { buildRtcIdentityMap } from './livekitCallIdentity';

const membership = (rtcBackendIdentity: string, userId?: string, deviceId?: string) =>
  ({
    rtcBackendIdentity,
    userId,
    deviceId,
    memberId: userId && deviceId ? `${userId}:${deviceId}` : rtcBackendIdentity,
  }) as CallMembership;

describe('buildRtcIdentityMap', () => {
  it('maps each anonymised LiveKit identity back to its Matrix user', () => {
    const identities = buildRtcIdentityMap([
      membership('sha256-alice', '@alice:example.org'),
      membership('sha256-bob', '@bob:example.org'),
    ]);

    expect(identities.get('sha256-alice')).toBe('@alice:example.org');
    expect(identities.get('sha256-bob')).toBe('@bob:example.org');
  });

  it('skips memberships with no sender rather than mapping them to undefined', () => {
    const identities = buildRtcIdentityMap([
      membership('sha256-alice', '@alice:example.org'),
      membership('sha256-orphan'),
    ]);

    expect(identities.has('sha256-orphan')).toBe(false);
    expect(identities.size).toBe(1);
  });

  it('returns an empty map before any membership is known', () => {
    expect(buildRtcIdentityMap([]).size).toBe(0);
  });

  it('also indexes the legacy user:device identity the SFU may report instead', () => {
    const identities = buildRtcIdentityMap([
      membership('sha256-alice', '@alice:example.org', 'DEVICE'),
    ]);

    expect(identities.get('sha256-alice')).toBe('@alice:example.org');
    expect(identities.get('@alice:example.org:DEVICE')).toBe('@alice:example.org');
  });
});
