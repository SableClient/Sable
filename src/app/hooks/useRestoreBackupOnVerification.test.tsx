import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TypedEventEmitter } from 'matrix-js-sdk/lib/models/typed-event-emitter';
import { Provider, useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { CryptoEvent } from '$types/matrix-sdk';
import { backupRestoreErrorAtom } from '$state/backupRestore';
import { useRestoreBackupOnVerification } from './useRestoreBackupOnVerification';

const restoreKeyBackup = vi.fn<() => Promise<void>>();
const emitter = new TypedEventEmitter<string, Record<string, (...args: never[]) => void>>();
const mockClient = Object.assign(emitter, {
  getCrypto: () => ({ restoreKeyBackup }),
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockClient,
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<() => void>(),
  metrics: { count: vi.fn<() => void>() },
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}

const useSubject = () => {
  useRestoreBackupOnVerification();
  return useAtomValue(backupRestoreErrorAtom);
};

const emitKeyCached = () => emitter.emit(CryptoEvent.KeyBackupDecryptionKeyCached as never);

describe('useRestoreBackupOnVerification', () => {
  beforeEach(() => {
    restoreKeyBackup.mockReset();
  });

  it('surfaces a restore failure instead of rejecting silently', async () => {
    restoreKeyBackup.mockRejectedValue(new Error('No decryption key found in crypto store'));

    const { result } = renderHook(useSubject, { wrapper: Wrapper });
    emitKeyCached();

    await waitFor(() => expect(result.current).toBe('No decryption key found in crypto store'));
  });

  it('leaves no error behind on a successful restore', async () => {
    restoreKeyBackup.mockResolvedValue(undefined);

    const { result } = renderHook(useSubject, { wrapper: Wrapper });
    emitKeyCached();

    await waitFor(() => expect(restoreKeyBackup).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it('clears a previous failure when a later restore is attempted', async () => {
    restoreKeyBackup.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(useSubject, { wrapper: Wrapper });
    emitKeyCached();
    await waitFor(() => expect(result.current).toBe('boom'));

    restoreKeyBackup.mockResolvedValue(undefined);
    emitKeyCached();

    await waitFor(() => expect(result.current).toBeUndefined());
  });
});
