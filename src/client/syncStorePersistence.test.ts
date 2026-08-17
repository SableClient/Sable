import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { disposeSyncStorePersistence, installSyncStorePersistence } from './syncStorePersistence';

const USER_ID = '@me:example.org';

const receipt = (userId: string): MatrixEvent =>
  ({
    getContent: () => ({
      $event: { 'm.read': { [userId]: { ts: 1 } } },
    }),
  }) as unknown as MatrixEvent;

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
};

const hide = () => {
  setVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
};

const show = () => {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
};

const saveMock = () => vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

const fakeClient = (save = saveMock(), userId: string | null = USER_ID) => {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    store: { save },
    getUserId: () => userId,
  }) as unknown as MatrixClient;
};

const emitReceipt = (mx: MatrixClient, userId = USER_ID) => {
  (mx as unknown as EventEmitter).emit(RoomEvent.Receipt, receipt(userId));
};

const clients: MatrixClient[] = [];
const install = (mx: MatrixClient) => {
  clients.push(mx);
  installSyncStorePersistence(mx);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  setVisibility('visible');
});

afterEach(() => {
  clients.splice(0).forEach(disposeSyncStorePersistence);
  vi.useRealTimers();
});

describe('installSyncStorePersistence', () => {
  it('forces a store write when the app is hidden', () => {
    const save = saveMock();
    install(fakeClient(save));

    hide();

    expect(save).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('forces a store write when the page goes away', () => {
    const save = saveMock();
    install(fakeClient(save));

    window.dispatchEvent(new Event('pagehide'));

    expect(save).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('does not write while the app stays visible', () => {
    const save = saveMock();
    install(fakeClient(save));

    show();

    expect(save).not.toHaveBeenCalled();
  });

  it('throttles bursts of hide events', async () => {
    const save = saveMock();
    install(fakeClient(save));

    hide();
    await vi.advanceTimersByTimeAsync(0);
    show();
    hide();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes again once the throttle window has passed', async () => {
    const save = saveMock();
    install(fakeClient(save));

    hide();
    await vi.advanceTimersByTimeAsync(5000);
    show();
    hide();

    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not stack writes while one is in flight', async () => {
    let release: (() => void) | undefined;
    const save = vi.fn<() => Promise<void>>().mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    install(fakeClient(save));

    hide();
    await vi.advanceTimersByTimeAsync(6000);
    show();
    hide();
    expect(save).toHaveBeenCalledTimes(1);

    release?.();
    await vi.advanceTimersByTimeAsync(6000);
    show();
    hide();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('swallows a failed write', async () => {
    const save = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('quota exceeded'));
    install(fakeClient(save));

    hide();
    await vi.advanceTimersByTimeAsync(6000);

    show();
    hide();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('stops writing after dispose', () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);

    disposeSyncStorePersistence(mx);
    hide();
    window.dispatchEvent(new Event('pagehide'));

    expect(save).not.toHaveBeenCalled();
  });

  it('writes after our own receipt settles', async () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);

    emitReceipt(mx);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('coalesces a burst of receipts into one write', async () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);

    emitReceipt(mx);
    await vi.advanceTimersByTimeAsync(30000);
    emitReceipt(mx);
    await vi.advanceTimersByTimeAsync(30000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('ignores receipts from other users', async () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);

    emitReceipt(mx, '@someone:example.org');
    await vi.advanceTimersByTimeAsync(60000);

    expect(save).not.toHaveBeenCalled();
  });

  it('retries when the receipt write lands inside the throttle window', async () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);

    emitReceipt(mx);
    await vi.advanceTimersByTimeAsync(59000);
    hide();
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('drops a pending receipt write after dispose', async () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);

    emitReceipt(mx);
    disposeSyncStorePersistence(mx);
    await vi.advanceTimersByTimeAsync(60000);

    expect(save).not.toHaveBeenCalled();
  });

  it('does not double-register when installed twice', () => {
    const save = saveMock();
    const mx = fakeClient(save);
    install(mx);
    install(mx);

    hide();

    expect(save).toHaveBeenCalledTimes(1);
  });
});
