import { describe, expect, it } from 'vitest';
import { readPersistedSession } from './sw-session-persistence';

describe('readPersistedSession', () => {
  it('keeps older persisted sessions instead of expiring them after one minute', () => {
    const persistedAt = Date.now() - 1000 * 60 * 60 * 6;

    expect(
      readPersistedSession({
        accessToken: 'token',
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        persistedAt,
      })
    ).toEqual({
      accessToken: 'token',
      baseUrl: 'https://matrix.example.org',
      userId: '@alice:example.org',
      persistedAt,
    });
  });
});
