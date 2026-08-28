import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientEvent, MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
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
  claimCryptoStore,
  getCryptoStoreOwner,
  installSlidingSyncRequestPatch,
  newSlidingSyncConnId,
  ownsActiveMediaSession,
  recheckKeyBackupAfterInitialSync,
  releaseCryptoStore,
  resolvePollTimeoutMs,
  supportsSlidingSync,
} from './initMatrix';

describe('installSlidingSyncRequestPatch', () => {
  it('invalidates device lists once per pos-less run, not once per request', async () => {
    const markAllTrackedUsersAsDirty = vi.fn<() => Promise<void>>(async () => undefined);
    const crypto = { markAllTrackedUsersAsDirty };
    let pos: string | undefined;
    const original = vi.fn<() => Promise<never>>(async () => ({ pos }) as never);
    const mx = {
      slidingSync: original,
      getRoom: () => undefined,
      getCrypto: () => crypto,
    } as unknown as MatrixClient;
    const manager = {
      isPaused: () => false,
      getActiveRoomSubscriptionIds: () => new Set<string>(),
      trackSubscriptionRequest: () => () => undefined,
      sanitizeOptimisticJoinResponse: () => undefined,
    };

    installSlidingSyncRequestPatch(mx, manager as never);
    const sync = (requestPos?: string) =>
      mx.slidingSync({ extensions: {}, pos: requestPos } as never, '', undefined);

    await sync(undefined);
    await crypto.markAllTrackedUsersAsDirty();
    await sync(undefined);
    await crypto.markAllTrackedUsersAsDirty();
    expect(markAllTrackedUsersAsDirty).toHaveBeenCalledTimes(1);

    pos = 'p1';
    await sync(undefined);
    pos = undefined;
    await sync('p1');
    await crypto.markAllTrackedUsersAsDirty();
    expect(markAllTrackedUsersAsDirty).toHaveBeenCalledTimes(2);
  });

  it('normalizes expanded timelines before returning the response to the SDK', async () => {
    const response = {
      rooms: {
        '!room:example.org': {
          expanded_timeline: true,
          timeline: [{ event_id: '$old:example.org' }],
          prev_batch: 'back-token',
        },
      },
    };
    const original = vi.fn<() => Promise<typeof response>>(async () => response);
    const sanitizeOptimisticJoinResponse = vi.fn<(prepared: typeof response) => void>(
      (prepared) => {
        expect(prepared.rooms['!room:example.org']).toMatchObject({ limited: true });
      }
    );
    const trackResponse = vi.fn<() => void>();
    const trackSubscriptionRequest = vi.fn<() => typeof trackResponse>(() => trackResponse);
    const mx = {
      slidingSync: original,
      getRoom: () => undefined,
    } as unknown as MatrixClient;
    const manager = {
      isPaused: () => false,
      getActiveRoomSubscriptionIds: () => new Set<string>(),
      trackSubscriptionRequest,
      sanitizeOptimisticJoinResponse,
    };

    installSlidingSyncRequestPatch(mx, manager as never);
    const prepared = await mx.slidingSync(
      { extensions: {}, room_subscriptions: { '!room:example.org': {} } } as never,
      '',
      undefined
    );

    expect(prepared.rooms['!room:example.org']).toMatchObject({ limited: true });
    expect(trackSubscriptionRequest).toHaveBeenCalledWith(new Set(['!room:example.org']));
    expect(trackResponse).toHaveBeenCalledWith(response);
    expect(sanitizeOptimisticJoinResponse).toHaveBeenCalledWith(prepared);
  });

  it('normalizes an unflagged expansion before returning it to the SDK', async () => {
    const response = {
      rooms: {
        '!room:example.org': {
          timeline: [{ event_id: '$old:example.org' }, { event_id: '$known:example.org' }],
          prev_batch: 'back-token',
        },
      },
    };
    const original = vi.fn<() => Promise<typeof response>>(async () => response);
    const liveTimeline = {
      getEvents: () => [{ getId: () => '$known:example.org' }],
    };
    const mx = {
      slidingSync: original,
      getRoom: () => ({
        getLiveTimeline: () => liveTimeline,
        getUnfilteredTimelineSet: () => ({ getLiveTimeline: () => liveTimeline }),
      }),
    } as unknown as MatrixClient;
    const manager = {
      isPaused: () => false,
      getActiveRoomSubscriptionIds: () => new Set<string>(),
      trackSubscriptionRequest: vi.fn<() => () => void>(() => () => {}),
      sanitizeOptimisticJoinResponse: vi.fn<() => void>(),
    };

    installSlidingSyncRequestPatch(mx, manager as never);
    const prepared = await mx.slidingSync({ extensions: {} } as never, '', undefined);

    expect(prepared.rooms['!room:example.org']).toMatchObject({ limited: true });
  });

  it('resets a gapped room before returning the response to the SDK', async () => {
    const response = {
      rooms: {
        '!room:example.org': {
          timeline: [{ event_id: '$new:example.org' }],
          limited: true,
          prev_batch: 'back-token',
        },
      },
    };
    const resetLiveTimeline = vi.fn<() => void>();
    const resetRoomTimeline = vi.fn<() => void>();
    const resetNotifTimelineSet = vi.fn<() => void>();
    const original = vi.fn<() => Promise<typeof response>>(async () => response);
    const liveTimeline = {
      getEvents: () => [{ getId: () => '$old:example.org', isSending: () => false }],
      getState: () => ({}),
    };
    const mx = {
      slidingSync: original,
      getRoom: () => ({
        oldState: {},
        currentState: {},
        emit: vi.fn<() => void>(),
        getLiveTimeline: () => liveTimeline,
        getUnfilteredTimelineSet: () => ({
          getLiveTimeline: () => liveTimeline,
          resetLiveTimeline,
        }),
        clearLoadedMembersIfNeeded: () => Promise.resolve(),
        resetLiveTimeline: resetRoomTimeline,
      }),
      resetNotifTimelineSet,
    } as unknown as MatrixClient;
    const manager = {
      isPaused: () => false,
      getActiveRoomSubscriptionIds: () => new Set<string>(),
      trackSubscriptionRequest: vi.fn<() => () => void>(() => () => {}),
      sanitizeOptimisticJoinResponse: vi.fn<() => void>(),
    };

    installSlidingSyncRequestPatch(mx, manager as never);
    await mx.slidingSync({ extensions: {} } as never, '', undefined);

    expect(resetLiveTimeline).toHaveBeenCalledWith('back-token');
    expect(resetRoomTimeline).not.toHaveBeenCalled();
    expect(resetNotifTimelineSet).toHaveBeenCalledOnce();
  });
});

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

const makeKeyBackupMx = (syncState: SyncState | null) => {
  const checkKeyBackupAndEnable = vi.fn<() => Promise<null>>().mockResolvedValue(null);
  const listeners = new Set<(state: SyncState) => void>();
  const mx = {
    getSyncState: () => syncState,
    getCrypto: () => ({ checkKeyBackupAndEnable }),
    on: (_event: ClientEvent, cb: (state: SyncState) => void) => listeners.add(cb),
    removeListener: (_event: ClientEvent, cb: (state: SyncState) => void) => listeners.delete(cb),
  } as unknown as MatrixClient;

  const emitSync = (state: SyncState) => {
    listeners.forEach((cb) => cb(state));
  };

  return { mx, checkKeyBackupAndEnable, emitSync, listeners };
};

describe('recheckKeyBackupAfterInitialSync', () => {
  it('re-checks key backup once the first sync completes', () => {
    const { mx, checkKeyBackupAndEnable, emitSync } = makeKeyBackupMx(null);

    recheckKeyBackupAfterInitialSync(mx);
    expect(checkKeyBackupAndEnable).not.toHaveBeenCalled();

    emitSync(SyncState.Prepared);

    expect(checkKeyBackupAndEnable).toHaveBeenCalledTimes(1);
  });

  it('re-checks immediately when the client has already synced', () => {
    const { mx, checkKeyBackupAndEnable } = makeKeyBackupMx(SyncState.Syncing);

    recheckKeyBackupAfterInitialSync(mx);

    expect(checkKeyBackupAndEnable).toHaveBeenCalledTimes(1);
  });

  it('re-checks only once and stops listening', () => {
    const { mx, checkKeyBackupAndEnable, emitSync, listeners } = makeKeyBackupMx(null);

    recheckKeyBackupAfterInitialSync(mx);
    emitSync(SyncState.Prepared);
    emitSync(SyncState.Syncing);

    expect(checkKeyBackupAndEnable).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('waits for a usable sync state', () => {
    const { mx, checkKeyBackupAndEnable, emitSync } = makeKeyBackupMx(null);

    recheckKeyBackupAfterInitialSync(mx);
    emitSync(SyncState.Reconnecting);
    emitSync(SyncState.Error);

    expect(checkKeyBackupAndEnable).not.toHaveBeenCalled();
  });
});

describe('crypto store ownership', () => {
  const clientA = { id: 'a' } as unknown as MatrixClient;
  const clientB = { id: 'b' } as unknown as MatrixClient;
  const storeKey = 'sync@alice:example.org';

  beforeEach(() => {
    releaseCryptoStore(clientA);
    releaseCryptoStore(clientB);
  });

  it('reports the client currently holding the store', () => {
    claimCryptoStore(clientA, storeKey);

    expect(getCryptoStoreOwner(storeKey)).toBe(clientA);
  });

  it('reports no owner once the holder releases it', () => {
    claimCryptoStore(clientA, storeKey);
    releaseCryptoStore(clientA);

    expect(getCryptoStoreOwner(storeKey)).toBeUndefined();
  });

  it('keeps the new owner when a superseded client is released afterwards', () => {
    claimCryptoStore(clientA, storeKey);
    claimCryptoStore(clientB, storeKey);

    // Otherwise the next init sees a free store and opens a second OlmMachine.
    releaseCryptoStore(clientA);

    expect(getCryptoStoreOwner(storeKey)).toBe(clientB);
  });

  it('ignores a release from a client that never claimed a store', () => {
    claimCryptoStore(clientA, storeKey);
    releaseCryptoStore(clientB);

    expect(getCryptoStoreOwner(storeKey)).toBe(clientA);
  });
});
