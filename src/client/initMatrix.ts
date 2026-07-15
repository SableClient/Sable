import type {
  CryptoCallbacks,
  MatrixClient,
  MSC3575SlidingSyncRequest,
  MSC3575SlidingSyncResponse,
} from '$types/matrix-sdk';
import { createClient, IndexedDBStore, IndexedDBCryptoStore } from '$types/matrix-sdk';

import { clearNavToActivePathStore } from '$state/navToActivePath';
import type { Session, Sessions, SessionStoreName } from '$state/sessions';
import { getSessionStoreName, MATRIX_SESSIONS_KEY } from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import * as Sentry from '@sentry/react';
import { pushSessionToSW } from '../sw-session';
import { cryptoCallbacks } from './secretStorageKeys';
import type { SlidingSyncConfig, SlidingSyncDiagnostics } from './slidingSync';
import { SlidingSyncManager } from './slidingSync';
import { PresenceSyncManager } from './presenceSync';

const log = createLogger('initMatrix');
const debugLog = createDebugLogger('initMatrix');
const slidingSyncByClient = new WeakMap<MatrixClient, SlidingSyncManager>();
const presenceSyncByClient = new WeakMap<MatrixClient, PresenceSyncManager>();
const SLIDING_SYNC_POLL_TIMEOUT_MS = 20000;

type FetchRoomEventResult = Awaited<ReturnType<MatrixClient['fetchRoomEvent']>>;
type MatrixClientWithWritableFetchRoomEvent = MatrixClient & {
  fetchRoomEvent: (roomId: string, eventId: string) => Promise<FetchRoomEventResult>;
};

const fetchRoomEventStartupCleanupByClient = new WeakMap<MatrixClient, () => void>();

const slidingSyncConnIdCleanupByClient = new WeakMap<MatrixClient, () => void>();

type SlidingSyncMethod = (
  reqBody: MSC3575SlidingSyncRequest,
  proxyBaseUrl?: string,
  abortSignal?: AbortSignal
) => Promise<MSC3575SlidingSyncResponse>;

type MatrixClientWithWritableSlidingSync = MatrixClient & {
  slidingSync: SlidingSyncMethod;
};

type SlidingSyncRequestWithConnId = MSC3575SlidingSyncRequest & { conn_id?: string };

const SLIDING_SYNC_CONN_ID = 'sable-main';

function installSlidingSyncConnId(mx: MatrixClient): void {
  slidingSyncConnIdCleanupByClient.get(mx)?.();

  const mxWritable = mx as MatrixClientWithWritableSlidingSync;
  const original = mx.slidingSync.bind(mx) as SlidingSyncMethod;

  mxWritable.slidingSync = (reqBody, proxyBaseUrl, abortSignal) => {
    const req = reqBody as SlidingSyncRequestWithConnId;
    if (req.conn_id === undefined) {
      req.conn_id = SLIDING_SYNC_CONN_ID;
    }
    return original(reqBody, proxyBaseUrl, abortSignal);
  };

  slidingSyncConnIdCleanupByClient.set(mx, () => {
    slidingSyncConnIdCleanupByClient.delete(mx);
    mxWritable.slidingSync = original;
  });
}

function installStartupFetchRoomEventPatch(
  mx: MatrixClient,
  slidingSyncManager: SlidingSyncManager
): void {
  fetchRoomEventStartupCleanupByClient.get(mx)?.();

  const mxWritable = mx as MatrixClientWithWritableFetchRoomEvent;
  const origFetchRoomEvent = mx.fetchRoomEvent.bind(mx);

  const restore = () => {
    fetchRoomEventStartupCleanupByClient.delete(mx);
    mxWritable.fetchRoomEvent = origFetchRoomEvent;
  };

  mxWritable.fetchRoomEvent = (roomId: string, eventId: string) => {
    if (slidingSyncManager.isRoomActive(roomId)) {
      return origFetchRoomEvent(roomId, eventId);
    }
    const cachedEvent = mx.getRoom(roomId)?.findEventById(eventId);
    const payload: FetchRoomEventResult = cachedEvent?.event ?? {
      event_id: eventId,
      room_id: roomId,
    };
    return Promise.resolve(payload);
  };

  fetchRoomEventStartupCleanupByClient.set(mx, restore);
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
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = window.indexedDB.open(dbName);
    req.addEventListener('error', () => finish(undefined));
    req.addEventListener('success', () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains('account')) {
          db.close();
          finish(undefined);
        } else {
          const tx = db.transaction('account', 'readonly');
          const store = tx.objectStore('account');
          const getReq = store.get('account');
          getReq.addEventListener('success', () => {
            db.close();
            const record = getReq.result;
            if (!record?.account_data) {
              finish(undefined);
            } else {
              try {
                const data = JSON.parse(record.account_data);
                finish(data?.user_id ?? undefined);
              } catch {
                finish(undefined);
              }
            }
          });
          getReq.addEventListener('error', () => {
            db.close();
            finish(undefined);
          });
        }
      } catch {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        finish(undefined);
      }
    });
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
    cryptoCallbacks: cryptoCallbacks as unknown as CryptoCallbacks,
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
    await mx.initRustCrypto({
      cryptoDatabasePrefix: storeName.rustCryptoPrefix,
    });
  } catch (err) {
    if (!isMismatch(err)) {
      debugLog.error('sync', 'Failed to initialize crypto', { error: err });
      throw err;
    }
    log.warn('initClient: mismatch on initRustCrypto — wiping and retrying:', err);
    debugLog.warn('sync', 'Crypto init mismatch - wiping stores and retrying', {
      error: err,
    });
    mx.stopClient();
    await wipeAllStores();
    mx = await buildClient(session);
    await mx.initRustCrypto({
      cryptoDatabasePrefix: storeName.rustCryptoPrefix,
    });
  }

  mx.setMaxListeners(50);
  return mx;
};

export type StartClientConfig = {
  baseUrl?: string;
  slidingSync?: SlidingSyncConfig;
  sessionSlidingSyncOptIn?: boolean;
  pollTimeoutMs?: number;
  timelineLimit?: number;
};

export type ClientSyncDiagnostics = {
  transport: 'sliding' | 'classic';
  syncState: string | null;
  sliding?: SlidingSyncDiagnostics;
};

const disposeSlidingSync = (mx: MatrixClient): void => {
  const manager = slidingSyncByClient.get(mx);
  if (!manager) return;
  manager.dispose();
  slidingSyncByClient.delete(mx);
};

const disposePresenceSync = (mx: MatrixClient): void => {
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
  debugLog.info('sync', 'Starting Matrix client', { userId: mx.getUserId() });
  disposeSlidingSync(mx);
  disposePresenceSync(mx);

  const slidingConfig = config?.slidingSync;
  const proxyBaseUrl = slidingConfig?.proxyBaseUrl ?? config?.baseUrl ?? mx.baseUrl;
  const useSliding =
    config?.sessionSlidingSyncOptIn === true &&
    !!slidingConfig &&
    resolveSlidingEnabled(slidingConfig?.enabled);

  const presenceManager = new PresenceSyncManager(mx);
  presenceSyncByClient.set(mx, presenceManager);

  presenceManager.start();

  let manager: SlidingSyncManager | undefined;

  if (useSliding) {
    manager = new SlidingSyncManager(mx, proxyBaseUrl, {
      ...slidingConfig,
      includeInviteList: true,
      pollTimeoutMs: slidingConfig?.pollTimeoutMs ?? SLIDING_SYNC_POLL_TIMEOUT_MS,
    });

    installStartupFetchRoomEventPatch(mx, manager);
    installSlidingSyncConnId(mx);

    manager.attach();
    slidingSyncByClient.set(mx, manager);
  }

  try {
    await mx.startClient({
      lazyLoadMembers: true,
      slidingSync: manager?.slidingSync,
      threadSupport: true,
    });
  } catch (err) {
    debugLog.error('network', 'Failed to start client with sliding sync', {
      error: err instanceof Error ? err.message : String(err),
      userId: mx.getUserId(),
      proxyBaseUrl: useSliding ? proxyBaseUrl : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    });
    disposeSlidingSync(mx);
    disposePresenceSync(mx);
    throw err;
  }
};

export const stopClient = (mx: MatrixClient): void => {
  log.log('stopClient', mx.getUserId());
  debugLog.info('sync', 'Stopping client', { userId: mx.getUserId() });
  slidingSyncConnIdCleanupByClient.get(mx)?.();
  disposeSlidingSync(mx);
  disposePresenceSync(mx);
  mx.stopClient();
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  log.log('clearCacheAndReload', mx.getUserId());
  stopClient(mx);
  clearNavToActivePathStore(mx.getSafeUserId());
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
  window.location.reload();
};
