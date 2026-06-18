import type { CryptoCallbacks, MatrixClient, ISyncStateData } from '$types/matrix-sdk';
import {
  ClientEvent,
  createClient,
  Filter,
  IndexedDBStore,
  IndexedDBCryptoStore,
  MatrixEvent as MatrixEventClass,
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
import { classifyCryptoStoreIndexedDbError } from './cryptoStoreErrors';
import { clearClientCachesAndServiceWorkers } from '$utils/appCacheReset';
import { reloadWithTelemetry } from '$utils/reloadWithTelemetry';

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
const classicSyncNetworkCleanupByClient = new WeakMap<MatrixClient, () => void>();
const MATRIX_DEVICE_ID_SENTRY_TAG = 'matrix.device_id';
type MatrixClientScope = 'app' | 'background';
const CLASSIC_SYNC_FOREGROUND_RETRY_THROTTLE_MS = 15_000;
let activeAppClient: MatrixClient | undefined;
let activeAppClientStartPromise: Promise<void> | undefined;
let activeAppClientStopPromise: Promise<void> | undefined;
// Reduced from 20s to 8s to improve perceived cold launch performance.
// 8 seconds is sufficient for most networks while still allowing time for
// slow connections. If the bootstrap times out, sliding sync takes over.
const COLD_CACHE_BOOTSTRAP_TIMEOUT_MS = 8000;
const MATRIX_EVENT_TYPE_GUARD_PATCHED = '__sableEventTypeGuardPatched';
const MATRIX_EVENT_TYPE_GUARD_REPORTED = '__sableEventTypeGuardReported';

type FetchRoomEventResult = Awaited<ReturnType<MatrixClient['fetchRoomEvent']>>;
type MatrixClientWithWritableFetchRoomEvent = MatrixClient & {
  fetchRoomEvent: (roomId: string, eventId: string) => Promise<FetchRoomEventResult>;
};

type MatrixDeviceContextClient = Pick<MatrixClient, 'getDeviceId'>;

const installMatrixEventTypeGuard = (): void => {
  const proto = MatrixEventClass.prototype as {
    getType?: (...args: unknown[]) => unknown;
    event?: { type?: unknown };
    [MATRIX_EVENT_TYPE_GUARD_PATCHED]?: boolean;
  };
  if (proto[MATRIX_EVENT_TYPE_GUARD_PATCHED]) return;

  const originalGetType = proto.getType;
  proto.getType = function patchedGetType(...args: unknown[]) {
    const self = this as {
      event?: { type?: unknown };
      [MATRIX_EVENT_TYPE_GUARD_REPORTED]?: boolean;
    };
    const resolved =
      typeof originalGetType === 'function' ? originalGetType.apply(this, args) : self.event?.type;
    if (typeof resolved === 'string') {
      return resolved;
    }

    const fallback = typeof self.event?.type === 'string' ? self.event.type : '';
    if (!self[MATRIX_EVENT_TYPE_GUARD_REPORTED]) {
      self[MATRIX_EVENT_TYPE_GUARD_REPORTED] = true;
      Sentry.captureMessage('MatrixEvent missing string event type', {
        level: 'warning',
        tags: { component: 'matrix-event-type-guard' },
        extra: {
          rawType:
            resolved === undefined ? 'undefined' : resolved === null ? 'null' : typeof resolved,
          fallbackType: fallback,
        },
      });
    }
    return fallback;
  };
  proto[MATRIX_EVENT_TYPE_GUARD_PATCHED] = true;
};

const isRecoverableStoreInitError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (classifyCryptoStoreIndexedDbError(msg)) return true;

  return (
    name === 'AbortError' ||
    name === 'DatabaseClosedError' ||
    msg.includes('AbortError') ||
    msg.includes('DatabaseClosedError') ||
    msg.includes('connection is closing') ||
    msg.includes('connection is closed') ||
    msg.includes('The database connection is closing') ||
    msg.includes('The database connection is closed')
  );
};

export function setSentryMatrixDeviceContext(
  mx?: MatrixDeviceContextClient | null,
  session?: Pick<Session, 'deviceId'> | null
): void {
  const deviceId = mx?.getDeviceId() ?? session?.deviceId;
  if (!deviceId) return;
  Sentry.setTag(MATRIX_DEVICE_ID_SENTRY_TAG, deviceId);
}

export function clearSentryMatrixDeviceContext(): void {
  Sentry.setTag(MATRIX_DEVICE_ID_SENTRY_TAG, 'none');
}

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

const toMatrixSdkIndexedDbName = (dbName: string): string =>
  dbName.startsWith('matrix-js-sdk:') ? dbName : `matrix-js-sdk:${dbName}`;

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
    const exists = await IndexedDBStore.exists(window.indexedDB, dbName);
    debugLog.info('sync', `databaseExists(${dbName}):`, { exists, source: 'sdk' });
    return exists;
  } catch (err) {
    debugLog.warn('sync', `IndexedDBStore.exists(${dbName}) failed:`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
    const sdkDbName = toMatrixSdkIndexedDbName(dbName);
    const exists = dbs.some((db) => db.name === sdkDbName);
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

type StoredSyncSummary = {
  nextBatch: boolean;
  joinedRooms: number;
  inviteRooms: number;
  leftRooms: number;
  totalRooms: number;
};

const readStoredSyncSummary = async (dbName: string): Promise<StoredSyncSummary | undefined> => {
  if (!(await databaseExists(dbName))) return undefined;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: StoredSyncSummary | undefined, reason?: string) => {
      if (settled) return;
      settled = true;
      debugLog.info('sync', `readStoredSyncSummary(${dbName}):`, {
        ...value,
        reason: reason ?? 'success',
      });
      resolve(value);
    };

    const req = window.indexedDB.open(toMatrixSdkIndexedDbName(dbName));
    req.addEventListener('error', () => finish(undefined, 'open_error'));
    req.addEventListener('success', () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains('sync')) {
          db.close();
          finish(undefined, 'no_sync_store');
          return;
        }

        const tx = db.transaction('sync', 'readonly');
        const store = tx.objectStore('sync');
        // matrix-js-sdk declares this store with keyPath: ['clobber'], so the IDB key is an array.
        const getReq = store.get(['-']);
        getReq.addEventListener('success', () => {
          db.close();
          const record = getReq.result;
          const roomsData = record?.roomsData;
          const joinedRooms = Object.keys(roomsData?.join ?? {}).length;
          const inviteRooms = Object.keys(roomsData?.invite ?? {}).length;
          const leftRooms = Object.keys(roomsData?.leave ?? {}).length;
          const totalRooms = joinedRooms + inviteRooms + leftRooms;
          finish(
            {
              nextBatch: typeof record?.nextBatch === 'string' && record.nextBatch.length > 0,
              joinedRooms,
              inviteRooms,
              leftRooms,
              totalRooms,
            },
            record ? 'found' : 'no_record'
          );
        });
        getReq.addEventListener('error', () => {
          db.close();
          finish(undefined, 'get_error');
        });
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
};

const sessionUsesFallbackStore = (userId: string): boolean => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  return sessions.some(
    (session) => session.userId === userId && session.fallbackSdkStores === true
  );
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
  session: Session,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken?: string) => void
): Promise<{ mx: MatrixClient; storeStartup: Promise<void> }> => {
  installMatrixEventTypeGuard();
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
  mxRef = mx;
  setSentryMatrixDeviceContext(mx, session);

  // Return both client and store startup promise for parallel initialization
  return { mx, storeStartup: indexedDBStore.startup() };
};

export const initClient = async (
  session: Session,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken?: string) => void
): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);
  setSentryMatrixDeviceContext(null, session);
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
    const result = await buildClient(session, onTokenRefresh);
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
    const result = await buildClient(session, onTokenRefresh);
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
    if (!isMismatch(err) && !isRecoverableStoreInitError(err)) {
      debugLog.error('sync', 'Failed to initialize stores', { error: err });
      throw err;
    }
    const recoveryReason = isMismatch(err) ? 'mismatch' : 'recoverable_indexeddb_error';
    log.warn(`initClient: ${recoveryReason} on parallel init — wiping and retrying:`, err);
    debugLog.warn('sync', 'Store init failure eligible for wipe-and-retry', {
      error: err,
      recoveryReason,
    });
    Sentry.addBreadcrumb({
      category: 'initMatrix',
      message: 'Store init failed - wiping local stores and retrying',
      level: 'warning',
      data: {
        recoveryReason,
        errorName: err instanceof Error ? err.name : 'Unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    mx.stopClient();
    await wipeAllStores();
    const result = await buildClient(session, onTokenRefresh);
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
  // MatrixRTC session state is observed by room rows, room headers, call views,
  // and the global call-signaling hook. Default EventEmitter limits are too low
  // for a large visible room list and produce noisy false-positive warnings.
  mx.matrixRTC?.setMaxListeners?.(100);
  return mx;
};

export type StartClientConfig = {
  baseUrl?: string;
  slidingSync?: SlidingSyncConfig;
  sessionSlidingSyncOptIn?: boolean;
  pollTimeoutMs?: number;
  timelineLimit?: number;
  clientScope?: MatrixClientScope;
};

export type ClientSyncDiagnostics = SyncTransportMeta & {
  requestedTransport: SyncTransport;
  syncState: string | null;
  sliding?: SlidingSyncDiagnostics;
};

const disposeSlidingSync = (mx: MatrixClient): void => {
  const manager = slidingSyncByClient.get(mx);
  if (!manager) return;
  manager.dispose();
  slidingSyncByClient.delete(mx);
};

const installClassicSyncNetworkReconnect = (mx: MatrixClient): void => {
  classicSyncNetworkCleanupByClient.get(mx)?.();
  let lastOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let lastForegroundRetryAt = 0;

  const requestClassicRetry = (trigger: 'network_change' | 'focus' | 'pageshow') => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;

    const now = Date.now();
    if (trigger !== 'network_change') {
      const sinceLastRetryMs = now - lastForegroundRetryAt;
      if (sinceLastRetryMs < CLASSIC_SYNC_FOREGROUND_RETRY_THROTTLE_MS) {
        debugLog.info('network', 'Skipped classic sync foreground retry because it was recent', {
          userId: mx.getUserId(),
          syncState: mx.getSyncState(),
          trigger,
          sinceLastRetryMs,
        });
        return false;
      }
    }

    lastForegroundRetryAt = now;
    const retried = mx.retryImmediately();
    debugLog.info('network', 'Triggered classic sync retry', {
      userId: mx.getUserId(),
      syncState: mx.getSyncState(),
      trigger,
      retried,
    });
    Sentry.metrics.count(
      trigger === 'network_change' ? 'sable.sync.network_retry' : 'sable.sync.foreground_retry',
      1,
      {
        attributes: { transport: 'classic', retried: String(retried), trigger },
      }
    );
    return true;
  };

  const retrySync = () => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const wasOnline = lastOnlineState;
    lastOnlineState = isOnline;

    if (!isOnline) {
      debugLog.warn('network', 'Device went offline - classic sync waiting for reconnect', {
        userId: mx.getUserId(),
        syncState: mx.getSyncState(),
      });
      return;
    }

    if (wasOnline) {
      debugLog.info('network', 'Ignored classic sync retry while already online', {
        userId: mx.getUserId(),
        syncState: mx.getSyncState(),
      });
      return;
    }

    requestClassicRetry('network_change');
  };
  const retrySyncOnFocus = () => {
    requestClassicRetry('focus');
  };
  const retrySyncOnPageShow = () => {
    requestClassicRetry('pageshow');
  };

  window.addEventListener('online', retrySync);
  window.addEventListener('offline', retrySync);
  window.addEventListener('focus', retrySyncOnFocus);
  window.addEventListener('pageshow', retrySyncOnPageShow);

  classicSyncNetworkCleanupByClient.set(mx, () => {
    window.removeEventListener('online', retrySync);
    window.removeEventListener('offline', retrySync);
    window.removeEventListener('focus', retrySyncOnFocus);
    window.removeEventListener('pageshow', retrySyncOnPageShow);
  });
};

export const getSlidingSyncManager = (mx: MatrixClient): SlidingSyncManager | undefined =>
  slidingSyncByClient.get(mx);

const startClientInternal = async (mx: MatrixClient, config?: StartClientConfig): Promise<void> => {
  setSentryMatrixDeviceContext(mx);
  debugLog.info('sync', 'Starting Matrix client', { userId: mx.getUserId() });
  Sentry.addBreadcrumb({
    category: 'sync.lifecycle',
    message: 'Starting Matrix client',
    level: 'info',
    data: {
      currentSyncState: mx.getSyncState(),
      clientRunning: mx.clientRunning,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    },
  });
  Sentry.metrics.count('sable.sync.start_client', 1, {
    attributes: {
      sync_state: mx.getSyncState() ?? 'unknown',
    },
  });

  disposeSlidingSync(mx);
  const slidingConfig = config?.slidingSync;
  const slidingEnabledOnServer = resolveSlidingEnabled(slidingConfig?.enabled);
  const slidingRequested = slidingEnabledOnServer && config?.sessionSlidingSyncOptIn === true;
  const proxyBaseUrl = slidingConfig?.proxyBaseUrl ?? config?.baseUrl;
  const slidingEndpointSource =
    slidingConfig?.proxyBaseUrl && slidingConfig.proxyBaseUrl !== config?.baseUrl
      ? 'legacy_proxy'
      : 'native_homeserver';
  const hasSlidingProxy = typeof proxyBaseUrl === 'string' && proxyBaseUrl.trim().length > 0;
  log.log('startClient sliding config', {
    userId: mx.getUserId(),
    enabled: slidingConfig?.enabled,
    enabledOnServer: slidingEnabledOnServer,
    sessionOptIn: config?.sessionSlidingSyncOptIn === true,
    requestedEnabled: slidingRequested,
    proxyBaseUrl,
    endpointSource: slidingEndpointSource,
    hasSlidingProxy,
  });
  debugLog.info('sync', 'Sliding sync configuration', {
    enabledOnServer: slidingEnabledOnServer,
    requested: slidingRequested,
    hasProxy: hasSlidingProxy,
    endpointSource: slidingEndpointSource,
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
    installClassicSyncNetworkReconnect(mx);

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
        const cryptoStoreErrorType = classifyCryptoStoreIndexedDbError(errorMsg);
        const isCryptoStoreError = cryptoStoreErrorType !== undefined;

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
              error_type: cryptoStoreErrorType,
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

  let slidingWarmCacheAtStart = mx.getRooms().length > 0;

  const shouldBootstrapClassicOnColdCache = async (): Promise<boolean> => {
    if (slidingConfig?.bootstrapClassicOnColdCache === false) return false;
    const userId = mx.getUserId();
    if (!userId) return false;

    // Primary signal: if the client already has rooms loaded from IndexedDB,
    // we definitely have a warm cache. This check happens AFTER store startup,
    // so rooms would be loaded if the database existed and was valid.
    const roomCount = mx.getRooms().length;
    const hasRoomsInMemory = roomCount > 0;

    // Secondary signal: inspect the SDK's persisted /sync snapshot directly.
    // MatrixClient.startClient() restores this data after this decision point,
    // so mx.getRooms() can still be empty even when the IndexedDB cache is warm.
    const shouldCheckFallbackSync = sessionUsesFallbackStore(userId);
    const [storedSync, fallbackStoredSync] = await Promise.all([
      readStoredSyncSummary(`sync${userId}`),
      shouldCheckFallbackSync
        ? readStoredSyncSummary('web-sync-store')
        : Promise.resolve(undefined),
    ]);
    const hasStoredSync =
      storedSync?.nextBatch === true ||
      fallbackStoredSync?.nextBatch === true ||
      (storedSync?.totalRooms ?? 0) > 0 ||
      (fallbackStoredSync?.totalRooms ?? 0) > 0;

    // Prioritize rooms in memory as the most reliable signal.
    // Fall back to the persisted sync snapshot if rooms aren't loaded yet.
    const hasWarmCache = hasRoomsInMemory || hasStoredSync;
    slidingWarmCacheAtStart = hasWarmCache;

    const cacheStatus = {
      userId,
      roomCount,
      hasRoomsInMemory,
      storedSyncRooms: storedSync?.totalRooms ?? 0,
      checkedFallbackStore: shouldCheckFallbackSync,
      fallbackStoredSyncRooms: fallbackStoredSync?.totalRooms ?? 0,
      storedSyncNextBatch: storedSync?.nextBatch === true,
      fallbackStoredSyncNextBatch: fallbackStoredSync?.nextBatch === true,
      hasWarmCache,
      willBootstrapClassic: !hasWarmCache,
      detection: hasRoomsInMemory ? 'rooms_in_memory' : hasStoredSync ? 'stored_sync' : 'no_cache',
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

  const manager = new SlidingSyncManager(
    mx,
    resolvedProxyBaseUrl,
    {
      ...slidingConfig,
      includeInviteList: true,
      pollTimeoutMs: slidingConfig?.pollTimeoutMs ?? SLIDING_SYNC_POLL_TIMEOUT_MS,
    },
    slidingWarmCacheAtStart
  );
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
      endpoint_source: slidingEndpointSource,
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

export const startClient = async (mx: MatrixClient, config?: StartClientConfig): Promise<void> => {
  const clientScope = config?.clientScope ?? 'app';
  if (clientScope !== 'app') {
    await startClientInternal(mx, config);
    return;
  }

  if (activeAppClientStopPromise) {
    await activeAppClientStopPromise;
  }

  if (activeAppClient === mx && activeAppClientStartPromise) {
    debugLog.warn('sync', 'Matrix client start already in progress; reusing pending start', {
      userId: mx.getUserId(),
    });
    Sentry.metrics.count('sable.sync.duplicate_start_suppressed', 1);
    await activeAppClientStartPromise;
    return;
  }

  if (activeAppClient && activeAppClient !== mx) {
    debugLog.warn('sync', 'Stopping previous app Matrix client before starting replacement', {
      previousUserId: activeAppClient.getUserId(),
      nextUserId: mx.getUserId(),
      previousSyncState: activeAppClient.getSyncState(),
      previousRunning: activeAppClient.clientRunning,
    });
    Sentry.addBreadcrumb({
      category: 'sync.lifecycle',
      message: 'Stopping previous app Matrix client before replacement start',
      level: 'warning',
      data: {
        previousUserId: activeAppClient.getUserId(),
        nextUserId: mx.getUserId(),
        previousSyncState: activeAppClient.getSyncState(),
        previousRunning: activeAppClient.clientRunning,
      },
    });
    Sentry.metrics.count('sable.sync.previous_app_client_stopped', 1);
    await stopClient(activeAppClient);
  }

  activeAppClient = mx;
  const startPromise = startClientInternal(mx, config);
  activeAppClientStartPromise = startPromise;
  try {
    await startPromise;
  } finally {
    if (activeAppClientStartPromise === startPromise) {
      activeAppClientStartPromise = undefined;
    }
  }
};

const settleClientStop = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
};

export const stopClient = (mx: MatrixClient): Promise<void> => {
  log.log('stopClient', mx.getUserId());
  debugLog.info('sync', 'Stopping client', { userId: mx.getUserId() });
  const meta = syncTransportByClient.get(mx);
  Sentry.addBreadcrumb({
    category: 'sync.lifecycle',
    message: 'Stopping Matrix client',
    level: 'info',
    data: {
      transport: meta?.transport ?? 'unknown',
      reason: meta?.reason ?? 'unknown',
      syncState: mx.getSyncState(),
      clientRunning: mx.clientRunning,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    },
  });
  Sentry.metrics.count('sable.sync.stop_client', 1, {
    attributes: {
      transport: meta?.transport ?? 'unknown',
      reason: meta?.reason ?? 'unknown',
      sync_state: mx.getSyncState() ?? 'unknown',
    },
  });
  fetchRoomEventStartupCleanupByClient.get(mx)?.();
  classicSyncNetworkCleanupByClient.get(mx)?.();
  classicSyncNetworkCleanupByClient.delete(mx);
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

  const stopPromise = settleClientStop();
  if (activeAppClient === mx) {
    activeAppClient = undefined;
    activeAppClientStartPromise = undefined;
    activeAppClientStopPromise = stopPromise;
    void stopPromise.finally(() => {
      if (activeAppClientStopPromise === stopPromise) {
        activeAppClientStopPromise = undefined;
      }
    });
  }
  return stopPromise;
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  log.log('clearCacheAndReload', mx.getUserId());
  await stopClient(mx);
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  await clearClientCachesAndServiceWorkers();
  reloadWithTelemetry('clear_cache_and_reload');
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
    requestedTransport: meta.slidingRequested ? 'sliding' : 'classic',
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
  await stopClient(mx);
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
  clearSentryMatrixDeviceContext();
  debugLog.info('general', 'Clearing all login data and reloading');
  const dbs = await window.indexedDB.databases();
  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) window.indexedDB.deleteDatabase(name);
  });
  window.localStorage.clear();

  await clearClientCachesAndServiceWorkers({ unregisterServiceWorkers: true });

  reloadWithTelemetry('clear_login_data', { unregisterServiceWorkers: true });
};
