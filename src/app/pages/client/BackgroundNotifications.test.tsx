import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatrixEventEvent } from '$types/matrix-sdk';
import type { MatrixEvent } from '$types/matrix-sdk';
import { onceDecryptedWithTimeout } from './BackgroundNotifications';

const makeEvent = () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const event = {
    once: vi.fn<(name: string, fn: (...args: unknown[]) => void) => void>((name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(fn);
    }),
    removeListener: vi.fn<(name: string, fn: (...args: unknown[]) => void) => void>((name, fn) => {
      listeners.get(name)?.delete(fn);
    }),
    emitDecrypted: () => {
      const fns = [...(listeners.get(MatrixEventEvent.Decrypted) ?? [])];
      listeners.get(MatrixEventEvent.Decrypted)?.clear(); // once semantics
      fns.forEach((fn) => fn());
    },
    listenerCount: (name: string) => listeners.get(name)?.size ?? 0,
  };
  return event as unknown as MatrixEvent & {
    emitDecrypted: () => void;
    listenerCount: (name: string) => number;
  };
};

describe('onceDecryptedWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onDecrypted and does not run onTimeout when the event decrypts', () => {
    const event = makeEvent();
    const onDecrypted = vi.fn<() => void>();
    const onTimeout = vi.fn<() => void>();

    onceDecryptedWithTimeout(event, onDecrypted, onTimeout);
    event.emitDecrypted();
    vi.advanceTimersByTime(120_000);

    expect(onDecrypted).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('removes the listener and runs onTimeout when the event never decrypts', () => {
    const event = makeEvent();
    const onDecrypted = vi.fn<() => void>();
    const onTimeout = vi.fn<() => void>();

    onceDecryptedWithTimeout(event, onDecrypted, onTimeout, 60_000);
    expect(event.listenerCount(MatrixEventEvent.Decrypted)).toBe(1);

    vi.advanceTimersByTime(60_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onDecrypted).not.toHaveBeenCalled();
    expect(event.listenerCount(MatrixEventEvent.Decrypted)).toBe(0);
  });

  it('cancel removes the listener and prevents both callbacks', () => {
    const event = makeEvent();
    const onDecrypted = vi.fn<() => void>();
    const onTimeout = vi.fn<() => void>();

    const cancel = onceDecryptedWithTimeout(event, onDecrypted, onTimeout, 60_000);
    cancel();

    expect(event.listenerCount(MatrixEventEvent.Decrypted)).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(onDecrypted).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
