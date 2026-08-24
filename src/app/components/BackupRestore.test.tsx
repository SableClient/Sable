import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TypedEventEmitter } from 'matrix-js-sdk/lib/models/typed-event-emitter';
import type * as MatrixSdk from '$types/matrix-sdk';
import type { CryptoApi, CryptoBackend, KeyBackupInfo } from '$types/matrix-sdk';
import type { SecretStorageKeyContent } from '$types/matrix/accountData';
import { BackupRestoreTile } from './BackupRestore';

const decodeRecoveryKey = vi.hoisted(() => vi.fn<(key: string) => Uint8Array>());
const emitter = new TypedEventEmitter<string, Record<string, (...args: never[]) => void>>();
const mockClient = Object.assign(emitter, {
  secretStorage: { checkKey: vi.fn<() => Promise<boolean>>().mockResolvedValue(true) },
  getSafeUserId: () => '@me:example.org',
  getDeviceId: () => 'DEVICE',
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockClient,
}));

vi.mock('$types/matrix-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixSdk>()),
  decodeRecoveryKey,
}));

vi.mock('$client/secretStorageKeys', () => ({
  storePrivateKey: vi.fn<() => void>(),
}));

const KEY_ID = 'key-id';
const KEY_CONTENT = { algorithm: 'm.secret_storage.v1.aes-hmac-sha2' } as SecretStorageKeyContent;
const BACKUP_INFO = { version: '3', count: 42 } as KeyBackupInfo;

type CryptoOverrides = {
  backupInfo?: KeyBackupInfo | null;
  backupKey?: Uint8Array | null;
};

const createCrypto = ({ backupInfo = BACKUP_INFO, backupKey = null }: CryptoOverrides = {}) =>
  ({
    getActiveSessionBackupVersion: vi
      .fn<CryptoApi['getActiveSessionBackupVersion']>()
      .mockResolvedValue(backupInfo ? '3' : null),
    getKeyBackupInfo: vi.fn<CryptoApi['getKeyBackupInfo']>().mockResolvedValue(backupInfo),
    getSessionBackupPrivateKey: vi
      .fn<CryptoApi['getSessionBackupPrivateKey']>()
      .mockResolvedValue(backupKey),
    isKeyBackupTrusted: vi
      .fn<CryptoApi['isKeyBackupTrusted']>()
      .mockResolvedValue({ trusted: true, matchesDecryptionKey: true }),
    restoreKeyBackup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    processDeviceLists: vi.fn<CryptoBackend['processDeviceLists']>().mockResolvedValue(undefined),
    bootstrapCrossSigning: vi.fn<CryptoApi['bootstrapCrossSigning']>().mockResolvedValue(undefined),
    bootstrapSecretStorage: vi
      .fn<CryptoApi['bootstrapSecretStorage']>()
      .mockResolvedValue(undefined),
    setDeviceVerified: vi.fn<CryptoApi['setDeviceVerified']>().mockResolvedValue(undefined),
    loadSessionBackupPrivateKeyFromSecretStorage: vi
      .fn<CryptoApi['loadSessionBackupPrivateKeyFromSecretStorage']>()
      .mockResolvedValue(undefined),
  }) as unknown as CryptoBackend;

const recoveryPrompt = () => screen.queryByText(/does not hold the backup decryption key/i);

const submitRecoveryKey = (value: string) => {
  const input = document.querySelector('form input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  const form = input.closest('form') as HTMLFormElement;
  Object.defineProperty(form, input.name, { value: input, configurable: true });
  fireEvent.submit(form);
};

describe('BackupRestoreTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decodeRecoveryKey.mockReturnValue(new Uint8Array([1, 2, 3]));
  });

  it('offers recovery when a backup exists but its key is not in the crypto store', async () => {
    render(
      <BackupRestoreTile
        crypto={createCrypto({ backupKey: null })}
        secretStorageKeyId={KEY_ID}
        secretStorageKeyContent={KEY_CONTENT}
      />
    );

    await waitFor(() => expect(recoveryPrompt()).not.toBeNull());
    expect(screen.getByText('Recovery Key')).toBeTruthy();
  });

  it('restores cross-signing before unlocking the backup', async () => {
    const crypto = createCrypto({ backupKey: null });
    render(
      <BackupRestoreTile
        crypto={crypto}
        secretStorageKeyId={KEY_ID}
        secretStorageKeyContent={KEY_CONTENT}
      />
    );

    await waitFor(() => expect(recoveryPrompt()).not.toBeNull());
    submitRecoveryKey('valid-key');

    await waitFor(() =>
      expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalled()
    );
    expect(crypto.processDeviceLists).toHaveBeenCalledWith({ changed: ['@me:example.org'] });
    expect(crypto.bootstrapCrossSigning).toHaveBeenCalled();
    expect(crypto.setDeviceVerified).toHaveBeenCalledWith('@me:example.org', 'DEVICE');
    expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalled();
  });

  it('stays out of the way once the key is cached', async () => {
    render(
      <BackupRestoreTile
        crypto={createCrypto({ backupKey: new Uint8Array([1, 2, 3]) })}
        secretStorageKeyId={KEY_ID}
        secretStorageKeyContent={KEY_CONTENT}
      />
    );

    await waitFor(() => expect(screen.getByText('Encryption Backup')).toBeTruthy());
    expect(recoveryPrompt()).toBeNull();
  });

  it('does not offer recovery when the server has no backup at all', async () => {
    render(
      <BackupRestoreTile
        crypto={createCrypto({ backupInfo: null, backupKey: null })}
        secretStorageKeyId={KEY_ID}
        secretStorageKeyContent={KEY_CONTENT}
      />
    );

    await waitFor(() => expect(screen.getByText(/No backup present on server/i)).toBeTruthy());
    expect(recoveryPrompt()).toBeNull();
  });

  it('cannot offer recovery without secret storage configured', async () => {
    render(<BackupRestoreTile crypto={createCrypto({ backupKey: null })} />);

    await waitFor(() => expect(screen.getByText('Encryption Backup')).toBeTruthy());
    expect(recoveryPrompt()).toBeNull();
  });
});
