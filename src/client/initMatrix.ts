import {
  ClientEvent,
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  SyncState,
  ISyncStateData,
} from '$types/matrix-sdk';

import { clearNavToActivePathStore } from '$state/navToActivePath';
import {
  Session,
  Sessions,
  SessionStoreName,
  getSessionStoreName,
  MATRIX_SESSIONS_KEY,
} from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import * as Sentry from '@sentry/react';
import { pushSessionToSW } from '../sw-session';
import { cryptoCallbacks } from './secretStorageKeys';
import { SlidingSyncConfig, SlidingSyncDiagnostics, SlidingSyncManager } from './slidingSync';

const log = createLogger('initMatrix');
const debugLog = createDebugLogger('initMatrix');
const slidingSyncByClient = new WeakMap<MatrixClient, SlidingSyncManager>();
const classicSyncObserverByClient = new WeakMap<
  MatrixClient,
  (state: SyncState, prevState: SyncState | null, data?: ISyncStateData) => void
>();
const FAST_SYNC_POLL_TIMEOUT_MS = 10000;
const SLIDING_SYNC_POLL_TIMEOUT_MS = 20000;
type SyncTransport = 'classic' | 'sliding';
type SyncTransportReason =
  | 'sliding_active'
  | 'sliding_disabled_server'
  | 'session_opt_out'
  | 'missing_proxy'
  | 'cold_cache_bootstrap'
  | 'probe_failed_fallback'
  | 'unknown';
type SyncTransportMeta = {
  transport: SyncTransport;
  slidingConfigured: boolean;
  slidingEnabledOnServer: boolean;
  sessionOptIn: boolean;
  slidingRequested: boolean;
  fallbackFromSliding: boolean;
  reason: SyncTransportReason;
};
const syncTransportByClient = new WeakMap<MatrixClient, SyncTransportMeta>();
const COLD_CACHE_BOOTSTRAP_TIMEOUT_MS = 20000;

export const resolveSlidingEnabled = (enabled: SlidingSyncConfig['enabled']): boolean => {
  if (enabled === undefined) return false;
  if (typeof enabled === 'boolean') return enabled;
  const normalized = String(enabled).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no')
    return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes')
    return true;
  return false;
};

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // resolve anyway — we tried
    req.onblocked = () => resolve();
  });

const deleteSyncStoreGroup = async (syncStoreName: string): Promise<void> => {
  await Promise.all([
    deleteDatabase(syncStoreName),
    deleteDatabase(syncStoreName.replace(/^sync/, 'crypto')),
    deleteDatabase(`${syncStoreName}::matrix-sdk-crypto`),
  ]);
};

const deleteSessionStores = async (storeName: SessionStoreName): Promise<void> => {
  await Promise.all([
    deleteDatabase(storeName.sync),
    deleteDatabase(storeName.crypto),
    deleteDatabase(`${storeName.rustCryptoPrefix}::matrix-sdk-crypto`),
  ]);
};

/**
 * Reads the account stored in an IndexedDB sync store without opening a full MatrixClient.
 * Returns undefined if the database doesn't exist or has no account record.
 */
const readStoredAccount = (dbName: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    const req = window.indexedDB.open(dbName);
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains('account')) {
          db.close();
          resolve(undefined);
        } else {
          const tx = db.transaction('account', 'readonly');
          const store = tx.objectStore('account');
          const getReq = store.get('account');
          getReq.onsuccess = () => {
            db.close();
            const record = getReq.result;
            if (!record?.account_data) {
              resolve(undefined);
            } else {
              try {
                const data = JSON.parse(record.account_data);
                resolve(data?.user_id ?? undefined);
              } catch {
                resolve(undefined);
              }
            }
          };
          getReq.onerror = () => {
            db.close();
            resolve(undefined);
          };
        }
      } catch {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve(undefined);
      }
    };
  });

const databaseExists = async (dbName: string): Promise<boolean> => {
  try {
    const dbs = await window.indexedDB.databases();
    return dbs.some((db) => db.name === dbName);
  } catch {
    return false;
  }
};

const isClientReadyForUi = (syncState: string | null): boolean =>
  syncState === 'PREPARED' || syncState === 'SYNCING' || syncState === 'CATCHUP';

const waitForClientReady = (mx: MatrixClient, timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    const waitStart = performance.now();
    if (isClientReadyForUi(mx.getSyncState())) {
      Sentry.metrics.distribution('sable.sync.client_ready_ms', 0, {
        attributes: { timed_out: 'false' },
      });
      resolve();
      return;
    }

    let timer = 0;
    let timedOut = false;
    let finish = () => {};
    const onSync = (state: string) => {
      debugLog.info('sync', `Sync state changed: ${state}`, {
        state,
        ready: isClientReadyForUi(state),
      });
      if (isClientReadyForUi(state)) finish();
    };

    let settled = false;
    finish = () => {
      if (settled) return;
      settled = true;
      mx.removeListener(ClientEvent.Sync, onSync);
      clearTimeout(timer);
      const waitMs = performance.now() - waitStart;
      Sentry.metrics.distribution('sable.sync.client_ready_ms', waitMs, {
        attributes: { timed_out: String(timedOut) },
      });
      if (timedOut) {
        Sentry.addBreadcrumb({
          category: 'sync',
          message: 'waitForClientReady timed out — client may be stuck',
          level: 'warning',
          data: { timeout_ms: timeoutMs },
        });
      }
      resolve();
    };

    timer = window.setTimeout(() => {
      timedOut = true;
      finish();
    }, timeoutMs);
    mx.on(ClientEvent.Sync, onSync);
  });

/**
 * Pre-flight check: scans every IndexedDB database and deletes any that
 * belong to a userId not present in the stored sessions list, or whose
 * sync-store data contradicts the expected session userId.
 * Call this once on startup before initClient.
 */
export const clearMismatchedStores = async (): Promise<void> => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const knownUserIds = new Set(sessions.map((s) => s.userId));
  const knownStoreNames = new Set(
    sessions.flatMap((s) => {
      const sn = getSessionStoreName(s);
      return [sn.sync, sn.crypto, `${sn.rustCryptoPrefix}::matrix-sdk-crypto`];
    })
  );

  let allDbs: IDBDatabaseInfo[] = [];
  try {
    allDbs = await window.indexedDB.databases();
  } catch {
    // databases() not supported in all browsers
  }

  await Promise.all(
    allDbs.map(async ({ name }) => {
      if (!name) return;

      const containsKnownUser = Array.from(knownUserIds).some((uid) => name.includes(uid));
      const looksLikeUserDb = name.includes('@');
      if (looksLikeUserDb && !containsKnownUser && !knownStoreNames.has(name)) {
        log.warn(`clearMismatchedStores: "${name}" has unknown user — deleting`);
        await deleteDatabase(name);
        return;
      }

      if (!name.startsWith('sync')) return;

      const storedUserId = await readStoredAccount(name);
      if (!storedUserId) return;

      if (!knownUserIds.has(storedUserId)) {
        log.warn(`clearMismatchedStores: "${name}" has unknown user ${storedUserId} — deleting`);
        await deleteSyncStoreGroup(name);
        return;
      }

      const expectedStore = `sync${storedUserId}`;
      if (name !== expectedStore && !knownStoreNames.has(name)) {
        log.warn(`clearMismatchedStores: "${name}" is misplaced for ${storedUserId} — deleting`);
        await deleteSyncStoreGroup(name);
      }
    })
  );

  await Promise.all(
    sessions.map(async (session) => {
      const sn = getSessionStoreName(session);
      const storedUserId = await readStoredAccount(sn.sync);
      if (storedUserId && storedUserId !== session.userId) {
        log.warn(
          `clearMismatchedStores: "${sn.sync}" has ${storedUserId} but session is ${session.userId} — deleting`
        );
        await deleteSessionStores(sn);
      }
    })
  );
};

const buildClient = async (session: Session): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: storeName.sync,
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, storeName.crypto);

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  return mx;
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);
  debugLog.info('sync', 'Initializing Matrix client', {
    userId: session.userId,
    baseUrl: session.baseUrl,
  });

  const isMismatch = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("doesn't match") ||
      msg.includes('does not match') ||
      msg.includes('account in the store') ||
      msg.includes('account in the constructor')
    );
  };

  const wipeAllStores = async () => {
    log.warn('initClient: wiping all stores for', session.userId);
    debugLog.warn('sync', 'Wiping all stores due to mismatch', { userId: session.userId });
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

  let mx: MatrixClient;
  try {
    mx = await buildClient(session);
  } catch (err) {
    if (!isMismatch(err)) {
      debugLog.error('sync', 'Failed to build client', { error: err });
      throw err;
    }
    log.warn('initClient: mismatch on buildClient — wiping and retrying:', err);
    debugLog.warn('sync', 'Client build mismatch - wiping stores and retrying', { error: err });
    await wipeAllStores();
    mx = await buildClient(session);
  }

  try {
    await mx.initRustCrypto({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
  } catch (err) {
    if (!isMismatch(err)) {
      debugLog.error('sync', 'Failed to initialize crypto', { error: err });
      throw err;
    }
    log.warn('initClient: mismatch on initRustCrypto — wiping and retrying:', err);
    debugLog.warn('sync', 'Crypto init mismatch - wiping stores and retrying', { error: err });
    mx.stopClient();
    await wipeAllStores();
    mx = await buildClient(session);
    await mx.initRustCrypto({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
  }

  mx.setMaxListeners(50);
  return mx;
};

export type StartClientConfig = {
  baseUrl?: string;
  slidingSync?: SlidingSyncConfig;
  sessionSlidingSyncOptIn?: boolean;
};

export type ClientSyncDiagnostics = SyncTransportMeta & {
  syncState: string | null;
  sliding?: SlidingSyncDiagnostics;
};

const disposeSlidingSync = (mx: MatrixClient): void => {
  const manager = slidingSyncByClient.get(mx);
  if (!manager) return;
  manager.dispose();
  slidingSyncByClient.delete(mx);
};

export const getSlidingSyncManager = (mx: MatrixClient): SlidingSyncManager | undefined =>
  slidingSyncByClient.get(mx);

export const startClient = async (mx: MatrixClient, config?: StartClientConfig): Promise<void> => {
  debugLog.info('sync', 'Starting Matrix client', { userId: mx.getUserId() });
  disposeSlidingSync(mx);
  const slidingConfig = config?.slidingSync;
  const slidingEnabledOnServer = resolveSlidingEnabled(slidingConfig?.enabled);
  const slidingRequested = slidingEnabledOnServer && config?.sessionSlidingSyncOptIn === true;
  const proxyBaseUrl = slidingConfig?.proxyBaseUrl ?? config?.baseUrl;
  const hasSlidingProxy = typeof proxyBaseUrl === 'string' && proxyBaseUrl.trim().length > 0;
  log.log('startClient sliding config', {
    userId: mx.getUserId(),
    enabled: slidingConfig?.enabled,
    enabledOnServer: slidingEnabledOnServer,
    sessionOptIn: config?.sessionSlidingSyncOptIn === true,
    requestedEnabled: slidingRequested,
    proxyBaseUrl,
    hasSlidingProxy,
  });
  debugLog.info('sync', 'Sliding sync configuration', {
    enabledOnServer: slidingEnabledOnServer,
    requested: slidingRequested,
    hasProxy: hasSlidingProxy,
  });

  const startClassicSync = async (fallbackFromSliding: boolean, reason: SyncTransportReason) => {
    syncTransportByClient.set(mx, {
      transport: 'classic',
      slidingConfigured: slidingEnabledOnServer,
      slidingEnabledOnServer,
      sessionOptIn: config?.sessionSlidingSyncOptIn === true,
      slidingRequested,
      fallbackFromSliding,
      reason,
    });
    Sentry.metrics.count('sable.sync.transport', 1, {
      attributes: { transport: 'classic', reason, fallback: String(fallbackFromSliding) },
    });
    await mx.startClient({
      lazyLoadMembers: true,
      pollTimeout: FAST_SYNC_POLL_TIMEOUT_MS,
    });
    // Attach an ongoing classic-sync observer — equivalent to SlidingSyncManager's
    // onLifecycle listener. Tracks state transitions, initial-sync timing, and errors.
    let classicSyncCount = 0;
    const classicSyncStartMs = performance.now();
    let classicInitialSyncDone = false;
    const classicSyncListener = (
      state: SyncState,
      prevState: SyncState | null,
      data?: ISyncStateData
    ) => {
      classicSyncCount += 1;
      Sentry.metrics.count('sable.sync.cycle', 1, { attributes: { transport: 'classic', state } });
      debugLog.info('sync', `Classic sync state: ${state}`, {
        state,
        prevState: prevState ?? 'null',
        syncNumber: classicSyncCount,
        error: data?.error?.message,
      });
      if (state === SyncState.Error || state === SyncState.Reconnecting) {
        debugLog.warn('sync', `Classic sync problem: ${state}`, {
          state,
          prevState: prevState ?? 'null',
          errorMessage: data?.error?.message,
          syncNumber: classicSyncCount,
        });
        Sentry.metrics.count('sable.sync.error', 1, {
          attributes: { transport: 'classic', state },
        });
        Sentry.addBreadcrumb({
          category: 'sync.classic',
          message: `Classic sync problem: ${state}`,
          level: 'warning',
          data: { state, prevState, error: data?.error?.message, syncNumber: classicSyncCount },
        });
      }
      if (
        !classicInitialSyncDone &&
        (state === SyncState.Syncing || state === SyncState.Prepared)
      ) {
        classicInitialSyncDone = true;
        const elapsed = performance.now() - classicSyncStartMs;
        debugLog.info('sync', 'Classic sync initial ready', {
          state,
          syncNumber: classicSyncCount,
          elapsed: `${elapsed.toFixed(0)}ms`,
        });
        Sentry.metrics.distribution('sable.sync.initial_ms', elapsed, {
          attributes: { transport: 'classic' },
        });
      }
    };
    classicSyncObserverByClient.set(mx, classicSyncListener);
    mx.on(ClientEvent.Sync, classicSyncListener);
  };

  const shouldBootstrapClassicOnColdCache = async (): Promise<boolean> => {
    if (slidingConfig?.bootstrapClassicOnColdCache === false) return false;
    const userId = mx.getUserId();
    if (!userId) return false;

    const [storeHasAccount, fallbackStoreHasAccount, hasStoreDb, hasFallbackStoreDb] =
      await Promise.all([
        readStoredAccount(`sync${userId}`),
        readStoredAccount('web-sync-store'),
        databaseExists(`sync${userId}`),
        databaseExists('web-sync-store'),
      ]);

    const hasWarmCache =
      storeHasAccount === userId ||
      fallbackStoreHasAccount === userId ||
      hasStoreDb ||
      hasFallbackStoreDb;

    return !hasWarmCache;
  };

  if (!slidingEnabledOnServer || !slidingRequested) {
    await startClassicSync(
      false,
      slidingEnabledOnServer ? 'session_opt_out' : 'sliding_disabled_server'
    );
    return;
  }

  if (!hasSlidingProxy) {
    await startClassicSync(false, 'missing_proxy');
    return;
  }

  if (await shouldBootstrapClassicOnColdCache()) {
    log.log('startClient cold-cache bootstrap: using classic sync for this run', mx.getUserId());
    await startClassicSync(false, 'cold_cache_bootstrap');
    waitForClientReady(mx, COLD_CACHE_BOOTSTRAP_TIMEOUT_MS).catch((err) => {
      debugLog.warn('network', 'Cold cache bootstrap timed out', {
        userId: mx.getUserId(),
        timeout: `${COLD_CACHE_BOOTSTRAP_TIMEOUT_MS}ms`,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  const resolvedProxyBaseUrl = proxyBaseUrl;
  const probeTimeoutMs = (() => {
    const v = slidingConfig?.probeTimeoutMs;
    return typeof v === 'number' && !Number.isNaN(v) && v > 0 ? Math.round(v) : 5000;
  })();
  const supported = await SlidingSyncManager.probe(mx, resolvedProxyBaseUrl, probeTimeoutMs);
  log.log('startClient sliding probe result', {
    userId: mx.getUserId(),
    requestedEnabled: slidingRequested,
    hasSlidingProxy,
    proxyBaseUrl: resolvedProxyBaseUrl,
    supported,
  });
  if (!supported) {
    log.warn('Sliding Sync unavailable, falling back to classic sync for', mx.getUserId());
    debugLog.warn('network', 'Sliding Sync probe failed, falling back to classic sync', {
      userId: mx.getUserId(),
      proxyBaseUrl: resolvedProxyBaseUrl,
      probeTimeout: `${probeTimeoutMs}ms`,
    });
    await startClassicSync(true, 'probe_failed_fallback');
    return;
  }

  const manager = new SlidingSyncManager(mx, resolvedProxyBaseUrl, {
    ...(slidingConfig ?? {}),
    includeInviteList: true,
    pollTimeoutMs: slidingConfig?.pollTimeoutMs ?? SLIDING_SYNC_POLL_TIMEOUT_MS,
  });
  manager.attach();
  // Begin background spidering so all rooms are eventually indexed.
  // Not awaited — this runs incrementally in the background.
  manager.startSpidering(100, 50);
  slidingSyncByClient.set(mx, manager);
  syncTransportByClient.set(mx, {
    transport: 'sliding',
    slidingConfigured: true,
    slidingEnabledOnServer,
    sessionOptIn: config?.sessionSlidingSyncOptIn === true,
    slidingRequested,
    fallbackFromSliding: false,
    reason: 'sliding_active',
  });
  Sentry.metrics.count('sable.sync.transport', 1, {
    attributes: { transport: 'sliding', reason: 'sliding_active', fallback: 'false' },
  });

  try {
    await mx.startClient({
      lazyLoadMembers: true,
      slidingSync: manager.slidingSync,
    });
  } catch (err) {
    debugLog.error('network', 'Failed to start client with sliding sync', {
      error: err instanceof Error ? err.message : String(err),
      userId: mx.getUserId(),
      proxyBaseUrl: resolvedProxyBaseUrl,
      stack: err instanceof Error ? err.stack : undefined,
    });
    disposeSlidingSync(mx);
    throw err;
  }
};

export const stopClient = (mx: MatrixClient): void => {
  log.log('stopClient', mx.getUserId());
  debugLog.info('sync', 'Stopping client', { userId: mx.getUserId() });
  disposeSlidingSync(mx);
  const classicSyncListener = classicSyncObserverByClient.get(mx);
  if (classicSyncListener) {
    mx.removeListener(ClientEvent.Sync, classicSyncListener);
    classicSyncObserverByClient.delete(mx);
  }
  mx.stopClient();
  syncTransportByClient.delete(mx);
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  log.log('clearCacheAndReload', mx.getUserId());
  stopClient(mx);
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const getClientSyncDiagnostics = (mx: MatrixClient): ClientSyncDiagnostics => {
  const meta = syncTransportByClient.get(mx) ?? {
    transport: 'classic',
    slidingConfigured: false,
    slidingEnabledOnServer: false,
    sessionOptIn: false,
    slidingRequested: false,
    fallbackFromSliding: false,
    reason: 'unknown',
  };
  return {
    ...meta,
    syncState: mx.getSyncState(),
    sliding: slidingSyncByClient.get(mx)?.getDiagnostics(),
  };
};

/**
 * Logs out a Matrix client and cleans up its SDK stores + IndexedDB databases.
 * Does NOT touch the Jotai sessions atom — callers must do that themselves
 * so the correct Jotai Provider store is used.
 */
export const logoutClient = async (mx: MatrixClient, session?: Session) => {
  log.log('logoutClient', { userId: mx.getUserId(), sessionUserId: session?.userId });
  debugLog.info('general', 'Logging out client', { userId: mx.getUserId() });
  pushSessionToSW();
  stopClient(mx);
  try {
    await mx.logout();
    debugLog.info('general', 'Logout successful', { userId: mx.getUserId() });
  } catch {
    // ignore
  }

  if (session) {
    const storeName: SessionStoreName = getSessionStoreName(session);
    await mx.clearStores({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
    await deleteDatabase(storeName.sync);
    await deleteDatabase(storeName.crypto);
    await deleteDatabase(`${storeName.rustCryptoPrefix}::matrix-sdk-crypto`);
  } else {
    await mx.clearStores();
    window.localStorage.clear();
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
  window.location.reload();
};
