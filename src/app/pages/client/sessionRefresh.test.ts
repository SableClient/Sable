import { describe, expect, it, vi } from 'vitest';
import { createSessionRefreshHandler } from './sessionRefresh';

describe('createSessionRefreshHandler', () => {
  it('updates the session that created the client, not whichever account is active later', () => {
    const setSessions = vi.fn();
    const pushSession = vi.fn();

    const handler = createSessionRefreshHandler(
      '@alice:example.org',
      () => ({
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        deviceId: 'ALICE',
        accessToken: 'alice-access',
        refreshToken: 'alice-refresh',
      }),
      setSessions,
      pushSession
    );

    handler('alice-access-2', 'alice-refresh-2');

    expect(setSessions).toHaveBeenCalledWith({
      type: 'PUT',
      session: {
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        deviceId: 'ALICE',
        accessToken: 'alice-access-2',
        refreshToken: 'alice-refresh-2',
      },
    });
    expect(pushSession).toHaveBeenCalledWith(
      'https://matrix.example.org',
      'alice-access-2',
      '@alice:example.org'
    );
  });

  it('merges refreshed tokens into the latest stored session fields', () => {
    const setSessions = vi.fn();
    const pushSession = vi.fn();

    const handler = createSessionRefreshHandler(
      '@alice:example.org',
      () => ({
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        deviceId: 'ALICE',
        accessToken: 'alice-access',
        refreshToken: 'alice-refresh',
        slidingSyncOptIn: true,
      }),
      setSessions,
      pushSession
    );

    handler('alice-access-2', 'alice-refresh-2');

    expect(setSessions).toHaveBeenCalledWith({
      type: 'PUT',
      session: {
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        deviceId: 'ALICE',
        accessToken: 'alice-access-2',
        refreshToken: 'alice-refresh-2',
        slidingSyncOptIn: true,
      },
    });
  });
});
