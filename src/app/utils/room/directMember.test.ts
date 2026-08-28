import { describe, expect, it } from 'vitest';
import { isFunctionalMember, resolveDmOtherMember } from './directMember';

const me = { membership: 'join', userId: '@me:example.org' };
const alice = { membership: 'join', userId: '@alice:example.org' };
const bridge = { membership: 'join', userId: '@signal-service:example.org' };

describe('resolveDmOtherMember', () => {
  it('prefers the sole active m.direct member', () => {
    expect(
      resolveDmOtherMember({
        currentUserId: me.userId,
        directMembers: [alice],
        members: [me, alice, bridge],
        functionalMemberIds: [],
        fallbackMember: bridge,
      })
    ).toBe(alice);
  });

  it('excludes functional members from m.direct and membership fallbacks', () => {
    expect(
      resolveDmOtherMember({
        currentUserId: me.userId,
        directMembers: [bridge],
        members: [me, alice, bridge],
        functionalMemberIds: [bridge.userId],
        fallbackMember: bridge,
      })
    ).toBe(alice);
  });

  it('does not infer service membership from an MXID', () => {
    const alicebot = { membership: 'join', userId: '@alicebot:example.org' };

    expect(
      resolveDmOtherMember({
        currentUserId: me.userId,
        directMembers: [alicebot],
        members: [me, alicebot],
        functionalMemberIds: [],
      })
    ).toBe(alicebot);
  });
});

describe('isFunctionalMember', () => {
  it('can be reused by other member surfaces', () => {
    expect(isFunctionalMember(bridge, [bridge.userId])).toBe(true);
    expect(isFunctionalMember(alice, [bridge.userId])).toBe(false);
  });
});
