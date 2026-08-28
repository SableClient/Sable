import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: (): boolean => true }));

const updateTauriMediaSession = vi.fn<
  (baseUrl?: string, accessToken?: string, userId?: string) => Promise<void>
>(() => Promise.resolve());
vi.mock('./app/utils/tauriMediaAuth', () => ({
  updateTauriMediaSession: (baseUrl?: string, accessToken?: string, userId?: string) =>
    updateTauriMediaSession(baseUrl, accessToken, userId),
}));

import { MATRIX_SESSIONS_KEY, updateSessionTokens, type Session } from './app/state/sessions';
import { pushPersistedSessionToSW } from './sw-session';

const baseSession: Session = {
  baseUrl: 'https://hs.example',
  userId: '@alice:hs.example',
  deviceId: 'DEV1',
  accessToken: 'stale-token',
  refreshToken: 'refresh-1',
};

describe('pushPersistedSessionToSW', () => {
  beforeEach(() => {
    localStorage.clear();
    updateTauriMediaSession.mockClear();
  });

  it('pushes the refreshed persisted token, not the captured stale one', async () => {
    localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify([baseSession]));

    // initClient's refresh writes only the persisted session before the post-init push.
    updateSessionTokens(baseSession.userId, {
      accessToken: 'fresh-token',
      refreshToken: 'refresh-2',
    });

    await pushPersistedSessionToSW(baseSession);

    expect(updateTauriMediaSession).toHaveBeenCalledWith(
      baseSession.baseUrl,
      'fresh-token',
      baseSession.userId
    );
  });

  it('falls back to the given session when nothing is persisted', async () => {
    await pushPersistedSessionToSW(baseSession);

    expect(updateTauriMediaSession).toHaveBeenCalledWith(
      baseSession.baseUrl,
      baseSession.accessToken,
      baseSession.userId
    );
  });
});
