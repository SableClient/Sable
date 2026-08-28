import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import type { Session } from './sessions';
import { MATRIX_SESSIONS_KEY, sessionsAtom, updateSessionTokens } from './sessions';

const baseSession: Session = {
  baseUrl: 'https://hs.example',
  userId: '@alice:hs.example',
  deviceId: 'DEV1',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresInMs: 100,
  oidc: { issuer: 'https://issuer.example', clientId: 'client-1' },
};

const readSessions = (): Session[] => JSON.parse(localStorage.getItem(MATRIX_SESSIONS_KEY) ?? '[]');

describe('updateSessionTokens', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('replaces tokens for the matching session only', () => {
    const other: Session = { ...baseSession, userId: '@bob:hs.example', accessToken: 'bob-access' };
    localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify([baseSession, other]));

    updateSessionTokens('@alice:hs.example', {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresInMs: 500,
    });

    const [alice, bob] = readSessions();
    expect(alice!.accessToken).toBe('new-access');
    expect(alice!.refreshToken).toBe('new-refresh');
    expect(alice!.expiresInMs).toBe(500);
    expect(alice!.oidc?.clientId).toBe('client-1');
    expect(bob!.accessToken).toBe('bob-access');
  });

  it('keeps the previous refresh token when the refresh response omits a new one', () => {
    localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify([baseSession]));

    updateSessionTokens('@alice:hs.example', { accessToken: 'new-access' });

    const [alice] = readSessions();
    expect(alice!.accessToken).toBe('new-access');
    expect(alice!.refreshToken).toBe('old-refresh');
  });

  it('is a no-op when the user has no stored session', () => {
    localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify([baseSession]));

    updateSessionTokens('@nobody:hs.example', { accessToken: 'x' });

    expect(readSessions()).toHaveLength(1);
    expect(readSessions()[0]!.accessToken).toBe('old-access');
  });
});

describe("sessionsAtom 'UPDATE' action", () => {
  it('merges a field change without clobbering freshly rotated tokens', () => {
    const store = createStore();
    store.set(sessionsAtom, { type: 'PUT', session: baseSession });

    // A background refresh rotated the tokens into the atom.
    store.set(sessionsAtom, {
      type: 'UPDATE',
      userId: baseSession.userId,
      patch: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' },
    });

    // A later settings change must preserve the rotated tokens.
    store.set(sessionsAtom, {
      type: 'UPDATE',
      userId: baseSession.userId,
      patch: { slidingSyncOptIn: true },
    });

    const session = store.get(sessionsAtom).find((s) => s.userId === baseSession.userId);
    expect(session?.accessToken).toBe('rotated-access');
    expect(session?.refreshToken).toBe('rotated-refresh');
    expect(session?.slidingSyncOptIn).toBe(true);
  });
});
