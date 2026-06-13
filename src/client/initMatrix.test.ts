import * as Sentry from '@sentry/react';
import type { MatrixClient } from '$types/matrix-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSentryMatrixDeviceContext,
  resolveRefreshToken,
  setSentryMatrixDeviceContext,
  startClient,
  stopClient,
} from './initMatrix';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<(breadcrumb: unknown) => void>(),
  captureMessage: vi.fn<(message: string, options?: unknown) => void>(),
  metrics: {
    count: vi.fn<(name: string, value?: number, options?: unknown) => void>(),
    distribution: vi.fn<(name: string, value: number, options?: unknown) => void>(),
  },
  startInactiveSpan: vi.fn<
    () => { setAttribute: (key: string, value: unknown) => void; end: () => void }
  >(() => ({
    setAttribute: vi.fn<(key: string, value: unknown) => void>(),
    end: vi.fn<() => void>(),
  })),
  setTag: vi.fn<(key: string, value: string) => void>(),
}));

type MockMatrixClient = MatrixClient & {
  startClient: ReturnType<typeof vi.fn<() => Promise<void>>>;
  stopClient: ReturnType<typeof vi.fn<() => void>>;
};

const startedClients: MockMatrixClient[] = [];

const makeClient = (
  userId: string,
  startPromise: Promise<void> = Promise.resolve()
): MockMatrixClient =>
  ({
    clientRunning: false,
    fetchRoomEvent: vi.fn<() => Promise<unknown>>(),
    getDeviceId: vi.fn<() => string>(() => `${userId}:DEVICE`),
    getRoom: vi.fn<() => undefined>(() => undefined),
    getRooms: vi.fn<() => unknown[]>(() => []),
    getSyncState: vi.fn<() => null>(() => null),
    getUserId: vi.fn<() => string>(() => userId),
    off: vi.fn<(...args: unknown[]) => void>(),
    on: vi.fn<(...args: unknown[]) => void>(),
    removeAllListeners: vi.fn<() => void>(),
    removeListener: vi.fn<(...args: unknown[]) => void>(),
    startClient: vi.fn<() => Promise<void>>(() => startPromise),
    stopClient: vi.fn<() => void>(),
  }) as unknown as MockMatrixClient;

const makeDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const startClassicClient = async (mx: MockMatrixClient): Promise<void> => {
  startedClients.push(mx);
  await startClient(mx, {
    slidingSync: { enabled: false },
  });
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const waitForStopSettlement = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await flushMicrotasks();
};

afterEach(async () => {
  const clients = startedClients.splice(0);
  await Promise.all(clients.map((mx) => stopClient(mx)));
});

describe('resolveRefreshToken', () => {
  it('keeps the current refresh token when the homeserver omits refresh_token', () => {
    expect(resolveRefreshToken('refresh-2')).toBe('refresh-2');
    expect(resolveRefreshToken('refresh-2', 'refresh-3')).toBe('refresh-3');
  });
});

describe('setSentryMatrixDeviceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets matrix.device_id from the Matrix client', () => {
    setSentryMatrixDeviceContext({ getDeviceId: () => 'CLIENTDEVICE' });

    expect(Sentry.setTag).toHaveBeenCalledWith('matrix.device_id', 'CLIENTDEVICE');
  });

  it('falls back to the session device ID before the SDK client is available', () => {
    setSentryMatrixDeviceContext(null, { deviceId: 'SESSIONDEVICE' });

    expect(Sentry.setTag).toHaveBeenCalledWith('matrix.device_id', 'SESSIONDEVICE');
  });

  it('does not overwrite the tag when no device ID is available', () => {
    setSentryMatrixDeviceContext({ getDeviceId: () => null }, null);

    expect(Sentry.setTag).not.toHaveBeenCalled();
  });

  it('clears the device ID tag for full login data clears', () => {
    clearSentryMatrixDeviceContext();

    expect(Sentry.setTag).toHaveBeenCalledWith('matrix.device_id', 'none');
  });
});

describe('startClient app singleton gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses a pending app start for the same MatrixClient', async () => {
    const deferred = makeDeferred();
    const mx = makeClient('@alice:example.com', deferred.promise);

    const firstStart = startClassicClient(mx);
    await flushMicrotasks();
    const secondStart = startClassicClient(mx);
    await flushMicrotasks();

    expect(mx.startClient).toHaveBeenCalledTimes(1);
    deferred.resolve();
    await Promise.all([firstStart, secondStart]);
  });

  it('stops the previous app client before starting a replacement', async () => {
    const deferred = makeDeferred();
    const first = makeClient('@alice:example.com', deferred.promise);
    const second = makeClient('@bob:example.com');

    const firstStart = startClassicClient(first);
    await flushMicrotasks();
    const secondStart = startClassicClient(second);
    await flushMicrotasks();

    expect(first.stopClient).toHaveBeenCalledTimes(1);
    expect(second.startClient).not.toHaveBeenCalled();

    await waitForStopSettlement();
    expect(second.startClient).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await Promise.all([firstStart, secondStart]);
  });
});
