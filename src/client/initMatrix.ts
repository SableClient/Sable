import type {
  CryptoCallbacks,
  MatrixClient,
  MSC3575SlidingSyncRequest,
  MSC3575SlidingSyncResponse,
} from '$types/matrix-sdk';
import {
  ClientEvent,
  createClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  KnownMembership,
  SyncState,
} from '$types/matrix-sdk';
import { fetch } from '$utils/fetch';
import { matrixFetch } from './matrixFetch';
import { clearMediaCache } from '$utils/mediaCache';

import { clearNavToActivePathStore } from '$state/navToActivePath';
import type { Session, Sessions, SessionStoreName } from '$state/sessions';
import {
  ACTIVE_SESSION_KEY,
  getSessionStoreName,
  getStoredSessionRefreshToken,
  MATRIX_SESSIONS_KEY,
} from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import { isMobileTauri } from '$utils/platform';
import * as Sentry from '@sentry/react';
import { pushSessionToSW } from '../sw-session';
import { assertAuthMetadataIssuer, createSessionTokenRefresher } from './oidcTokenRefresher';
import { revokeOAuthToken } from './oauthTokenRevocation';
import { clearSecretStorageKeys, cryptoCallbacks } from './secretStorageKeys';
import type { SlidingSyncDiagnostics } from './slidingSync';
import {
  prepareSlidingSyncTimelines,
  scopeTypingExtension,
  SlidingSyncManager,
} from './slidingSync';
import { PresenceSyncManager } from './presenceSync';
import { SlidingSyncSidebarCache } from './slidingSyncSidebarCache';
import { disposeSyncStorePersistence, installSyncStorePersistence } from './syncStorePersistence';
import { clearCachedUserProfiles } from './userProfileCache';
import {
  clearLocalNotificationCache,
  destroyLocalNotificationCache,
} from './localNotificationCache';
import {
  primeVersionsFromCache,
  revalidateVersionsCache,
  clearCachedVersions,
  cacheVersionsFromClient,
  wasUnstableFeatureCached,
} from './versionsCache';

const log = createLogger('initMatrix');
const debugLog = createDebugLogger('initMatrix');
const slidingSyncByClient = new WeakMap<MatrixClient, SlidingSyncManager>();
const membershipActionCleanupByClient = new WeakMap<MatrixClient, () => void>();
const presenceSyncByClient = new WeakMap<MatrixClient, PresenceSyncManager>();

export const ownsActiveMediaSession = (session?: Session): boolean => {
  if (!session) return true;
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const activeSessionId = getLocalStorageItem<string | undefined>(ACTIVE_SESSION_KEY, undefined);
  const activeSession = sessions.find((item) => item.userId === activeSessionId) ?? sessions[0];
  return activeSession?.userId === session.userId;
};
const presenceStartCleanupByClient = new WeakMap<MatrixClient, () => void>();
const SLIDING_SYNC_POLL_TIMEOUT_MS = 45000;
const SLIDING_SYNC_POLL_TIMEOUT_MOBILE_MS = 30000;

/** Shorter poll on mobile: a wedged long-poll costs more when the OS freezes the webview. */
export const resolvePollTimeoutMs = (configured?: number): number =>
  configured ??
  (isMobileTauri() ? SLIDING_SYNC_POLL_TIMEOUT_MOBILE_MS : SLIDING_SYNC_POLL_TIMEOUT_MS);

const isInitialSyncReady = (state: string | null): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup;

const startPresenceAfterInitialSync = (
  mx: MatrixClient,
  manager: PresenceSyncManager
): (() => void) => {
  let started = false;
  let startTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const start = () => {
    if (started) return;
    started = true;
    presenceStartCleanupByClient.delete(mx);
    mx.removeListener(ClientEvent.Sync, onSync);
    manager.start();
  };

  const scheduleStart = () => {
    if (startTimer !== undefined) return;
    startTimer = globalThis.setTimeout(() => {
      startTimer = undefined;
      start();
    }, 0);
  };

  const onSync = (state: SyncState) => {
    if (isInitialSyncReady(state)) scheduleStart();
  };

  if (isInitialSyncReady(mx.getSyncState())) scheduleStart();
  else mx.on(ClientEvent.Sync, onSync);

  const cleanup = () => {
    if (startTimer !== undefined) globalThis.clearTimeout(startTimer);
    mx.removeListener(ClientEvent.Sync, onSync);
    presenceStartCleanupByClient.delete(mx);
  };
  presenceStartCleanupByClient.set(mx, cleanup);
  return cleanup;
};

type StartupPhase = 'sync_store' | 'rust_crypto' | 'client_init' | 'client_start';

const measureStartupPhase = async <T>(
  phase: StartupPhase,
  task: () => Promise<T>,
  attributes?: Record<string, string>
): Promise<T> => {
  const startTime = performance.now();
  try {
    const result = await task();
    Sentry.metrics.distribution('sable.startup.phase_ms', performance.now() - startTime, {
      attributes: { phase, outcome: 'success', ...attributes },
    });
    return result;
  } catch (error) {
    Sentry.metrics.distribution('sable.startup.phase_ms', performance.now() - startTime, {
      attributes: { phase, outcome: 'error', ...attributes },
    });
    throw error;
  }
};

const slidingSyncRequestCleanupByClient = new WeakMap<MatrixClient, () => void>();

type SlidingSyncMethod = (
  reqBody: MSC3575SlidingSyncRequest,
  baseUrl?: string,
  abortSignal?: AbortSignal
) => Promise<MSC3575SlidingSyncResponse>;

type MatrixClientWithWritableSlidingSync = MatrixClient & {
  slidingSync: SlidingSyncMethod;
};

type SlidingSyncRequestWithConnId = MSC3575SlidingSyncRequest & {
  conn_id?: string;
};

// Synapse keys connection state on (user, device, conn_id) and keeps only the two
// latest positions, so two clients sharing an id invalidate each other's `pos`.
export const newSlidingSyncConnId = (): string =>
  `sable-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export function installSlidingSyncRequestPatch(
  mx: MatrixClient,
  manager: SlidingSyncManager
): void {
  slidingSyncRequestCleanupByClient.get(mx)?.();

  const connId = newSlidingSyncConnId();
  const mxWritable = mx as MatrixClientWithWritableSlidingSync;
  const original = mx.slidingSync.bind(mx) as SlidingSyncMethod;
  mxWritable.slidingSync = async (reqBody, baseUrl, abortSignal) => {
    const req = reqBody as SlidingSyncRequestWithConnId;
    const subscribedRoomIds = new Set(Object.keys(req.room_subscriptions ?? {}));
    const trackResponse = manager.trackSubscriptionRequest(subscribedRoomIds);

    // AbortError makes the SDK loop `continue` and reissue at the same `pos`, no sleep.
    if (manager.isPaused()) {
      await manager.waitForResume();
      const aborted = new Error('Sliding sync paused while backgrounded');
      aborted.name = 'AbortError';
      throw aborted;
    }

    if (req.conn_id === undefined) {
      req.conn_id = connId;
    }

    const roomIds = manager.getActiveRoomSubscriptionIds();
    scopeTypingExtension(req.extensions, roomIds);

    const response = await original(reqBody, baseUrl, abortSignal);
    trackResponse(response);
    // Must run before the SDK processes the response. A throw would reach the SDK's
    // loop, which drops the response and retries the same `pos` forever.
    try {
      const completeTimelineReset = prepareSlidingSyncTimelines(response, mx, subscribedRoomIds);
      if (completeTimelineReset) {
        manager.trackTimelineResetCompletion(response, completeTimelineReset);
      }
      manager.sanitizeOptimisticJoinResponse(response);
    } catch (error) {
      Sentry.captureException(error, { tags: { area: 'sliding_sync_response' } });
      debugLog.error('sync', 'Failed to prepare sliding sync response', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return response;
  };

  slidingSyncRequestCleanupByClient.set(mx, () => {
    slidingSyncRequestCleanupByClient.delete(mx);
    mxWritable.slidingSync = original;
  });
}

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.addEventListener('success', () => resolve());
    req.addEventListener('error', () => resolve()); // resolve anyway — we tried
    req.addEventListener('blocked', () => resolve());
  });

const deleteSessionStores = async (storeName: SessionStoreName): Promise<void> => {
  await Promise.all([
    deleteDatabase(storeName.sync),
    deleteDatabase(storeName.crypto),
    deleteDatabase(`${storeName.rustCryptoPrefix}::matrix-sdk-crypto`),
  ]);
};

const isMismatch = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("doesn't match") ||
    msg.includes('does not match') ||
    msg.includes('account in the store') ||
    msg.includes('account in the constructor')
  );
};

type BuiltClient = {
  mx: MatrixClient;
  indexedDBStore: IndexedDBStore;
};

const buildClient = async (session: Session): Promise<BuiltClient> => {
  const storeName = getSessionStoreName(session);

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: storeName.sync,
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, storeName.crypto);

  const tempClient = createClient({
    baseUrl: session.baseUrl,
    fetchFn: fetch,
  });
  const tokenRefresher = createSessionTokenRefresher(session, tempClient);

  const mx = createClient({
    baseUrl: session.baseUrl,
    fetchFn: matrixFetch,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as unknown as CryptoCallbacks,
    verificationMethods: ['m.sas.v1'],
    tokenRefreshFunction: tokenRefresher?.tokenRefreshFunction,
  });

  return { mx, indexedDBStore };
};

type ClientInitializationResult =
  | { ok: true; mx: MatrixClient }
  | { ok: false; error: unknown; phase: 'sync_store' | 'rust_crypto' };

const initializeClient = async (
  session: Session,
  cryptoDatabasePrefix: string
): Promise<ClientInitializationResult> => {
  let builtClient: BuiltClient;
  try {
    builtClient = await buildClient(session);
  } catch (error) {
    return { ok: false, error, phase: 'sync_store' };
  }
  const { mx, indexedDBStore } = builtClient;

  void primeVersionsFromCache(mx, session.baseUrl, session.userId).then((primed) => {
    if (primed) void revalidateVersionsCache(mx, session.baseUrl, session.userId);
    else void cacheVersionsFromClient(mx, session.baseUrl, session.userId);
  });

  const syncStorePromise = measureStartupPhase('sync_store', () => indexedDBStore.startup());
  const cryptoPromise = measureStartupPhase('rust_crypto', () =>
    mx.initRustCrypto({ cryptoDatabasePrefix })
  );
  const [syncStoreResult, cryptoResult] = await Promise.allSettled([
    syncStorePromise,
    cryptoPromise,
  ]);

  if (syncStoreResult.status === 'rejected') {
    mx.stopClient();
    return { ok: false, error: syncStoreResult.reason, phase: 'sync_store' };
  }
  if (cryptoResult.status === 'rejected') {
    mx.stopClient();
    return { ok: false, error: cryptoResult.reason, phase: 'rust_crypto' };
  }

  return { ok: true, mx };
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);
  debugLog.info('sync', 'Initializing Matrix client', {
    userId: session.userId,
    baseUrl: session.baseUrl,
  });

  const wipeAllStores = async () => {
    log.warn('initClient: wiping all stores for', session.userId);
    debugLog.warn('sync', 'Wiping all stores due to mismatch', {
      userId: session.userId,
    });
    Sentry.addBreadcrumb({
      category: 'crypto',
      message: 'Crypto store mismatch — wiping local stores and retrying',
      level: 'warning',
    });
    Sentry.metrics.count('sable.crypto.store_wipe', 1);
    await deleteSessionStores(storeName);
    try {
      const allDbs = await window.indexedDB.databases();
      await Promise.all(
        allDbs.map(async ({ name }) => {
          if (name && name.includes(session.userId)) {
            log.warn('initClient: also wiping db', name);
            await deleteDatabase(name);
          }
        })
      );
    } catch {
      // databases() not available in all browsers
    }
  };

  const initStartTime = performance.now();
  let initOutcome = 'success';
  try {
    const result = await initializeClient(session, storeName.rustCryptoPrefix);
    if (!result.ok) {
      if (!isMismatch(result.error)) {
        debugLog.error('sync', 'Failed to initialize client', {
          phase: result.phase,
          error: result.error,
        });
        throw result.error;
      }

      log.warn(`initClient: mismatch during ${result.phase} — wiping and reloading:`, result.error);
      debugLog.warn('sync', 'Client initialization mismatch - wiping stores and reloading', {
        phase: result.phase,
        error: result.error,
      });
      await wipeAllStores();
      window.location.reload();
      throw result.error;
    }

    result.mx.setMaxListeners(50);
    return result.mx;
  } catch (error) {
    initOutcome = 'error';
    throw error;
  } finally {
    Sentry.metrics.distribution('sable.startup.phase_ms', performance.now() - initStartTime, {
      attributes: { phase: 'client_init', outcome: initOutcome },
    });
  }
};

export type StartClientConfig = {
  baseUrl?: string;
  sessionSlidingSyncOptIn?: boolean;
  pollTimeoutMs?: number;
  timelineLimit?: number;
  initialRoomIds?: Iterable<string>;
  onCachedRoomsLoaded?: () => void;
};

export type ClientSyncDiagnostics = {
  transport: 'sliding' | 'classic';
  syncState: string | null;
  sliding?: SlidingSyncDiagnostics;
};

const SLIDING_SYNC_UNSTABLE_FEATURE = 'org.matrix.simplified_msc3575';

const SLIDING_SYNC_CAPABILITY_TIMEOUT_MS = 5000;

// The SDK retries an unsupported endpoint forever instead of erroring, so anything
// short of a confirmation falls back to classic sync. /versions has no timeout of
// its own, hence the race.
export const supportsSlidingSync = async (
  mx: MatrixClient,
  baseUrl: string
): Promise<{
  supported: boolean;
  reason: 'advertised' | 'unadvertised' | 'cached' | 'unknown';
}> => {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<boolean | undefined>((resolve) => {
    timer = globalThis.setTimeout(() => resolve(undefined), SLIDING_SYNC_CAPABILITY_TIMEOUT_MS);
  });

  let confirmed: boolean | undefined;
  try {
    confirmed = await Promise.race([
      mx.doesServerSupportUnstableFeature(SLIDING_SYNC_UNSTABLE_FEATURE),
      timeout,
    ]);
  } catch {
    confirmed = undefined;
  } finally {
    globalThis.clearTimeout(timer);
  }

  if (confirmed !== undefined) {
    return { supported: confirmed, reason: confirmed ? 'advertised' : 'unadvertised' };
  }
  // We never reached /versions, so a previous confirmation is all we have to go on.
  const cached = wasUnstableFeatureCached(
    baseUrl,
    mx.getSafeUserId(),
    SLIDING_SYNC_UNSTABLE_FEATURE
  );
  return { supported: cached, reason: cached ? 'cached' : 'unknown' };
};

const disposeSlidingSync = (mx: MatrixClient): void => {
  membershipActionCleanupByClient.get(mx)?.();
  const manager = slidingSyncByClient.get(mx);
  if (!manager) return;
  manager.dispose();
  slidingSyncByClient.delete(mx);
};

type MatrixClientWithWritableMembershipActions = MatrixClient & {
  joinRoom: MatrixClient['joinRoom'];
  leave: MatrixClient['leave'];
};

const installMembershipActionReconciliation = (
  mx: MatrixClient,
  manager: SlidingSyncManager
): void => {
  membershipActionCleanupByClient.get(mx)?.();

  const writableMx = mx as MatrixClientWithWritableMembershipActions;
  // Keep the exact methods so cleanup restores the client without leaving bound replacements behind.
  // oxlint-disable-next-line typescript/unbound-method
  const originalJoinRoom = mx.joinRoom;
  // oxlint-disable-next-line typescript/unbound-method
  const originalLeave = mx.leave;

  writableMx.joinRoom = async (...args) => {
    const room = await originalJoinRoom.apply(mx, args);
    manager.reconcileRoomMembership(room.roomId, KnownMembership.Join);
    return room;
  };
  writableMx.leave = async (...args) => {
    const result = await originalLeave.apply(mx, args);
    manager.reconcileRoomMembership(args[0], KnownMembership.Leave);
    return result;
  };

  membershipActionCleanupByClient.set(mx, () => {
    membershipActionCleanupByClient.delete(mx);
    writableMx.joinRoom = originalJoinRoom;
    writableMx.leave = originalLeave;
  });
};

const disposePresenceSync = (mx: MatrixClient): void => {
  presenceStartCleanupByClient.get(mx)?.();
  const manager = presenceSyncByClient.get(mx);
  if (!manager) return;
  manager.dispose();
  presenceSyncByClient.delete(mx);
};

export const getSlidingSyncManager = (mx: MatrixClient): SlidingSyncManager | undefined =>
  slidingSyncByClient.get(mx);

export const getPresenceSyncManager = (mx: MatrixClient): PresenceSyncManager | undefined =>
  presenceSyncByClient.get(mx);

export const startClient = async (mx: MatrixClient, config?: StartClientConfig): Promise<void> => {
  disposeSlidingSync(mx);
  disposePresenceSync(mx);

  const baseUrl = config?.baseUrl ?? mx.baseUrl;
  const optedIntoSliding = config?.sessionSlidingSyncOptIn === true;
  const slidingSupport = optedIntoSliding
    ? await supportsSlidingSync(mx, baseUrl)
    : { supported: false, reason: 'unadvertised' as const };
  const useSliding = optedIntoSliding && slidingSupport.supported;

  if (optedIntoSliding && !useSliding) {
    debugLog.warn('sync', 'Falling back to classic sync', {
      userId: mx.getUserId(),
      baseUrl,
      reason: slidingSupport.reason,
    });
    Sentry.metrics.count('sable.sync.transport_downgrade', 1, {
      attributes: { reason: slidingSupport.reason },
    });
  }

  debugLog.info('sync', 'Starting Matrix client', { userId: mx.getUserId() });

  let manager: SlidingSyncManager | undefined;

  if (useSliding) {
    const presenceManager = new PresenceSyncManager(mx);
    presenceSyncByClient.set(mx, presenceManager);
    startPresenceAfterInitialSync(mx, presenceManager);

    manager = new SlidingSyncManager(mx, baseUrl, {
      pollTimeoutMs: resolvePollTimeoutMs(config?.pollTimeoutMs),
      timelineLimit: config?.timelineLimit,
      initialRoomIds: config?.initialRoomIds,
    });

    installSlidingSyncRequestPatch(mx, manager);

    manager.attach();
    manager.prepareSidebarCacheHydration();
    installMembershipActionReconciliation(mx, manager);
    slidingSyncByClient.set(mx, manager);
  }

  try {
    await measureStartupPhase(
      'client_start',
      () =>
        mx.startClient({
          lazyLoadMembers: true,
          slidingSync: manager?.slidingSync,
          threadSupport: true,
        }),
      { transport: useSliding ? 'sliding' : 'classic' }
    );
    if (!useSliding) installSyncStorePersistence(mx);
    if (manager && (await manager.waitForSidebarCacheHydration())) {
      config?.onCachedRoomsLoaded?.();
    }
  } catch (err) {
    debugLog.error('network', 'Failed to start client with sliding sync', {
      error: err instanceof Error ? err.message : String(err),
      userId: mx.getUserId(),
      baseUrl: useSliding ? baseUrl : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    });
    slidingSyncRequestCleanupByClient.get(mx)?.();
    membershipActionCleanupByClient.get(mx)?.();
    disposeSlidingSync(mx);
    disposePresenceSync(mx);
    throw err;
  }
};

export const stopClient = (mx: MatrixClient): void => {
  log.log('stopClient', mx.getUserId());
  debugLog.info('sync', 'Stopping client', { userId: mx.getUserId() });
  slidingSyncRequestCleanupByClient.get(mx)?.();
  disposeSyncStorePersistence(mx);
  disposeSlidingSync(mx);
  disposePresenceSync(mx);
  mx.stopClient();
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  log.log('clearCacheAndReload', mx.getUserId());
  stopClient(mx);
  clearNavToActivePathStore(mx.getSafeUserId());
  SlidingSyncSidebarCache.clear(mx.getSafeUserId());
  clearCachedUserProfiles(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const getClientSyncDiagnostics = (mx: MatrixClient): ClientSyncDiagnostics => {
  const slidingManager = slidingSyncByClient.get(mx);
  return {
    transport: slidingManager ? 'sliding' : 'classic',
    syncState: mx.getSyncState(),
    sliding: slidingManager?.getDiagnostics(),
  };
};

const revokeOidcSession = async (mx: MatrixClient, session: Session): Promise<void> => {
  const oidc = session.oidc;
  if (!oidc) return;
  const metadata = await mx.getAuthMetadata();
  assertAuthMetadataIssuer(oidc.issuer, metadata);

  const refreshToken = getStoredSessionRefreshToken(session.userId) ?? session.refreshToken;
  const token = refreshToken ?? mx.getAccessToken() ?? undefined;
  if (!token) return;

  try {
    await revokeOAuthToken(
      metadata,
      oidc.clientId,
      token,
      refreshToken ? 'refresh_token' : 'access_token'
    );
  } catch {
    debugLog.warn('general', 'OIDC token revocation had failures', { userId: session.userId });
  }
};

/**
 * Logs out a Matrix client and cleans up its SDK stores + IndexedDB databases.
 * Does NOT touch the Jotai sessions atom — callers must do that themselves
 * so the correct Jotai Provider store is used.
 */
export const logoutClient = async (mx: MatrixClient, session?: Session) => {
  log.log('logoutClient', {
    userId: mx.getUserId(),
    sessionUserId: session?.userId,
  });
  debugLog.info('general', 'Logging out client', { userId: mx.getUserId() });
  stopClient(mx);
  try {
    if (session?.oidc) {
      await revokeOidcSession(mx, session);
    } else {
      await mx.logout();
    }
    debugLog.info('general', 'Logout successful', { userId: mx.getUserId() });
  } catch {
    // ignore
  }

  if (session) {
    SlidingSyncSidebarCache.clear(session.userId);
    clearCachedVersions(session.baseUrl, session.userId);
    clearCachedUserProfiles(session.userId);
    clearSecretStorageKeys();
    destroyLocalNotificationCache(session.userId);
    clearLocalNotificationCache(session.userId);
    const storeName: SessionStoreName = getSessionStoreName(session);
    await mx.clearStores({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
    await deleteDatabase(storeName.sync);
    await deleteDatabase(storeName.crypto);
    await deleteDatabase(`${storeName.rustCryptoPrefix}::matrix-sdk-crypto`);
  } else {
    await mx.clearStores();
    window.localStorage.clear();
  }

  try {
    await clearMediaCache();
  } finally {
    if (ownsActiveMediaSession(session)) {
      // Queue the final clear after any in-flight refresh.
      await pushSessionToSW();
    }
  }
};

export const clearLoginData = async () => {
  debugLog.info('general', 'Clearing all login data and reloading');
  const dbs = await window.indexedDB.databases();
  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) window.indexedDB.deleteDatabase(name);
  });
  window.localStorage.clear();
  await clearMediaCache();
  window.location.reload();
};
