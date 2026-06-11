import type { CryptoCallbacks, MatrixClient, ISyncStateData } from '$types/matrix-sdk';
import {
  ClientEvent,
  createClient,
  Filter,
  IndexedDBStore,
  IndexedDBCryptoStore,
  SyncState,
} from '$types/matrix-sdk';

import { clearNavToActivePathStore } from '$state/navToActivePath';
import type { Session, Sessions, SessionStoreName } from '$state/sessions';
import { getSessionStoreName, MATRIX_SESSIONS_KEY } from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import * as Sentry from '@sentry/react';
import { fetch } from '$utils/fetch';
import { pushSessionToSW } from '../sw-session';
import { cryptoCallbacks } from './secretStorageKeys';
import type { SlidingSyncConfig, SlidingSyncDiagnostics } from './slidingSync';
import { SlidingSyncManager } from './slidingSync';
import { installThreadEventInstrumentation } from './threadEventPatch';

const log = createLogger('initMatrix');
const debugLog = createDebugLogger('initMatrix');
const slidingSyncByClient = new WeakMap<MatrixClient, SlidingSyncManager>();
const classicSyncObserverByClient = new WeakMap<
  MatrixClient,
  (state: SyncState, prevState: SyncState | null, data?: ISyncStateData) => void
>();
const FAST_SYNC_POLL_TIMEOUT_MS = 30_000;
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
const fetchRoomEventStartupCleanupByClient = new WeakMap<MatrixClient, () => void>();
// Reduced from 20s to 8s to improve perceived cold launch performance.
// 8 seconds is sufficient for most networks while still allowing time for
// slow connections. If the bootstrap times out, sliding sync takes over.
const COLD_CACHE_BOOTSTRAP_TIMEOUT_MS = 8000;

type FetchRoomEventResult = Awaited<ReturnType<MatrixClient['fetchRoomEvent']>>;
type MatrixClientWithWritableFetchRoomEvent = MatrixClient & {
  fetchRoomEvent: (roomId: string, eventId: string) => Promise<FetchRoomEventResult>;
};

type StartupFetchRoomEventPatchOptions = {
  stubOnCacheMiss: boolean;
};

function installStartupFetchRoomEventPatch(
  mx: MatrixClient,
  options: StartupFetchRoomEventPatchOptions
): void {
  fetchRoomEventStartupCleanupByClient.get(mx)?.();

  const { stubOnCacheMiss } = options;
  const mxWritable = mx as MatrixClientWithWritableFetchRoomEvent;
  const origFetchRoomEvent = mx.fetchRoomEvent.bind(mx);
  let restored = false;

  const restore = () => {
    if (restored) return;
    restored = true;
    fetchRoomEventStartupCleanupByClient.delete(mx);
    // Put the real fetchRoomEvent back and detach this
    mxWritable.fetchRoomEvent = origFetchRoomEvent;
    mx.off(ClientEvent.Sync, onSync);
  };

  const onSync = (state: SyncState) => {
    // Initial sync burst is over, let normal server fetches run again
    if (state === SyncState.Prepared || state === SyncState.Syncing) {
      restore();
    }
  };

  mxWritable.fetchRoomEvent = (roomId: string, eventId: string) => {
    if (restored) return origFetchRoomEvent(roomId, eventId);
    const cachedEvent = mx.getRoom(roomId)?.findEventById(eventId);
    if (cachedEvent) {
      return Promise.resolve(cachedEvent.event);
    }
    if (stubOnCacheMiss) {
      const payload: FetchRoomEventResult = {
        event_id: eventId,
        room_id: roomId,
      };
      return Promise.resolve(payload);
    }
    return origFetchRoomEvent(roomId, eventId);
  };

  mx.on(ClientEvent.Sync, onSync);
  fetchRoomEventStartupCleanupByClient.set(mx, restore);
}

export function resolveRefreshToken(
  oldRefreshToken: string,
  responseRefreshToken?: string
): string {
  return responseRefreshToken ?? oldRefreshToken;
}

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
    req.addEventListener('success', () => resolve());
    req.addEventListener('error', () => resolve()); // resolve anyway — we tried
    req.addEventListener('blocked', () => resolve());
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
    let settled = false;
    const finish = (value: string | undefined, reason?: string) => {
      if (settled) return;
      settled = true;
      debugLog.info('sync', `readStoredAccount(${dbName}):`, {
        userId: value ? '***' + value.slice(-10) : undefined,
        reason: reason ?? 'success',
      });
      resolve(value);
    };
    const req = window.indexedDB.open(dbName);
    req.addEventListener('error', () => {
      debugLog.warn('sync', `readStoredAccount(${dbName}): IDB open error`);
      finish(undefined, 'open_error');
    });
    req.addEventListener('success', () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains('account')) {
          db.close();
          finish(undefined, 'no_account_store');
        } else {
          const tx = db.transaction('account', 'readonly');
          const store = tx.objectStore('account');
          const getReq = store.get('account');
          getReq.addEventListener('success', () => {
            db.close();
            const record = getReq.result;
            if (!record?.account_data) {
              finish(undefined, 'no_account_data');
            } else {
              try {
                const data = JSON.parse(record.account_data);
                finish(data?.user_id ?? undefined, data?.user_id ? 'found' : 'no_user_id');
              } catch {
                finish(undefined, 'parse_error');
              }
            }
          });
          getReq.addEventListener('error', () => {
            db.close();
            finish(undefined, 'get_error');
          });
        }
      } catch {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        finish(undefined, 'exception');
      }
    });
  });

const databaseExists = async (dbName: string): Promise<boolean> => {
  try {
    // indexedDB.databases() is not widely supported (missing in Safari < 14,
    // private browsing, some privacy settings). Log availability.
    if (!window.indexedDB.databases) {
      debugLog.warn('sync', 'indexedDB.databases() not available - cold cache detection limited');
      Sentry.addBreadcrumb({
        category: 'sync',
        message: 'indexedDB.databases() not available',
        level: 'warning',
      });
      return false;
    }
    const dbs = await window.indexedDB.databases();
    const exists = dbs.some((db) => db.name === dbName);
    debugLog.info('sync', `databaseExists(${dbName}):`, { exists, totalDbs: dbs.length });
    return exists;
  } catch (err) {
    debugLog.warn('sync', `databaseExists(${dbName}) failed:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    Sentry.addBreadcrumb({
      category: 'sync',
      message: `databaseExists check failed for ${dbName}`,
      level: 'warning',
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }
};

const isClientReadyForUi = (syncState: string | null): boolean =>
  syncState === 'PREPARED' || syncState === 'SYNCING' || syncState === 'CATCHUP';

const isMismatch = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("doesn't match") ||
    msg.includes('does not match') ||
    msg.includes('account in the store') ||
    msg.includes('account in the constructor')
  );
};

const waitForClientReady = (mx: MatrixClient, timeoutMs: number): Promise<void> =>
  /* oxlint-disable promise/no-multiple-resolved */
  new Promise((resolve) => {
    const waitStart = performance.now();
    let settled = false;
    const finish = () => {
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
    /* oxlint-enable promise/no-multiple-resolved */

    if (isClientReadyForUi(mx.getSyncState())) {
      Sentry.metrics.distribution('sable.sync.client_ready_ms', 0, {
        attributes: { timed_out: 'false' },
      });
      finish();
      return;
    }

    let timer = 0;
    let timedOut = false;
    const onSync = (state: string) => {
      debugLog.info('sync', `Sync state changed: ${state}`, {
        state,
        ready: isClientReadyForUi(state),
      });
      if (isClientReadyForUi(state)) finish();
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

const buildClient = async (
  session: Session
): Promise<{ mx: MatrixClient; storeStartup: Promise<void> }> => {
  const storeName = getSessionStoreName(session);
  debugLog.info('sync', 'Building Matrix client with stores', {
    syncDb: storeName.sync,
    cryptoDb: storeName.crypto,
    userId: session.userId,
  });
  Sentry.addBreadcrumb({
    category: 'sync',
    message: 'Building Matrix client',
    level: 'info',
    data: {
      syncDb: storeName.sync,
      cryptoDb: storeName.crypto,
    },
  });

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: storeName.sync,
  });

  // The SDK's IndexedDBStore.degradable() wrapper silently catches any IDB
  // error (including transient ones like 'Transaction aborted'), deletes the
  // entire sync IDB database, and switches the store to in-memory mode for
  // the rest of the session — with no signal to the app by default.
  // Register a listener so we can see this in Sentry and understand how often
  // transient IDB aborts are triggering permanent MemoryStore degradation.
  indexedDBStore.on('degraded', (err: Error) => {
    debugLog.error('sync', 'IndexedDBStore degraded to MemoryStore — sync IDB deleted', {
      error: err.message,
    });
    Sentry.captureMessage('IndexedDBStore degraded to MemoryStore', {
      level: 'error',
      tags: { component: 'idb-sync-store' },
      extra: {
        errorMessage: err.message,
        errorName: err.name,
        isTransientAbort: err.message.includes('Transaction aborted'),
        userId: session.userId,
      },
    });
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, storeName.crypto);

  let mxRef!: MatrixClient;

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    fetchFn: fetch,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as unknown as CryptoCallbacks,
    verificationMethods: ['m.sas.v1'],
    ...(session.refreshToken && {
      refreshToken: session.refreshToken,
      tokenRefreshFunction: async (oldRefreshToken: string) => {
        const res = await mxRef.refreshToken(oldRefreshToken);
        const resolvedRefreshToken = resolveRefreshToken(oldRefreshToken, res.refresh_token);
        onTokenRefresh?.(res.access_token, resolvedRefreshToken);
        return {
          accessToken: res.access_token,
          refreshToken: resolvedRefreshToken,
          expiry:
            typeof res.expires_in_ms === 'number'
              ? new Date(Date.now() + res.expires_in_ms)
              : undefined,
        };
      },
    }),
  });

  // Return both client and store startup promise for parallel initialization
  return { mx, storeStartup: indexedDBStore.startup() };
};

export const initClient = async (
  session: Session,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken?: string) => void
): Promise<MatrixClient> => {
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

  let mx: MatrixClient;
  let storeStartup: Promise<void>;
  try {
    const result = await buildClient(session);
    mx = result.mx;
    storeStartup = result.storeStartup;
  } catch (err) {
    if (!isMismatch(err)) {
      debugLog.error('sync', 'Failed to build client', { error: err });
      throw err;
    }
    log.warn('initClient: mismatch on buildClient — wiping and retrying:', err);
    debugLog.warn('sync', 'Client build mismatch - wiping stores and retrying', { error: err });
    // SABLE-5E: Capture mismatch wipe events to Sentry before wiping
    Sentry.addBreadcrumb({
      category: 'initMatrix',
      message: 'Store mismatch detected during buildClient - triggering wipe',
      level: 'warning',
      data: {
        stage: 'buildClient',
        errorName: err instanceof Error ? err.name : 'Unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    Sentry.captureException(err, {
      level: 'warning',
      tags: {
        component: 'initMatrix',
        event: 'store_wipe_on_mismatch',
        stage: 'buildClient',
      },
      contexts: {
        mismatch: {
          errorName: err instanceof Error ? err.name : 'Unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      },
    });
    await wipeAllStores();
    const result = await buildClient(session);
    mx = result.mx;
    storeStartup = result.storeStartup;
  }

  try {
    // Parallelize IndexedDB sync store startup and crypto initialization
    // These are independent operations that can run concurrently
    await Promise.all([
      storeStartup,
      mx.initRustCrypto({
        cryptoDatabasePrefix: storeName.rustCryptoPrefix,
      }),
    ]);
  } catch (err) {
    if (!isMismatch(err)) {
      debugLog.error('sync', 'Failed to initialize stores', { error: err });
      throw err;
    }
    log.warn('initClient: mismatch on parallel init — wiping and retrying:', err);
    debugLog.warn('sync', 'Store init mismatch - wiping stores and retrying', {
      error: err,
    });
    mx.stopClient();
    await wipeAllStores();
    const result = await buildClient(session);
    mx = result.mx;
    await Promise.all([
      result.storeStartup,
      mx.initRustCrypto({
        cryptoDatabasePrefix: storeName.rustCryptoPrefix,
      }),
    ]);
  }

  // 100 listeners: large apps render many components that each register one
  // RoomStateEvent.Events handler via useStateEventCallback. 50 was too low.
  mx.setMaxListeners(100);
  return mx;
};

export type StartClientConfig = {
  baseUrl?: string;
  slidingSync?: SlidingSyncConfig;
  sessionSlidingSyncOptIn?: boolean;
  pollTimeoutMs?: number;
  timelineLimit?: number;
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
  // Save config so resumeClientFromBfcache() can restart with identical settings.
  bfcacheStartConfigByClient.set(mx, config ?? {});
  // If this is a resume, clear the paused flag.
  pausedForBfcache.delete(mx);

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

  const CLASSIC_SYNC_STARTUP_TIMEOUT_MS = 45_000;

  const startClassicSync = async (
    fallbackFromSliding: boolean,
    reason: SyncTransportReason
  ): Promise<void> => {
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
      attributes: {
        transport: 'classic',
        reason,
        fallback: String(fallbackFromSliding),
      },
    });

    const startupTimeout = new Promise<void>((resolve) => {
      window.setTimeout(() => {
        debugLog.warn('sync', 'Classic sync startup timed out', {
          userId: mx.getUserId(),
          timeoutMs: CLASSIC_SYNC_STARTUP_TIMEOUT_MS,
        });
        resolve();
      }, CLASSIC_SYNC_STARTUP_TIMEOUT_MS);
    });

    const effectivePollTimeout = config?.pollTimeoutMs ?? FAST_SYNC_POLL_TIMEOUT_MS;
    const effectiveTimelineLimit = config?.timelineLimit ?? 10;

    const classicFilter = new Filter(mx.getUserId() ?? undefined);
    classicFilter.setTimelineLimit(effectiveTimelineLimit);
    // Ensure lazy loading stays on (carried by buildDefaultFilter but explicit here
    // since we replace the filter entirely rather than merging).
    const filterDefinition = classicFilter.getDefinition();
    if (filterDefinition.room) {
      filterDefinition.room.timeline = filterDefinition.room.timeline ?? {};
      (filterDefinition.room.timeline as { lazy_load_members?: boolean }).lazy_load_members = true;
    }

    installStartupFetchRoomEventPatch(mx, { stubOnCacheMiss: true });

    let syncStarted: Promise<void>;
    try {
      syncStarted = mx.startClient({
        lazyLoadMembers: true,
        pollTimeout: effectivePollTimeout,
        threadSupport: true,
        filter: classicFilter,
      });
    } catch (syncErr) {
      fetchRoomEventStartupCleanupByClient.get(mx)?.();
      throw syncErr;
    }

    await Promise.race([syncStarted, startupTimeout]);
    // Attach an ongoing classic-sync observer — equivalent to SlidingSyncManager's
    // onLifecycle listener. Tracks state transitions, initial-sync timing, and errors.
    let classicSyncCount = 0;
    const classicSyncStartMs = performance.now();
    let classicInitialSyncDone = false;

    // Create span for sync connecting stage
    const syncConnectSpan = Sentry.startInactiveSpan({
      name: 'app.startup.sync',
      op: 'app.startup',
      attributes: {
        'startup.stage': 'connecting',
        'startup.transport': 'classic',
      },
    });

    const classicSyncListener = (
      state: SyncState,
      prevState: SyncState | null,
      data?: ISyncStateData
    ) => {
      classicSyncCount += 1;
      Sentry.metrics.count('sable.sync.cycle', 1, {
        attributes: { transport: 'classic', state },
      });
      debugLog.info('sync', `Classic sync state: ${state}`, {
        state,
        prevState: prevState ?? 'null',
        syncNumber: classicSyncCount,
        error: data?.error?.message,
      });
      if (state === SyncState.Error || state === SyncState.Reconnecting) {
        const errorMsg = data?.error?.message ?? '';
        const isCryptoStoreError =
          errorMsg.includes('without an in-progress transaction') ||
          errorMsg.includes('database connection is closed') ||
          errorMsg.includes('InvalidStateError') ||
          errorMsg.includes('UnknownError');

        debugLog.warn('sync', `Classic sync problem: ${state}`, {
          state,
          prevState: prevState ?? 'null',
          errorMessage: errorMsg,
          syncNumber: classicSyncCount,
          isCryptoStoreError,
        });
        Sentry.metrics.count('sable.sync.error', 1, {
          attributes: {
            transport: 'classic',
            state,
            crypto_store_error: isCryptoStoreError,
          },
        });
        Sentry.addBreadcrumb({
          category: 'sync.classic',
          message: `Classic sync problem: ${state}`,
          level: isCryptoStoreError ? 'error' : 'warning',
          data: {
            state,
            prevState,
            error: errorMsg,
            syncNumber: classicSyncCount,
            isCryptoStoreError,
          },
        });

        // Capture crypto store errors to Sentry with additional context
        if (isCryptoStoreError) {
          Sentry.captureMessage('Crypto store IndexedDB error during sync', {
            level: 'error',
            tags: {
              component: 'crypto-store',
              sync_transport: 'classic',
              error_type: errorMsg.includes('transaction')
                ? 'transaction_error'
                : errorMsg.includes('closed')
                  ? 'connection_closed'
                  : 'unknown_idb_error',
            },
            extra: {
              errorMessage: errorMsg,
              syncState: state,
              prevState,
              syncNumber: classicSyncCount,
              userId: mx.getUserId(),
              recovery_recommendation:
                'Matrix SDK WASM crypto layer issue - client will attempt to reconnect',
            },
          });
        }
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

        // End sync connect span and record first sync metrics
        syncConnectSpan.setAttribute('startup.first_sync_rooms', mx.getRooms().length);
        syncConnectSpan.setAttribute('startup.elapsed_ms', elapsed);
        syncConnectSpan.end();

        // Start room list ready span
        const roomListSpan = Sentry.startInactiveSpan({
          name: 'app.startup.room_list',
          op: 'app.startup',
          attributes: { 'startup.room_count': mx.getRooms().length },
        });
        // End immediately for classic sync (room list is ready when first sync completes)
        roomListSpan.end();
      }
    };
    classicSyncObserverByClient.set(mx, classicSyncListener);
    mx.on(ClientEvent.Sync, classicSyncListener);
  };

  const shouldBootstrapClassicOnColdCache = async (): Promise<boolean> => {
    if (slidingConfig?.bootstrapClassicOnColdCache === false) return false;
    const userId = mx.getUserId();
    if (!userId) return false;

    // Primary signal: if the client already has rooms loaded from IndexedDB,
    // we definitely have a warm cache. This check happens AFTER store startup,
    // so rooms would be loaded if the database existed and was valid.
    const roomCount = mx.getRooms().length;
    const hasRoomsInMemory = roomCount > 0;

    // Secondary signals: check if IndexedDB stores exist and contain our account.
    // These are less reliable (especially databaseExists on Safari/iOS where
    // indexedDB.databases() may not be available), but provide additional confirmation.
    const [storeHasAccount, fallbackStoreHasAccount, hasStoreDb, hasFallbackStoreDb] =
      await Promise.all([
        readStoredAccount(`sync${userId}`),
        readStoredAccount('web-sync-store'),
        databaseExists(`sync${userId}`),
        databaseExists('web-sync-store'),
      ]);

    // Prioritize rooms in memory as the most reliable signal.
    // Fall back to account checks if rooms aren't loaded yet (edge case: empty account).
    const hasWarmCache =
      hasRoomsInMemory ||
      storeHasAccount === userId ||
      fallbackStoreHasAccount === userId ||
      (hasStoreDb && storeHasAccount !== undefined) ||
      (hasFallbackStoreDb && fallbackStoreHasAccount !== undefined);

    const cacheStatus = {
      userId,
      roomCount,
      hasRoomsInMemory,
      storeHasAccount: storeHasAccount === userId,
      fallbackStoreHasAccount: fallbackStoreHasAccount === userId,
      hasStoreDb,
      hasFallbackStoreDb,
      hasWarmCache,
      willBootstrapClassic: !hasWarmCache,
      detection: hasRoomsInMemory
        ? 'rooms_in_memory'
        : storeHasAccount === userId || fallbackStoreHasAccount === userId
          ? 'account_found'
          : hasStoreDb || hasFallbackStoreDb
            ? 'database_exists'
            : 'no_cache',
    };

    debugLog.info('sync', 'Cold cache detection', cacheStatus);
    Sentry.addBreadcrumb({
      category: 'sync',
      message: 'Cold cache detection',
      level: 'info',
      data: cacheStatus,
    });

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

    const coldCacheStartMs = performance.now();
    const userId = mx.getUserId();

    // Add breadcrumb: cold cache sync started
    Sentry.addBreadcrumb({
      category: 'sync.coldCache',
      message: 'Cold cache sync started',
      data: { userId, timeoutMs: COLD_CACHE_BOOTSTRAP_TIMEOUT_MS, since: null },
      level: 'info',
    });

    await startClassicSync(false, 'cold_cache_bootstrap');

    // Wait for cold cache sync to complete, then add completion breadcrumb
    waitForClientReady(mx, COLD_CACHE_BOOTSTRAP_TIMEOUT_MS)
      .then(() => {
        const durationMs = performance.now() - coldCacheStartMs;
        const roomsPopulated = mx.getRooms().length;

        Sentry.addBreadcrumb({
          category: 'sync.coldCache',
          message: 'Cold cache warm — staying on classic sync',
          data: { roomsPopulated, totalDurationMs: Math.round(durationMs) },
          level: 'info',
        });

        Sentry.metrics.distribution('sable.sync.cold_cache_duration_ms', durationMs, {
          attributes: { rooms_populated: String(roomsPopulated) },
        });

        debugLog.info('sync', 'Cold cache sync complete', {
          roomsPopulated,
          durationMs: `${durationMs.toFixed(0)}ms`,
        });
      })
      .catch((err) => {
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

  // Add breadcrumb: sliding sync started (cache warm)
  Sentry.addBreadcrumb({
    category: 'sync.coldCache',
    message: 'Sliding sync started (cache warm)',
    level: 'info',
  });

  const manager = new SlidingSyncManager(mx, resolvedProxyBaseUrl, {
    ...slidingConfig,
    includeInviteList: true,
    pollTimeoutMs: slidingConfig?.pollTimeoutMs ?? SLIDING_SYNC_POLL_TIMEOUT_MS,
  });
  manager.attach();
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
    attributes: {
      transport: 'sliding',
      reason: 'sliding_active',
      fallback: 'false',
    },
  });

  try {
    installStartupFetchRoomEventPatch(mx, { stubOnCacheMiss: false });
    installThreadEventInstrumentation(mx);
    await mx.startClient({
      lazyLoadMembers: true,
      slidingSync: manager.slidingSync,
      threadSupport: true,
    });
  } catch (err) {
    fetchRoomEventStartupCleanupByClient.get(mx)?.();
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
  fetchRoomEventStartupCleanupByClient.get(mx)?.();
  disposeSlidingSync(mx);
  const classicSyncListener = classicSyncObserverByClient.get(mx);
  if (classicSyncListener) {
    mx.removeListener(ClientEvent.Sync, classicSyncListener);
    classicSyncObserverByClient.delete(mx);
  }
  // Shut the SDK down first so it can cancel in-flight requests and close the
  // WASM OlmMachine cleanly before we strip remaining app-level listeners.
  // Reversing this order (removeAllListeners → stopClient) was removing the
  // SDK's own internal handlers, which prevented clean WASM teardown and left
  // queued microtasks able to call into the freed OlmMachine.
  mx.stopClient();
  mx.removeAllListeners();
  syncTransportByClient.delete(mx);
};

/**
 * Suspend sync for a bfcache freeze: abort the in-flight /sync request so iOS
 * can bfcache the page without a pending network request blocking it.
 *
 * Critically, crypto (OlmMachine / IDB) is intentionally NOT stopped. We keep
 * the WASM heap and IDB connection alive so that decryption works immediately
 * on pageshow restore. Safari 14+ bfcaches pages with open IDB connections as
 * long as there are no active transactions — which is the case once sync stops.
 *
 * Call resumeClientFromBfcache() in the pageshow[persisted] or
 * visibilitychange → visible handler to restart the sync loop.
 */
export const pauseClientForBfcache = (mx: MatrixClient): void => {
  if (!mx.clientRunning) return; // already stopped
  debugLog.info('sync', 'Pausing Matrix client sync for bfcache freeze', {
    userId: mx.getUserId(),
  });
  // Access the SyncApi directly to abort only the /sync fetch without touching
  // the crypto backend. mx.stopClient() would call olmMachine.close(), which
  // frees the WASM heap and forces a full crypto re-init on restore (IDB open
  // + key loading), adding ~2–5 s of latency on every foreground wake.
  const rawMx = mx as unknown as {
    syncApi?: { stop(): void };
    clientRunning: boolean;
  };
  rawMx.syncApi?.stop();
  // Reset flag so startClient() will accept a new call on resume.
  rawMx.clientRunning = false;
  pausedForBfcache.add(mx);
};

/**
 * Resume sync after a bfcache restore or background → foreground transition
 * when sync was paused via pauseClientForBfcache().
 *
 * Re-creates the SlidingSyncManager / classic SyncApi using the config from
 * the last startClient() call. Idempotent: does nothing if the client was not
 * paused or if startClient() was never called for this instance.
 */
export const resumeClientFromBfcache = async (mx: MatrixClient): Promise<void> => {
  if (!pausedForBfcache.has(mx)) return; // not paused — nothing to do
  const config = bfcacheStartConfigByClient.get(mx);
  if (!config) {
    debugLog.warn('sync', 'resumeClientFromBfcache: no saved start config — cannot resume', {
      userId: mx.getUserId(),
    });
    return;
  }
  debugLog.info('sync', 'Resuming Matrix client from bfcache', { userId: mx.getUserId() });
  try {
    await startClient(mx, config);
  } catch (err) {
    debugLog.error('sync', 'Failed to resume Matrix client from bfcache', {
      error: err instanceof Error ? err.message : String(err),
      userId: mx.getUserId(),
    });
  }
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
  log.log('logoutClient', {
    userId: mx.getUserId(),
    sessionUserId: session?.userId,
  });
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

  // Unregister all service workers so the next load starts fresh.
  // Especially important on iOS/mobile where stale SWs can persist.
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    // SW unregister is best-effort; reload regardless
  }

  window.location.reload();
};
