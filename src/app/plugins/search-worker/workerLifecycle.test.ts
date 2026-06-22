import { describe, expect, it, vi } from 'vitest';
import {
  buildSearchWorkerInitErrorMessage,
  buildSearchWorkerRuntimeErrorMessage,
  openSearchWorkerDb,
  type IDBOpenRequestLike,
} from './workerLifecycle';

function createOpenRequest() {
  const listeners: Partial<Record<'success' | 'error', () => void>> = {};
  const close = vi.fn<() => void>();
  const request: IDBOpenRequestLike = {
    result: { close } as unknown as IDBDatabase,
    error: null,
    onupgradeneeded: null,
    onblocked: null,
    addEventListener(type, listener) {
      listeners[type] = () => listener();
    },
  };

  return {
    request,
    close,
    fireSuccess: () => listeners.success?.(),
    fireError: () => listeners.error?.(),
    fireBlocked: () =>
      request.onblocked?.({ oldVersion: 0, newVersion: 1 } as IDBVersionChangeEvent),
  };
}

describe('buildSearchWorkerRuntimeErrorMessage', () => {
  it('uses the worker error message when available', () => {
    expect(buildSearchWorkerRuntimeErrorMessage({ message: 'boom' })).toBe(
      'Search worker runtime error: boom'
    );
  });

  it('falls back to filename and coordinates for empty worker errors', () => {
    expect(
      buildSearchWorkerRuntimeErrorMessage({
        message: '',
        filename: 'worker.js',
        lineno: 12,
        colno: 8,
      })
    ).toBe('Search worker runtime error: Unknown worker error (worker.js:12:8)');
  });
});

describe('buildSearchWorkerInitErrorMessage', () => {
  it('normalizes init failures into a stable message', () => {
    expect(buildSearchWorkerInitErrorMessage(new Error('IndexedDB open blocked'))).toBe(
      'Search worker initialization failed: IndexedDB open blocked'
    );
  });
});

describe('openSearchWorkerDb', () => {
  it('resolves when indexedDB open succeeds', async () => {
    const { request, fireSuccess } = createOpenRequest();
    const indexedDb = { open: vi.fn<() => IDBOpenRequestLike>(() => request) };

    const promise = openSearchWorkerDb(indexedDb, 'sable-search-test', 1000);
    fireSuccess();

    await expect(promise).resolves.toBe(request.result);
  });

  it('keeps waiting when indexedDB open is blocked and later succeeds', async () => {
    const { request, fireBlocked, fireSuccess } = createOpenRequest();
    const indexedDb = { open: vi.fn<() => IDBOpenRequestLike>(() => request) };

    const promise = openSearchWorkerDb(indexedDb, 'sable-search-test', 1000);
    fireBlocked();
    fireSuccess();

    await expect(promise).resolves.toBe(request.result);
  });

  it('rejects when indexedDB open never settles', async () => {
    vi.useFakeTimers();
    const { request, close, fireSuccess } = createOpenRequest();
    const indexedDb = { open: vi.fn<() => IDBOpenRequestLike>(() => request) };

    const promise = openSearchWorkerDb(indexedDb, 'sable-search-test', 50);
    const rejection = promise.then(
      () => {
        throw new Error('Expected indexedDB open to time out');
      },
      (error) => error
    );
    await vi.advanceTimersByTimeAsync(50);

    await expect(rejection).resolves.toMatchObject({
      message: 'IndexedDB open timed out after 50ms for sable-search-test',
    });
    fireSuccess();
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
