import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import type * as PlatformModule from '$utils/platform';
import { ACTIVE_SESSION_KEY, MATRIX_SESSIONS_KEY } from '$state/sessions';

const { isMobileTauri } = vi.hoisted(() => ({
  isMobileTauri: vi.fn<() => boolean>(),
}));

vi.mock('$utils/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof PlatformModule>()),
  isMobileTauri,
}));

import {
  newSlidingSyncConnId,
  ownsActiveMediaSession,
  resolvePollTimeoutMs,
  supportsSlidingSync,
} from './initMatrix';

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

describe('newSlidingSyncConnId', () => {
  it('gives every client instance its own id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSlidingSyncConnId()));

    expect(ids.size).toBe(50);
  });
});

describe('supportsSlidingSync', () => {
  const baseUrl = 'https://matrix.example.org';
  const versionsKey = `sable.versionsCache.${baseUrl}|${alice.userId}`;

  const makeMx = (
    doesServerSupportUnstableFeature: (feature: string) => Promise<boolean>
  ): MatrixClient =>
    ({
      doesServerSupportUnstableFeature,
      getSafeUserId: () => alice.userId,
    }) as unknown as MatrixClient;

  beforeEach(() => {
    localStorage.clear();
  });

  const cacheFeature = (supported: boolean) =>
    localStorage.setItem(
      versionsKey,
      JSON.stringify({
        versions: [],
        unstable_features: { 'org.matrix.simplified_msc3575': supported },
        fetchedAt: Date.now(),
      })
    );

  it('reports support when the homeserver advertises simplified sliding sync', async () => {
    const check = vi.fn<(feature: string) => Promise<boolean>>().mockResolvedValue(true);

    await expect(supportsSlidingSync(makeMx(check), baseUrl)).resolves.toEqual({
      supported: true,
      reason: 'advertised',
    });
    expect(check).toHaveBeenCalledWith('org.matrix.simplified_msc3575');
  });

  it('reports no support when the homeserver does not advertise it', async () => {
    await expect(
      supportsSlidingSync(
        makeMx(() => Promise.resolve(false)),
        baseUrl
      )
    ).resolves.toEqual({ supported: false, reason: 'unadvertised' });
  });

  // Classic sync still works; opting in against a server that cannot serve it does not.
  // The reason must stay distinguishable: we never established the server's answer.
  it('falls back to classic sync when the capability was never confirmed', async () => {
    await expect(
      supportsSlidingSync(
        makeMx(() => Promise.reject(new Error('offline'))),
        baseUrl
      )
    ).resolves.toEqual({ supported: false, reason: 'unknown' });
  });

  it('keeps sliding sync when a previously confirmed capability is cached', async () => {
    cacheFeature(true);

    await expect(
      supportsSlidingSync(
        makeMx(() => Promise.reject(new Error('offline'))),
        baseUrl
      )
    ).resolves.toEqual({ supported: true, reason: 'cached' });
  });

  it('does not resurrect sliding sync from a cached negative', async () => {
    cacheFeature(false);

    await expect(
      supportsSlidingSync(
        makeMx(() => Promise.reject(new Error('offline'))),
        baseUrl
      )
    ).resolves.toEqual({ supported: false, reason: 'unknown' });
  });
});

describe('resolvePollTimeoutMs', () => {
  beforeEach(() => {
    isMobileTauri.mockReset();
  });

  it('uses the shorter poll on mobile tauri', () => {
    isMobileTauri.mockReturnValue(true);

    expect(resolvePollTimeoutMs(undefined)).toBe(30000);
  });

  it('uses the default poll elsewhere', () => {
    isMobileTauri.mockReturnValue(false);

    expect(resolvePollTimeoutMs(undefined)).toBe(45000);
  });

  it('prefers an explicitly configured timeout on mobile', () => {
    isMobileTauri.mockReturnValue(true);

    expect(resolvePollTimeoutMs(5000)).toBe(5000);
  });
});
