import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '$state/sessions';
import { ACTIVE_SESSION_KEY, MATRIX_SESSIONS_KEY } from '$state/sessions';
import { ownsActiveMediaSession } from './initMatrix';

const alice = { userId: '@alice:example.org' } as Session;
const bob = { userId: '@bob:example.org' } as Session;

describe('ownsActiveMediaSession', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify([alice, bob]));
  });

  it('keeps Alice media session while logging out secondary Bob', () => {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(alice.userId));

    expect(ownsActiveMediaSession(bob)).toBe(false);
  });

  it('clears the active account media session', () => {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(alice.userId));

    expect(ownsActiveMediaSession(alice)).toBe(true);
  });
});
