import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TypedEventEmitter } from 'matrix-js-sdk/lib/models/typed-event-emitter';
import type { CryptoApi } from '$types/matrix-sdk';
import { CryptoEvent } from '$types/matrix-sdk';
import { useSessionBackupKeyUsable } from './useKeyBackup';

const sentry = vi.hoisted(() => ({
  addBreadcrumb: vi.fn<() => void>(),
  metrics: { count: vi.fn<() => void>() },
}));

vi.mock('@sentry/react', () => sentry);

const emitter = new TypedEventEmitter<string, Record<string, (...args: never[]) => void>>();

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => emitter,
}));

type CryptoParts = {
  key?: CryptoApi['getSessionBackupPrivateKey'];
  version?: CryptoApi['getActiveSessionBackupVersion'];
};

const createCrypto = ({ key, version }: CryptoParts) =>
  ({
    getSessionBackupPrivateKey:
      key ??
      vi.fn<CryptoApi['getSessionBackupPrivateKey']>().mockResolvedValue(new Uint8Array([1, 2, 3])),
    getActiveSessionBackupVersion:
      version ?? vi.fn<CryptoApi['getActiveSessionBackupVersion']>().mockResolvedValue('3'),
  }) as unknown as CryptoApi;

describe('useSessionBackupKeyUsable', () => {
  beforeEach(() => {
    emitter.removeAllListeners();
    sentry.addBreadcrumb.mockClear();
    sentry.metrics.count.mockClear();
  });

  it('reports true when both the key and the backup version are in the store', async () => {
    const { result } = renderHook(() => useSessionBackupKeyUsable(createCrypto({})));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports false when the store has no key', async () => {
    const crypto = createCrypto({
      key: vi.fn<CryptoApi['getSessionBackupPrivateKey']>().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useSessionBackupKeyUsable(crypto));

    await waitFor(() => expect(result.current).toBe(false));
  });

  // restoreKeyBackup raises "No decryption key found in crypto store" for a
  // missing version too, which getSessionBackupPrivateKey alone cannot see.
  it('reports false when the key is present but the backup version is not', async () => {
    const crypto = createCrypto({
      version: vi.fn<CryptoApi['getActiveSessionBackupVersion']>().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useSessionBackupKeyUsable(crypto));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('stays unknown rather than false when the lookup rejects', async () => {
    const crypto = createCrypto({
      key: vi
        .fn<CryptoApi['getSessionBackupPrivateKey']>()
        .mockRejectedValue(new Error('store closed')),
    });

    const { result } = renderHook(() => useSessionBackupKeyUsable(crypto));

    await waitFor(() => expect(crypto.getSessionBackupPrivateKey).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it('re-checks once the key gets cached', async () => {
    const crypto = createCrypto({
      key: vi
        .fn<CryptoApi['getSessionBackupPrivateKey']>()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(new Uint8Array([1])),
    });

    const { result } = renderHook(() => useSessionBackupKeyUsable(crypto));
    await waitFor(() => expect(result.current).toBe(false));

    emitter.emit(CryptoEvent.KeyBackupDecryptionKeyCached as never);

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('records when an available session backup key is lost', async () => {
    const key = vi
      .fn<CryptoApi['getSessionBackupPrivateKey']>()
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockResolvedValue(null);
    const crypto = createCrypto({ key });
    const { result } = renderHook(() => useSessionBackupKeyUsable(crypto));

    await waitFor(() => expect(result.current).toBe(true));
    emitter.emit(CryptoEvent.KeyBackupDecryptionKeyCached as never);

    await waitFor(() => expect(result.current).toBe(false));
    expect(sentry.metrics.count).toHaveBeenCalledWith('sable.crypto.session_backup_key_lost', 1);
  });

  it('records when a lookup fails after the backup key was available', async () => {
    const key = vi
      .fn<CryptoApi['getSessionBackupPrivateKey']>()
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockRejectedValue(new Error('store closed'));
    const crypto = createCrypto({ key });
    const { result } = renderHook(() => useSessionBackupKeyUsable(crypto));

    await waitFor(() => expect(result.current).toBe(true));
    emitter.emit(CryptoEvent.KeyBackupDecryptionKeyCached as never);

    await waitFor(() => expect(result.current).toBeUndefined());
    expect(sentry.metrics.count).toHaveBeenCalledWith(
      'sable.crypto.session_backup_key_lookup_failed',
      1
    );
  });
});
