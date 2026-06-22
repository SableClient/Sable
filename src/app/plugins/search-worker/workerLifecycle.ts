export const SEARCH_WORKER_DB_VERSION = 3;
export const SEARCH_WORKER_IDB_OPEN_TIMEOUT_MS = 10_000;

type RequestListener = (event?: Event) => void;

export type IDBOpenRequestLike = {
  result: IDBDatabase;
  error: DOMException | null;
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null;
  onblocked: ((event: IDBVersionChangeEvent) => void) | null;
  addEventListener(type: 'success' | 'error', listener: RequestListener): void;
};

export type IndexedDBLike = {
  open(name: string, version: number): IDBOpenRequestLike;
};

function formatCause(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildSearchWorkerRuntimeErrorMessage(error: {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}): string {
  const message = error.message?.trim();
  if (message) return `Search worker runtime error: ${message}`;

  const location =
    error.filename && error.lineno && error.colno
      ? ` (${error.filename}:${error.lineno}:${error.colno})`
      : error.filename
        ? ` (${error.filename})`
        : '';
  return `Search worker runtime error: Unknown worker error${location}`;
}

export function buildSearchWorkerInitErrorMessage(err: unknown): string {
  return `Search worker initialization failed: ${formatCause(err)}`;
}

export function openSearchWorkerDb(
  indexedDb: IndexedDBLike,
  dbName: string,
  timeoutMs = SEARCH_WORKER_IDB_OPEN_TIMEOUT_MS,
  onUpgradeNeeded?: (event: IDBVersionChangeEvent, db: IDBDatabase) => void
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDb.open(dbName, SEARCH_WORKER_DB_VERSION);
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      settle(() =>
        reject(new Error(`IndexedDB open timed out after ${timeoutMs}ms for ${dbName}`))
      );
    }, timeoutMs);

    req.onupgradeneeded = (event) => {
      onUpgradeNeeded?.(event, req.result);
    };

    req.onblocked = () => {
      settle(() => reject(new Error(`IndexedDB open blocked for ${dbName}`)));
    };

    req.addEventListener('success', () => settle(() => resolve(req.result)));
    req.addEventListener('error', () =>
      settle(() => reject(req.error ?? new Error(`IndexedDB open failed for ${dbName}`)))
    );
  });
}
